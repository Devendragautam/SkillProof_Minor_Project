import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  BehaviorEvent,
  BehaviorMetrics,
  CategoryScores,
  BreakdownItem,
  CodeAnalysis,
  Difficulty,
} from "./types";
import { computeMetrics, summarizeEvent } from "./metrics";

// ─── Complexity comparison helpers ──────────────────────────────────────────

const COMPLEXITY_RANK: Array<[RegExp, number]> = [
  [/^o\(1\)$/i, 0],
  [/^o\(log\s*n\)$/i, 1],
  [/^o\(√n\)$|^o\(sqrt\s*n\)$/i, 1.5],
  [/^o\(n\)$/i, 2],
  [/^o\(n\s*log\s*n\)$|^o\(nlogn\)$/i, 2.5],
  [/^o\(n\s*k\s*log\s*k\)$|^o\(amount·coins\)$|^o\(m·n\)$/i, 3],
  [/^o\(n²\)$|^o\(n\^2\)$/i, 3],
  [/^o\(n³\)$|^o\(n\^3\)$/i, 4],
  [/^o\(2\^n\)$/i, 5],
];

function rankOf(c?: string | null): number {
  if (!c) return 2;
  const norm = c.replace(/\s+/g, "").toLowerCase();
  for (const [re, rank] of COMPLEXITY_RANK) if (re.test(norm)) return rank;
  return 2;
}

export function complexityMatch(submitted: string | undefined, expected?: string | null): number {
  if (!submitted || !expected) return 60;
  const diff = rankOf(submitted) - rankOf(expected);
  if (diff <= 0) return 100;
  return Math.max(30, 100 - diff * 35);
}

// ─── AI-assistance risk analysis (per submission) ───────────────────────────

export function computeAiRisk(
  metrics: BehaviorMetrics,
  opts: { difficulty: Difficulty; category: string; passed: boolean; finalCodeLen: number }
): { score: number; signals: string[]; confidence: "LOW" | "MEDIUM" | "HIGH" } {
  const signals: { w: number; text: string }[] = [];
  const totalTyped = metrics.typedChars + metrics.pastedChars;

  // 1. Paste dominance
  if (totalTyped > 120 && metrics.pastedChars / totalTyped > 0.55) {
    signals.push({
      w: 30,
      text: `${Math.round((metrics.pastedChars / totalTyped) * 100)}% of inserted code came from paste events`,
    });
  }
  // 2. Large sudden insertions
  if (metrics.maxSingleInsert > 250) {
    signals.push({
      w: Math.min(28, 10 + Math.round(metrics.maxSingleInsert / 80)),
      text: `Large sudden code insertion (${metrics.maxSingleInsert} characters at once)`,
    });
  }
  // 3. Abnormal production speed
  if (metrics.charsPerActiveSec > 12 && opts.finalCodeLen > 300) {
    signals.push({
      w: 16,
      text: `Unusually fast sustained code production (${metrics.charsPerActiveSec.toFixed(1)} chars/sec of active editing)`,
    });
  }
  // 4. No debugging cycle on a non-trivial task
  if (opts.category !== "mcq" && opts.passed) {
    if (metrics.runs === 0) {
      signals.push({ w: 10, text: "Submitted without running any tests during development" });
    } else if (metrics.runs <= 1 && (opts.difficulty === "hard" || opts.difficulty === "medium") && metrics.errorRuns === 0) {
      signals.push({ w: 8, text: `Passed with only ${metrics.runs} test run(s) on a ${opts.difficulty} problem — minimal debugging` });
    }
  }
  // 5. Limited solution evolution
  if (opts.category !== "mcq" && metrics.versionCount <= 2 && metrics.codeChanges > 25) {
    signals.push({ w: 6, text: `Limited intermediate development (only ${metrics.versionCount} snapshot(s) across ${metrics.codeChanges} edits)` });
  }
  // 6. Focus changes
  if (metrics.tabBlurs > 0) {
    signals.push({
      w: Math.min(12, metrics.tabBlurs * 5),
      text: `Coding window lost focus ${metrics.tabBlurs} time(s) during the problem`,
    });
  }

  const score = Math.min(95, signals.reduce((s, x) => s + x.w, 0));
  const dataRich = metrics.totalMs > 30000 && (metrics.codeChanges > 8 || metrics.runs > 0);
  const confidence: "LOW" | "MEDIUM" | "HIGH" =
    metrics.totalMs < 8000 ? "LOW" : dataRich ? (signals.length >= 2 ? "HIGH" : "MEDIUM") : "MEDIUM";

  return { score, signals: signals.map((s) => s.text), confidence };
}

// ─── Per-question scoring ───────────────────────────────────────────────────

export const HINT_PENALTY_PER_USE = 0.04; // −4% per revealed hint (disclosed in UI)
export const HINT_PENALTY_MAX = 0.12;

export function hintPenaltyFraction(hintsUsed: number): number {
  return Math.min(HINT_PENALTY_MAX, Math.max(0, hintsUsed) * HINT_PENALTY_PER_USE);
}

export function scoreCodingQuestion(
  testsPassed: number,
  testsTotal: number,
  analysis: CodeAnalysis | null,
  expectedComplexity: string | null,
  hintsUsed = 0
): number {
  const correctness = testsTotal > 0 ? (testsPassed / testsTotal) * 100 : 0;
  const quality = analysis?.quality ?? 55;
  const eff = complexityMatch(analysis?.timeComplexity, expectedComplexity);
  const base = correctness * 0.75 + quality * 0.15 + eff * 0.10;
  return Math.round(base * (1 - hintPenaltyFraction(hintsUsed)));
}

export function scoreDebuggingQuestion(
  testsPassed: number,
  testsTotal: number,
  runs: number,
  errorRuns: number,
  hintsUsed = 0
): number {
  const correctness = testsTotal > 0 ? (testsPassed / testsTotal) * 100 : 0;
  const base = correctness >= 100
    ? (() => {
        const cleanBonus = runs <= 3 && errorRuns === 0 ? 15 : runs <= 5 ? 8 : 0;
        return Math.min(100, 85 + cleanBonus);
      })()
    : Math.round(correctness * 0.35); // partial credit for progress
  return Math.round(base * (1 - hintPenaltyFraction(hintsUsed)));
}

// ─── Report assembly ────────────────────────────────────────────────────────

interface LoadedSubmission {
  aqId: string;
  submissionId: string | null;
  status: string;
  score: number | null;
  timeSpentSec: number | null;
  attempts: number;
  skill: string;
  category: string;
  difficulty: string;
  title: string;
  passed: boolean | null;
  testResults: Array<{ pass: boolean; hidden: boolean }>;
  metrics: BehaviorMetrics | null;
  analysis: CodeAnalysis | null;
  aiRisk: number | null;
  aiRiskSignals: string[];
  events: BehaviorEvent[];
  versions: Array<{ code: string }>;
  explainAvg: number | null;
  timeLimitSec: number;
  expectedComplexity: string | null;
  topic: string;
  code: string;
  hintsUsed: number;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((s, x) => s + (x - m) ** 2, 0) / nums.length);
}

export interface SkillReport {
  skill: string;
  claimedLevel: string | null;
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NOT_ASSESSED";
  assessed: boolean;
  questionCount: number;
  evidence: string[];
  improvements: string[];
  aiRisk: number | null;
}

export function buildSkillReports(subs: LoadedSubmission[], claimedLevels: Map<string, string>): SkillReport[] {
  const bySkill = new Map<string, LoadedSubmission[]>();
  for (const s of subs) {
    if (!bySkill.has(s.skill)) bySkill.set(s.skill, []);
    bySkill.get(s.skill)!.push(s);
  }

  const reports: SkillReport[] = [];
  for (const [skill, list] of bySkill) {
    const coding = list.filter((s) => s.category === "coding");
    const debugging = list.filter((s) => s.category === "debugging");
    const mcq = list.filter((s) => s.category === "mcq");
    const explainScores = list.map((s) => s.explainAvg).filter((x): x is number => x != null);
    const explainAvg = avg(explainScores);
    const risks = list.map((s) => s.aiRisk).filter((x): x is number => x != null);
    const skillRisk = risks.length ? Math.max(...risks) : null;

    const evidence: string[] = [];
    const improvements: string[] = [];

    // correctness evidence
    if (coding.length) {
      const solved = coding.filter((s) => s.passed).length;
      const tp = coding.reduce((a, s) => a + s.testResults.filter((t) => t.pass).length, 0);
      const tt = coding.reduce((a, s) => a + s.testResults.length, 0);
      evidence.push(`${solved}/${coding.length} coding problem(s) solved — ${tp}/${tt} test cases passed`);
      const diffs = Array.from(new Set(coding.map((s) => s.difficulty)));
      evidence.push(`Attempted ${diffs.join(" → ")} difficulty problems`);
      const totalRuns = coding.reduce((a, s) => a + (s.metrics?.runs ?? 0), 0);
      const totalErr = coding.reduce((a, s) => a + (s.metrics?.errorRuns ?? 0), 0);
      if (totalRuns > 0) evidence.push(`${totalRuns} test execution(s), ${totalErr} failing cycle(s) during development`);
      if (coding.some((s) => (s.versions?.length ?? 0) >= 3))
        evidence.push("Solution evolved through multiple saved versions");
      const match = avg(
        coding.map((s) => complexityMatch(s.analysis?.timeComplexity, s.expectedComplexity))
      );
      if (match != null) {
        if (match >= 85) evidence.push("Algorithm complexity matched or beat the target");
        else improvements.push(`Improve complexity: chosen approaches average ${Math.round(match)}% of target efficiency`);
      }
    }
    if (debugging.length) {
      const fixed = debugging.filter((s) => s.passed).length;
      evidence.push(`Fixed ${fixed}/${debugging.length} debugging challenge(s)`);
    }
    if (mcq.length) {
      const correct = mcq.filter((s) => s.score != null && s.score >= 100).length;
      evidence.push(`Answered ${correct}/${mcq.length} conceptual question(s) correctly`);
    }
    if (explainAvg != null) {
      if (explainAvg >= 70) evidence.push(`Explained own solutions with ${Math.round(explainAvg)}% consistency`);
      else improvements.push(`Strengthen code explanations (${Math.round(explainAvg)}% consistency)`);
    }
    // time management
    const onTime = list.filter((s) => s.timeSpentSec != null && s.timeSpentSec <= s.timeLimitSec).length;
    if (onTime === list.length && list.length > 0) evidence.push("Completed all questions within time limits");
    else if (onTime < list.length) improvements.push("Work on pacing — some questions exceeded the time limit");
    // correctness improvement
    const corrAvg = avg(
      list.map((s) => {
        const tt = s.testResults.length;
        return tt ? (s.testResults.filter((t) => t.pass).length / tt) * 100 : (s.score ?? 0);
      })
    );
    if (corrAvg != null && corrAvg < 60) improvements.push("Focus on correctness — several submissions did not pass all tests");
    if (improvements.length === 0) improvements.push("Maintain consistency — no major weaknesses observed");
    if (evidence.length === 0) evidence.push("Attempted but limited evidence available");

    // weighted skill score: coding .5 / debugging .3 / mcq .2 (renormalized)
    const parts: Array<[number, number]> = [];
    if (coding.length) parts.push([avg(coding.map((s) => s.score ?? 0))!, 0.5]);
    if (debugging.length) parts.push([avg(debugging.map((s) => s.score ?? 0))!, 0.3]);
    if (mcq.length) parts.push([avg(mcq.map((s) => s.score ?? 0))!, 0.2]);
    const wsum = parts.reduce((a, [, w]) => a + w, 0);
    const score = Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / (wsum || 1));

    const n = list.length;
    const confidence: SkillReport["confidence"] =
      n === 0
        ? "NOT_ASSESSED"
        : n >= 3 && (skillRisk ?? 0) < 35 && corrAvg !== null && corrAvg > 30
          ? "HIGH"
          : n >= 2 || (skillRisk ?? 0) < 55
            ? "MEDIUM"
            : "LOW";

    reports.push({
      skill,
      claimedLevel: claimedLevels.get(skill) ?? claimedLevels.get(skill.toUpperCase()) ?? null,
      score,
      confidence,
      assessed: n > 0,
      questionCount: n,
      evidence,
      improvements: improvements.slice(0, 3),
      aiRisk: skillRisk,
    });
  }
  return reports.sort((a, b) => b.score - a.score);
}

export function buildCategoryScores(subs: LoadedSubmission[]): CategoryScores {
  const coding = subs.filter((s) => s.category === "coding");
  const debugging = subs.filter((s) => s.category === "debugging");
  const mcq = subs.filter((s) => s.category === "mcq");

  const correctnessOf = (s: LoadedSubmission) => {
    if (s.category === "mcq") return s.score ?? 0;
    const tt = s.testResults.length;
    return tt ? (s.testResults.filter((t) => t.pass).length / tt) * 100 : (s.passed ? 100 : 0);
  };

  const problemSolving = avg([...coding, ...debugging, ...mcq].map(correctnessOf));
  const debuggingScore = debugging.length
    ? avg(debugging.map((s) => s.score ?? 0))
    : coding.length
      ? avg(coding.map((s) => {
          const m = s.metrics;
          if (!m) return 50;
          if (s.passed && m.runs <= 3) return 90;
          if (s.passed) return 70;
          return Math.max(20, 60 - m.errorRuns * 10);
        }))
      : null;

  const efficiency = coding.length
    ? avg(coding.map((s) => complexityMatch(s.analysis?.timeComplexity, s.expectedComplexity)))
    : null;

  const qualitySubs = subs.filter((s) => s.analysis);
  const codeQuality = qualitySubs.length ? avg(qualitySubs.map((s) => s.analysis!.quality)) : null;

  const explain = subs.map((s) => s.explainAvg).filter((x): x is number => x != null);
  const explanation = avg(explain);

  const timed = subs.filter((s) => s.timeSpentSec != null);
  const timeManagement = timed.length
    ? (timed.filter((s) => (s.timeSpentSec ?? 0) <= s.timeLimitSec * 0.9).length / timed.length) * 100
    : null;

  const allScores = subs.map((s) => s.score ?? 0);
  const consistency = allScores.length ? Math.max(0, 100 - stdev(allScores) * 1.6) : null;

  const orZero = (x: number | null) => (x == null ? 0 : Math.round(x));
  return {
    problemSolving: orZero(problemSolving),
    debugging: orZero(debuggingScore),
    efficiency: orZero(efficiency),
    codeQuality: orZero(codeQuality),
    explanation: orZero(explanation),
    timeManagement: orZero(timeManagement),
    consistency: orZero(consistency),
  };
}

export function computeOverall(cats: CategoryScores): number {
  // weights per spec: correctness 35, problem solving 20, efficiency 15,
  // debugging 10, quality 10, explanation 5, time 5
  const correctness = cats.problemSolving; // correctness proxy
  const entries: Array<[number, number]> = [
    [correctness, 0.35],
    [cats.problemSolving, 0.2],
    [cats.efficiency, 0.15],
    [cats.debugging, 0.1],
    [cats.codeQuality, 0.1],
    [cats.explanation, 0.05],
    [cats.timeManagement, 0.05],
  ];
  const present = entries.filter(([, w]) => w > 0);
  const wsum = present.reduce((a, [, w]) => a + w, 0);
  return Math.round(present.reduce((a, [v, w]) => a + v * w, 0) / (wsum || 1));
}

export function buildBreakdown(subs: LoadedSubmission[]): BreakdownItem[] {
  return subs.map((s) => {
    const tt = s.testResults.length;
    const eventSummary = s.events.slice(0, 10).map(summarizeEvent);
    return {
      aqId: s.aqId,
      submissionId: s.submissionId,
      questionTitle: s.title,
      skill: s.skill,
      category: s.category as BreakdownItem["category"],
      difficulty: s.difficulty as BreakdownItem["difficulty"],
      status: s.status,
      score: s.score,
      timeSpentSec: s.timeSpentSec,
      attempts: s.attempts,
      passed: s.passed,
      testsPassed: tt ? s.testResults.filter((t) => t.pass).length : null,
      testsTotal: tt || null,
      complexity: s.analysis?.timeComplexity ?? null,
      quality: s.analysis?.quality ?? null,
      explainConsistency: s.explainAvg,
      aiRisk: s.aiRisk,
      eventSummary,
      versionCount: s.versions.length,
      timeLimitSec: s.timeLimitSec,
      topic: s.topic,
      hintsUsed: s.hintsUsed,
      hintPenalty: s.hintsUsed > 0 ? Math.round(hintPenaltyFraction(s.hintsUsed) * 100) : null,
    };
  });
}

export function computeAssessmentAiRisk(subs: LoadedSubmission[]): { score: number; confidence: "LOW" | "MEDIUM" | "HIGH"; signals: string[] } {
  const risks = subs.map((s) => s.aiRisk).filter((x): x is number => x != null);
  if (!risks.length) return { score: 0, confidence: "LOW", signals: ["No behavioral data collected (conceptual questions only)"] };
  const score = Math.round(Math.max(...risks) * 0.6 + avg(risks)! * 0.4);
  // collect per-submission signals observed at submit time
  const signals: string[] = [];
  for (const s of subs) {
    for (const sig of s.aiRiskSignals ?? []) {
      const line = `${s.title}: ${sig}`;
      if (!signals.includes(line)) signals.push(line);
    }
  }
  const conf: "LOW" | "MEDIUM" | "HIGH" =
    risks.length >= 2 ? (score > 40 ? "HIGH" : "MEDIUM") : "MEDIUM";
  return { score, confidence: conf, signals: signals.slice(0, 10) };
}

/** Load a full assessment's submissions in the shape the scoring engine expects.
 *  Accepts an optional Prisma transaction client so completion can compute the
 *  report from a consistent snapshot (submissions frozen during the txn). */
export async function loadSubmissions(
  assessmentId: string,
  tx?: Prisma.TransactionClient
): Promise<{ subs: LoadedSubmission[]; claimedLevels: Map<string, string> }> {
  const client = tx ?? db;
  const aqs = await client.assessmentQuestion.findMany({
    where: { assessmentId },
    include: {
      question: true,
      submission: {
        include: { explanationAnswers: true },
      },
    },
    orderBy: { order: "asc" },
  });

  const assessment = await client.assessment.findUnique({ where: { id: assessmentId } });
  const plan = assessment ? (JSON.parse(assessment.planJson) as { claimedLevels?: Record<string, string> }) : {};
  const claimedLevels = new Map<string, string>(Object.entries(plan.claimedLevels ?? {}));

  const subs: LoadedSubmission[] = aqs.map((aq) => {
    const sub = aq.submission;
    const events: BehaviorEvent[] = sub ? JSON.parse(sub.eventsJson) : [];
    const versions: Array<{ code: string }> = sub ? JSON.parse(sub.versionsJson) : [];
    const testResults = sub ? JSON.parse(sub.testResultsJson) : [];
    const metrics = sub ? JSON.parse(sub.metricsJson) : null;
    const analysis: CodeAnalysis | null = sub ? JSON.parse(sub.analysisJson || "null") : null;
    const explainAnswers = sub?.explanationAnswers ?? [];
    const explainAvg = explainAnswers.length
      ? avg(explainAnswers.map((e) => e.consistencyScore ?? 0))!
      : null;

    return {
      aqId: aq.id,
      submissionId: sub?.id ?? null,
      status: aq.status,
      score: aq.score,
      timeSpentSec: aq.timeSpentSec,
      attempts: aq.attempts,
      skill: aq.skill,
      category: aq.question.category,
      difficulty: aq.question.difficulty,
      title: aq.question.title,
      passed: sub?.passed ?? null,
      testResults,
      metrics: metrics && typeof metrics === "object" ? metrics : null,
      analysis: analysis && typeof analysis === "object" ? analysis : null,
      aiRisk: sub?.aiRiskScore ?? null,
      aiRiskSignals: sub ? JSON.parse(sub.aiRiskSignalsJson || "[]") : [],
      events,
      versions,
      explainAvg,
      timeLimitSec: aq.timeLimitSec ?? aq.question.timeLimitSec,
      expectedComplexity: aq.question.expectedComplexity,
      topic: aq.question.topic,
      code: sub?.code ?? "",
      hintsUsed: aq.hintCount ?? 0,
    };
  });

  return { subs, claimedLevels };
}

export { computeMetrics };
