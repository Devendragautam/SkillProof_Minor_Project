import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import { canonicalizeSkill, LEVEL_ORDER } from "@/lib/skills";
import { buildStarters } from "@/lib/server/starters";
import { policyLimitFor } from "@/lib/server/timer-policy";
import {
  activeFlagFor,
  deadlineFor,
  InvalidTransitionError,
  remainingSec,
} from "@/lib/server/assessment-state";
import { SQL_STARTER } from "@/lib/code-languages";
import type { AssessmentPlan, ClaimedLevel, ClientQuestion, Difficulty, PaletteRow, SkillPlanItem } from "@/lib/types";

export interface SelectedSkill {
  skill: string;
  level: ClaimedLevel;
}

export interface PlanItemInternal extends SkillPlanItem {
  qSkills: string[];
  pools: Array<"coding" | "debugging" | "mcq">;
}

export const MAX_QUESTIONS = 10;

/** Build the personalized assessment plan from selected skills */
export async function buildPlan(selected: SelectedSkill[]): Promise<{ items: PlanItemInternal[]; skipped: string[] }> {
  await ensureSeed();
  const items: PlanItemInternal[] = [];
  const skipped: string[] = [];

  const sorted = [...selected].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);

  for (const sel of sorted) {
    const entry = canonicalizeSkill(sel.skill);
    if (!entry) {
      skipped.push(sel.skill);
      continue;
    }
    const avail = {
      coding: await countQuestions(entry.questionSkills, "coding"),
      debugging: await countQuestions(entry.questionSkills, "debugging"),
      mcq: await countQuestions(entry.questionSkills, "mcq"),
    };

    const base: Record<ClaimedLevel, { coding: number; debugging: number; mcq: number }> = {
      Advanced: { coding: 2, debugging: 1, mcq: 2 },
      Intermediate: { coding: 1, debugging: 1, mcq: 2 },
      Basic: { coding: 1, debugging: 0, mcq: 1 },
    };

    const counts = {
      coding: Math.min(base[sel.level].coding, avail.coding),
      debugging: Math.min(base[sel.level].debugging, avail.debugging),
      mcq: Math.min(base[sel.level].mcq, avail.mcq),
    };
    if (counts.coding + counts.debugging + counts.mcq === 0) {
      skipped.push(sel.skill);
      continue;
    }
    items.push({
      skill: entry.name,
      claimedLevel: sel.level,
      qSkills: entry.questionSkills,
      pools: entry.pools,
      ...counts,
    });
  }

  // merge duplicate skills — resumes often list the same skill twice
  // (e.g. "DBMS" + "Databases" both canonicalize to DBMS)
  const mergedItems = new Map<string, PlanItemInternal>();
  for (const item of items) {
    const cur = mergedItems.get(item.skill);
    if (!cur) {
      mergedItems.set(item.skill, item);
      continue;
    }
    if (LEVEL_ORDER[item.claimedLevel] > LEVEL_ORDER[cur.claimedLevel]) cur.claimedLevel = item.claimedLevel;
    cur.coding = Math.max(cur.coding, item.coding);
    cur.debugging = Math.max(cur.debugging, item.debugging);
    cur.mcq = Math.max(cur.mcq, item.mcq);
  }
  const deduped = Array.from(mergedItems.values());

  // enforce global cap: trim mcq first, then debugging, then coding
  let total = deduped.reduce((a, i) => a + i.coding + i.debugging + i.mcq, 0);
  let guard = 0;
  while (total > MAX_QUESTIONS && guard < 200) {
    guard++;
    const trimOrder: Array<"mcq" | "debugging" | "coding"> = ["mcq", "debugging", "coding"];
    let trimmed = false;
    for (const kind of trimOrder) {
      const cand = deduped
        .filter((i) => i[kind] > 1 || (i[kind] === 1 && i.coding + i.debugging + i.mcq > 1))
        .sort((a, b) => b[kind] - a[kind])[0];
      if (cand) {
        cand[kind]--;
        total--;
        trimmed = true;
        break;
      }
    }
    if (!trimmed) break;
  }

  return { items: deduped, skipped };
}

async function countQuestions(skills: string[], category: string): Promise<number> {
  const rows = await db.question.findMany({
    where: { skill: { in: skills }, category },
    select: { externalId: true },
  });
  return rows.length;
}

export function difficultyFor(level: ClaimedLevel): Difficulty {
  return level === "Advanced" ? "medium" : "easy";
}

export async function loadPlan(assessmentId: string) {
  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    include: { questions: true, candidate: true },
  });
  if (!assessment) return null;
  const plan = JSON.parse(assessment.planJson) as AssessmentPlan & { items?: PlanItemInternal[] };
  return { assessment, plan, items: (plan.items ?? []) as PlanItemInternal[] };
}

async function findCandidates(qSkills: string[], category: string, difficulty: string | null) {
  const where = difficulty
    ? { skill: { in: qSkills }, category, difficulty }
    : { skill: { in: qSkills }, category };
  return db.question.findMany({ where });
}

function toClientQuestion(aq: {
  id: string;
  order: number;
  skill: string;
  hintCount: number;
  status: string;
  dealtAt: Date | null;
  deadlineAt: Date | null;
  createdAt: Date;
  /** Effective limit snapshotted from the recruiter's timer policy at deal time */
  timeLimitSec: number | null;
  question: {
    externalId: string;
    category: string;
    topic: string;
    difficulty: string;
    title: string;
    description: string;
    fnName: string | null;
    starterCode: string | null;
    testsJson: string | null;
    optionsJson: string | null;
    hint: string | null;
    timeLimitSec: number;
    points: number;
    schemaSql: string | null;
  };
}): ClientQuestion {
  const q = aq.question;
  const tests: Array<{ hidden: boolean }> = q.testsJson ? JSON.parse(q.testsJson) : [];
  const options: string[] | null = q.optionsJson ? JSON.parse(q.optionsJson) : null;
  // language choice: SQL questions run in SQLite only; coding questions offer
  // JS/Python (+C++/Java when a typed signature is inferable); debugging
  // questions are JavaScript-only (the buggy implementation can't be translated)
  const bundle = q.schemaSql
    ? {
        starters: { sql: q.starterCode?.trim() ? q.starterCode : SQL_STARTER } as Partial<Record<string, string>>,
        languages: ["sql"] as string[],
      }
    : q.category === "coding" && q.fnName && q.testsJson
      ? buildStarters(q.fnName, q.starterCode, JSON.parse(q.testsJson))
      : { starters: {}, languages: ["javascript"] as string[] };
  // server-authoritative countdown seed: the browser timer is ONLY a visual
  // representation — it initializes from this value, never from its own clock
  const remaining = remainingSec(aq) ?? aq.timeLimitSec ?? q.timeLimitSec;
  return {
    aqId: aq.id,
    externalId: q.externalId,
    skill: aq.skill,
    category: q.category as ClientQuestion["category"],
    topic: q.topic,
    difficulty: q.difficulty as Difficulty,
    title: q.title,
    description: q.description,
    fnName: q.fnName ?? undefined,
    starterCode: q.starterCode ?? undefined,
    schemaSql: q.schemaSql ?? undefined,
    language: "javascript",
    languages: bundle.languages,
    starters: bundle.starters,
    // policy limit wins: snapshotted onto the AssessmentQuestion when dealt
    timeLimitSec: aq.timeLimitSec ?? q.timeLimitSec,
    remainingSec: remaining,
    points: q.points,
    visibleTestCount: tests.filter((t) => !t.hidden).length,
    options: options ?? undefined,
    order: aq.order,
    hasHint: !!q.hint,
    hintsUsed: aq.hintCount,
  };
}

/**
 * Pick and deal the next question for the assessment, adapting difficulty
 * based on the previous result. Returns `done: true` when the plan is finished.
 *
 * Concurrency: at most ONE active question per assessment can ever exist —
 * the create stamps activeFlag = assessmentId, backed by the
 * @@unique([assessmentId, activeFlag]) invariant. Two simultaneous "next"
 * requests race on that unique index; the loser retries and is re-served the
 * already-active question instead of creating a second one.
 */
export async function dealNextQuestion(
  assessmentId: string,
  lastResult?: { skill?: string; result?: "solved_fast" | "solved" | "partial" | "failed" },
  _retries = 0
): Promise<{ question: ClientQuestion | null; done: boolean }> {
  try {
    return await dealNextInner(assessmentId, lastResult);
  } catch (err) {
    const conflict =
      typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
    if (conflict && _retries < 2) {
      // another concurrent request won the active slot — re-serve it
      return dealNextQuestion(assessmentId, undefined, _retries + 1);
    }
    throw err;
  }
}

async function dealNextInner(
  assessmentId: string,
  lastResult?: { skill?: string; result?: "solved_fast" | "solved" | "partial" | "failed" }
): Promise<{ question: ClientQuestion | null; done: boolean }> {
  const loaded = await loadPlan(assessmentId);
  if (!loaded) throw new Error("Assessment not found");
  const { assessment, plan, items } = loaded;

  if (assessment.status !== "in_progress") {
    throw new InvalidTransitionError("This assessment is already completed");
  }

  const fullRows = await db.assessmentQuestion.findMany({
    where: { assessmentId },
    include: { question: true },
  });
  const askedExternal = new Set(fullRows.map((aq) => aq.question.externalId));

  // resume support: a dealt-but-unanswered question is re-served on refresh
  // (server deadline keeps ticking — the browser cannot reset it)
  const pendingAq = fullRows.find((aq) => aq.status === "current");
  if (pendingAq) {
    return { done: false, question: toClientQuestion(pendingAq) };
  }

  // adaptive difficulty adjustment
  if (lastResult?.skill && lastResult.result) {
    const cur = plan.currentDifficulty[lastResult.skill] ?? "easy";
    const order: Difficulty[] = ["easy", "medium", "hard"];
    let idx = order.indexOf(cur as Difficulty);
    if (idx < 0) idx = 0;
    if (lastResult.result === "solved_fast") idx = Math.min(idx + 1, 2);
    if (lastResult.result === "failed") idx = Math.max(idx - 1, 0);
    plan.currentDifficulty[lastResult.skill] = order[idx];
  }

  // find next pending slot: iterate skills in plan order, coding → debugging → mcq
  let target: { item: PlanItemInternal; kind: "coding" | "debugging" | "mcq" } | null = null;
  for (const item of items) {
    for (const kind of ["coding", "debugging", "mcq"] as const) {
      if (!item.pools.includes(kind)) continue;
      const askedOfKind = fullRows.filter((aq) => aq.skill === item.skill && aq.question.category === kind).length;
      if (askedOfKind < item[kind]) {
        target = { item, kind };
        break;
      }
    }
    if (target) break;
  }

  if (!target) {
    // fresh plan exhausted — park the adaptive state, then return the candidate
    // to the earliest question they skipped (skip-and-come-back flow)
    const earliestSkipped = fullRows
      .filter((aq) => aq.status === "skipped")
      .sort((a, b) => a.order - b.order)[0];
    if (earliestSkipped) {
      const revived = await reviveSkipped(earliestSkipped.id, assessmentId);
      return { done: false, question: revived };
    }
    await db.assessment.update({ where: { id: assessmentId }, data: { planJson: JSON.stringify(plan) } });
    return { question: null, done: true };
  }

  const { item, kind } = target;
  const preferred = plan.currentDifficulty[item.skill] ?? difficultyFor(item.claimedLevel);

  let candidates = await findCandidates(item.qSkills, kind, preferred);
  if (!candidates.length) candidates = await findCandidates(item.qSkills, kind, null);
  if (!candidates.length) {
    // impossible quota — mark satisfied so we don't loop forever
    item[kind] = fullRows.filter((aq) => aq.skill === item.skill && aq.question.category === kind).length;
    await db.assessment.update({ where: { id: assessmentId }, data: { planJson: JSON.stringify(plan) } });
    return dealNextQuestion(assessmentId);
  }

  // ── exposure balance ────────────────────────────────────────────────────
  // Uniform random over-wears the head of the bank (calibration showed 50 of
  // 78 questions never dealt). Instead, count how often each candidate has
  // been dealt across ALL assessments and pick among the least-dealt —
  // random tie-break keeps unpredictability, the groupBy keeps it one query.
  const fresh = candidates.filter((c) => !askedExternal.has(c.externalId));
  if (!fresh.length) {
    // Every matching question was already dealt in this run — re-serving one
    // would double-count it and skew its calibration. Treat the remaining
    // slot as impossible (same policy as the empty-pool guard above): park
    // the quota and deal onward. lastResult is intentionally NOT re-passed —
    // the adaptive step already ran earlier in this call.
    item[kind] = fullRows.filter((aq) => aq.skill === item.skill && aq.question.category === kind).length;
    await db.assessment.update({ where: { id: assessmentId }, data: { planJson: JSON.stringify(plan) } });
    return dealNextQuestion(assessmentId);
  }
  const pool = fresh;
  const exposures = await db.assessmentQuestion.groupBy({
    by: ["questionId"],
    where: { questionId: { in: pool.map((c) => c.id) } },
    _count: { questionId: true },
  });
  const exposureOf = new Map(exposures.map((r) => [r.questionId, r._count.questionId]));
  const minExposure = Math.min(...pool.map((c) => exposureOf.get(c.id) ?? 0));
  const leastDealt = pool.filter((c) => (exposureOf.get(c.id) ?? 0) === minExposure);
  const q = leastDealt[Math.floor(Math.random() * leastDealt.length)];

  const order = (await db.assessmentQuestion.count({ where: { assessmentId } })) + 1;
  // section-wise timer policy (recruiter-configured): debugging min / DSA by
  // difficulty / MCQ seconds, with per-skill overrides — snapshotted so
  // mid-assessment edits stay stable
  const effectiveLimitSec = await policyLimitFor(q.category, q.difficulty, item.skill);
  const now = new Date();
  const aq = await db.assessmentQuestion.create({
    data: {
      assessmentId,
      questionId: q.id,
      skill: item.skill,
      order,
      status: "current",
      timeLimitSec: effectiveLimitSec,
      // server-authoritative timing + single-active invariant
      dealtAt: now,
      deadlineAt: deadlineFor(effectiveLimitSec, now),
      activeFlag: activeFlagFor(assessmentId, "current"),
    },
  });

  plan.askedExternalIds = Array.from(askedExternal).concat(q.externalId);
  const assessmentUpdate: { planJson: string; startedAt?: Date } = { planJson: JSON.stringify(plan) };
  if (!assessment.startedAt) assessmentUpdate.startedAt = now;
  await db.assessment.update({ where: { id: assessmentId }, data: assessmentUpdate });

  return {
    done: false,
    question: toClientQuestion({ ...aq, skill: item.skill, question: q }),
  };
}

/**
 * Revive a skipped question as the new active one. Activation happens FIRST
 * (guarded conditional update) so the single-active unique index is the hard
 * backstop: if another row already holds the active slot the activate itself
 * violates the invariant and fails without ever leaving the assessment
 * active-less. The fresh server deadline is stamped here — a revisited
 * question always restarts its clock from the server's now.
 */
async function reviveSkipped(aqId: string, assessmentId: string) {
  const now = new Date();
  const row = await db.assessmentQuestion.findUnique({
    where: { id: aqId },
    select: { timeLimitSec: true, question: { select: { timeLimitSec: true } } },
  });
  if (!row) throw new Error("Question not found");
  const limit = row.timeLimitSec ?? row.question.timeLimitSec;
  try {
    // One transaction, park-first: the single-active invariant
    // (@@unique [assessmentId, activeFlag]) rejects a second `current` row, so
    // the on-screen question must be parked BEFORE the skipped one revives.
    // A palette revisit therefore means "swap" — what's on screen parks
    // (skipped, reopenable) and the target becomes the active question.
    const [, updated] = await db.$transaction([
      db.assessmentQuestion.updateMany({
        where: { assessmentId, status: "current", NOT: { id: aqId } },
        data: { status: "skipped", activeFlag: null },
      }),
      db.assessmentQuestion.updateMany({
        where: { id: aqId, status: "skipped" },
        data: {
          status: "current",
          activeFlag: activeFlagFor(assessmentId, "current"),
          dealtAt: now,
          deadlineAt: limit ? deadlineFor(limit, now) : null,
        },
      }),
    ]);
    if (updated.count === 0) {
      // lost a race (already revived/finalized by a concurrent request)
      const existing = await db.assessmentQuestion.findUnique({ where: { id: aqId }, include: { question: true } });
      if (!existing) throw new Error("Question not found");
      return toClientQuestion(existing);
    }
  } catch (err) {
    const conflict =
      typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
    if (conflict) {
      // a concurrent request claimed the single active slot — never create a second one
      throw new InvalidTransitionError("Another question is already active");
    }
    throw err;
  }
  const revived = await db.assessmentQuestion.findUniqueOrThrow({ where: { id: aqId }, include: { question: true } });
  return toClientQuestion(revived);
}

/** Total questions the plan expects (for progress bars) */
export function planTotal(items: PlanItemInternal[]): number {
  return items.reduce((a, i) => a + i.coding + i.debugging + i.mcq, 0);
}

/** Park the active question without answering — the dealer re-serves it later */
export async function skipQuestion(assessmentId: string, aqId: string): Promise<void> {
  const row = await db.assessmentQuestion.findFirst({ where: { id: aqId, assessmentId } });
  if (!row) throw new Error("Question not found");
  if (row.status !== "current") {
    throw new InvalidTransitionError("Only the active question can be skipped");
  }
  // conditional update: a concurrent submit/skip may have finalized it first
  const updated = await db.assessmentQuestion.updateMany({
    where: { id: aqId, status: "current" },
    data: { status: "skipped", activeFlag: null },
  });
  if (updated.count === 0) {
    throw new InvalidTransitionError("Question already resolved");
  }
}

/** Jump back to a skipped question from the palette. The question being viewed
 *  (if any) is parked as skipped, mirroring an explicit skip. The revived
 *  question gets a FRESH server-side deadline (the clock is never reused). */
export async function gotoQuestion(assessmentId: string, aqId: string): Promise<ClientQuestion> {
  const row = await db.assessmentQuestion.findFirst({
    where: { id: aqId, assessmentId },
  });
  if (!row) throw new Error("Question not found");
  if (row.status !== "skipped") {
    throw new InvalidTransitionError("Only skipped questions can be revisited");
  }
  return reviveSkipped(aqId, assessmentId);
}

/** Dealt questions for the runner's navigation palette (in deal order) */
export async function listPalette(assessmentId: string): Promise<PaletteRow[]> {
  const rows = await db.assessmentQuestion.findMany({
    where: { assessmentId },
    orderBy: { order: "asc" },
    include: { question: { select: { category: true, difficulty: true } } },
  });
  return rows.map((aq) => ({
    aqId: aq.id,
    order: aq.order,
    skill: aq.skill,
    category: aq.question.category as PaletteRow["category"],
    difficulty: aq.question.difficulty as PaletteRow["difficulty"],
    status: aq.status,
  }));
}
