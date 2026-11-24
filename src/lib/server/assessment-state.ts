import type { AssessmentQuestion } from "@prisma/client";

/**
 * Server-authoritative assessment state machine + timing rules.
 *
 * The browser is NEVER authoritative for time, state or score:
 *  - elapsed time is derived from AssessmentQuestion.dealtAt (or createdAt for
 *    legacy rows) on the server clock;
 *  - the deadline is AssessmentQuestion.deadlineAt = dealtAt + timeLimitSec;
 *  - every state transition is validated here before any write happens.
 *
 * Question lifecycle (AssessmentQuestion.status):
 *
 *   current ──submit(pass)──▶ solved      (terminal)
 *   current ──submit(fail)──▶ failed      (terminal)
 *   current ──timeout───────▶ timeout     (terminal)
 *   current ──skip──────────▶ skipped     (revisitable)
 *   skipped ──goto──────────▶ current     (fresh server deadline)
 *
 * Assessment lifecycle: in_progress ──complete──▶ completed (terminal).
 */

export type AqStatus = "current" | "solved" | "failed" | "skipped" | "timeout";
export type AssessmentStatus = "in_progress" | "completed";

/** Allowed AssessmentQuestion transitions. */
export const AQ_TRANSITIONS: Record<AqStatus, AqStatus[]> = {
  current: ["solved", "failed", "timeout", "skipped"],
  skipped: ["current"],
  // terminal — no further transitions
  solved: [],
  failed: [],
  timeout: [],
};

/** Allowed Assessment transitions. */
export const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  in_progress: ["completed"],
  completed: [],
};

/**
 * Network/scheduling grace window (seconds): a submission that arrives up to
 * this long after deadlineAt is still graded normally (it may have been sent
 * exactly at the buzzer). Past the grace window the server finalizes the
 * question as timeout — the candidate cannot stretch the clock.
 */
export const DEADLINE_GRACE_SEC = 10;

/** Upper sanity bound for a server-derived elapsed time (7 days). */
const MAX_ELAPSED_SEC = 7 * 24 * 60 * 60;

export class InvalidTransitionError extends Error {
  code = "INVALID_STATE";
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export function assertAqTransition(from: string, to: AqStatus): void {
  const allowed = AQ_TRANSITIONS[from as AqStatus];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(`Cannot move a ${from} question to ${to}`);
  }
}

export function assertAssessmentTransition(from: string, to: AssessmentStatus): void {
  const allowed = ASSESSMENT_TRANSITIONS[from as AssessmentStatus];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidTransitionError(`Cannot move a ${from} assessment to ${to}`);
  }
}

/** True when the assessment can accept question-level mutations. */
export function isAssessmentLive(assessment: { status: string; expiresAt?: Date | null }): boolean {
  if (assessment.status !== "in_progress") return false;
  if (assessment.expiresAt && assessment.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Server-derived seconds spent on the question so far — computed from the
 * server clock only. The browser-supplied timeSpentSec is never trusted.
 */
export function serverElapsedSec(aq: Pick<AssessmentQuestion, "dealtAt" | "createdAt">): number {
  const start = (aq.dealtAt ?? aq.createdAt).getTime();
  const elapsed = Math.round((Date.now() - start) / 1000);
  return Math.min(MAX_ELAPSED_SEC, Math.max(0, elapsed));
}

/** Server deadline for a freshly dealt question. */
export function deadlineFor(limitSec: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + limitSec * 1000);
}

/** Remaining seconds until the deadline (0 once passed) — for client display. */
export function remainingSec(
  aq: Pick<AssessmentQuestion, "status" | "dealtAt" | "createdAt" | "deadlineAt" | "timeLimitSec">
): number | null {
  if (aq.status !== "current") return null;
  const effectiveLimit = aq.timeLimitSec ?? null;
  if (!aq.deadlineAt) {
    // legacy row dealt before the timer columns existed — derive from deal time
    if (!effectiveLimit) return null;
    return Math.max(0, Math.min(effectiveLimit, effectiveLimit - serverElapsedSec(aq)));
  }
  return Math.max(0, Math.round((aq.deadlineAt.getTime() - Date.now()) / 1000));
}

/**
 * Has the question's server deadline passed (beyond the grace window)?
 * Questions without a deadline (legacy/misconfigured) never expire here.
 */
export function isExpired(aq: Pick<AssessmentQuestion, "deadlineAt">, now: number = Date.now()): boolean {
  if (!aq.deadlineAt) return false;
  return now > aq.deadlineAt.getTime() + DEADLINE_GRACE_SEC * 1000;
}

/**
 * Is the question still submittable at all (grace included)? Within grace the
 * submission is graded normally; past grace it must be rejected.
 */
export function isWithinDeadline(aq: Pick<AssessmentQuestion, "deadlineAt">, now: number = Date.now()): boolean {
  if (!aq.deadlineAt) return true;
  return now <= aq.deadlineAt.getTime() + DEADLINE_GRACE_SEC * 1000;
}

/**
 * The active-flag value for a row with the given status. This is the column
 * backing the @@unique([assessmentId, activeFlag]) single-active invariant:
 * non-null exactly while the row is the assessment's one active question.
 */
export function activeFlagFor(assessmentId: string, status: string): string | null {
  return status === "current" ? assessmentId : null;
}
