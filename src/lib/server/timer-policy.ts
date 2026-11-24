import { db } from "@/lib/db";

/**
 * Recruiter-configurable assessment timer policy (section-wise, single row).
 *
 * The recruiter sets per-question time limits from the dashboard:
 *   - Debugging questions  → minutes per question (default 5)
 *   - DSA/coding questions → minutes by difficulty: easy 20 / medium 30 / hard 45
 *   - MCQ questions        → seconds per question (default 45)
 *   - Per-skill overrides  → minutes per question for every question of one
 *     skill (e.g. SQL: 15), replacing the section limit — for recruiters who
 *     know a skill needs more (or less) desk time than its section default.
 *
 * The assessment engine applies the policy when it deals a question and
 * snapshots the effective limit onto AssessmentQuestion.timeLimitSec, so
 * scoring/analytics stay stable even if the recruiter edits the policy
 * mid-assessment.
 */

export interface TimerPolicyValues {
  debuggingMin: number;
  dsaEasyMin: number;
  dsaMediumMin: number;
  dsaHardMin: number;
  mcqSec: number;
  /** Per-skill overrides in minutes per question — replaces the section limit. */
  skillOverrides: Record<string, number>;
  /** Proctor live-stream severity thresholds. */
  pasteWarnChars: number;
  pasteRiskChars: number;
  explainWarnPct: number;
}

/** The spec defaults: debugging 5 min · DSA easy 20 / mid 30 / hard 45 · MCQ 45 sec · paste warn 80 / risk 200 · explain warn < 70%. */
export const TIMER_DEFAULTS: TimerPolicyValues = {
  debuggingMin: 5,
  dsaEasyMin: 20,
  dsaMediumMin: 30,
  dsaHardMin: 45,
  mcqSec: 45,
  skillOverrides: {},
  pasteWarnChars: 80,
  pasteRiskChars: 200,
  explainWarnPct: 70,
};

const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
const MIN_SECONDS = 10;
const MAX_SECONDS = 3600;
const MAX_SKILL_OVERRIDES = 32;
const MAX_SKILL_NAME = 40;

const clampInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Normalize a recruiter-submitted overrides record — clamp, cap, dedupe. */
function sanitizeOverrides(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey).trim().slice(0, MAX_SKILL_NAME);
    if (!key) continue;
    const n = Math.round(Number(rawValue));
    // non-numeric / non-positive entries mean "clear this override"
    if (!Number.isFinite(n) || n <= 0) continue;
    if (Object.keys(out).length >= MAX_SKILL_OVERRIDES) break;
    out[key] = Math.min(MAX_MINUTES * 0 + MAX_MINUTES, Math.max(MIN_MINUTES, n));
  }
  return out;
}

/** Parse the stored overrides JSON defensively (legacy rows may hold junk). */
function parseOverrides(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    return sanitizeOverrides(JSON.parse(json));
  } catch {
    return {};
  }
}

/** Load the policy row, creating the default one on first use. */
export async function getTimerPolicy(): Promise<TimerPolicyValues> {
  let row = await db.timerPolicy.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await db.timerPolicy.create({ data: { id: "default" } });
  }
  return {
    debuggingMin: row.debuggingMin,
    dsaEasyMin: row.dsaEasyMin,
    dsaMediumMin: row.dsaMediumMin,
    dsaHardMin: row.dsaHardMin,
    mcqSec: row.mcqSec,
    skillOverrides: parseOverrides(row.skillOverridesJson),
    pasteWarnChars: row.pasteWarnChars,
    pasteRiskChars: row.pasteRiskChars,
    explainWarnPct: row.explainWarnPct,
  };
}

/** Sanitize a recruiter-submitted policy body — every field clamped to safe ranges. */
export function sanitizeTimerPolicy(body: unknown): TimerPolicyValues {
  const b = (body ?? {}) as Record<string, unknown>;
  // paste risk must stay strictly above warn so the severity ladder is coherent
  const pasteWarn = clampInt(b.pasteWarnChars, TIMER_DEFAULTS.pasteWarnChars, 10, 10_000);
  const pasteRiskRaw = clampInt(b.pasteRiskChars, TIMER_DEFAULTS.pasteRiskChars, 20, 50_000);
  return {
    debuggingMin: clampInt(b.debuggingMin, TIMER_DEFAULTS.debuggingMin, MIN_MINUTES, MAX_MINUTES),
    dsaEasyMin: clampInt(b.dsaEasyMin, TIMER_DEFAULTS.dsaEasyMin, MIN_MINUTES, MAX_MINUTES),
    dsaMediumMin: clampInt(b.dsaMediumMin, TIMER_DEFAULTS.dsaMediumMin, MIN_MINUTES, MAX_MINUTES),
    dsaHardMin: clampInt(b.dsaHardMin, TIMER_DEFAULTS.dsaHardMin, MIN_MINUTES, MAX_MINUTES),
    mcqSec: clampInt(b.mcqSec, TIMER_DEFAULTS.mcqSec, MIN_SECONDS, MAX_SECONDS),
    skillOverrides: sanitizeOverrides(b.skillOverrides),
    pasteWarnChars: pasteWarn,
    pasteRiskChars: Math.max(pasteRiskRaw, pasteWarn + 10),
    explainWarnPct: clampInt(b.explainWarnPct, TIMER_DEFAULTS.explainWarnPct, 0, 100),
  };
}

/**
 * Effective per-question time limit in seconds for a category + difficulty,
 * optionally overridden per skill (a skill override replaces the section
 * limit for every question of that skill — minutes, so MCQ overrides floor
 * at 60s rather than the 45s default).
 */
export function policyTimeLimitSec(
  p: TimerPolicyValues,
  category: string,
  difficulty: string,
  skill?: string | null
): number {
  if (skill) {
    const overrideMin = p.skillOverrides[skill];
    if (typeof overrideMin === "number" && overrideMin > 0) return overrideMin * 60;
  }
  if (category === "mcq") return p.mcqSec;
  if (category === "debugging") return p.debuggingMin * 60;
  // coding (DSA) and any other executable category — minutes by difficulty
  if (difficulty === "hard") return p.dsaHardMin * 60;
  if (difficulty === "medium") return p.dsaMediumMin * 60;
  return p.dsaEasyMin * 60;
}

/** Convenience: resolve the policy and return the limit for one question. */
export async function policyLimitFor(
  category: string,
  difficulty: string,
  skill?: string | null
): Promise<number> {
  const p = await getTimerPolicy();
  return policyTimeLimitSec(p, category, difficulty, skill);
}
