import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import {
  getSessionUser,
  requireCandidate,
  requireRecruiter,
  requireUser,
  type GuardFailure,
  type GuardSuccess,
  type SessionUser,
} from "@/lib/server/auth";

/**
 * Centralized server-side authorization helpers.
 *
 * Every protected API route resolves its access decision through THIS module
 * — no route implements its own ownership logic. The invariant enforced
 * everywhere: authentication first, then resource ownership, then state.
 *
 * Access matrix:
 *   - Recruiter (provisioned, single account): full read access to every
 *     assessment, submission, report and candidate.
 *   - Candidate: only resources whose owning candidate profile carries the
 *     candidate's account email.
 *   - Anonymous: nothing (401) — except intentionally public endpoints
 *     (certificate verification by random code, share-token report views,
 *     cohort aggregates).
 *
 * Status codes: 401 unauthenticated · 403 authenticated but not authorized ·
 * 404 not found (or not accessible — existence is not disclosed) ·
 * 409 invalid state.
 */

function fail(status: number, error: string, code: string, detail?: Record<string, unknown>): GuardFailure {
  // audit every authorization denial (401/403) at the resource-guard layer —
  // role-guard denials are audited in auth.ts; 404s are intentionally silent
  if (status === 401 || status === 403) {
    audit({ event: "authz.denied", outcome: "denied", detail: { status, reason: error, ...detail } });
  }
  return { ok: false, response: Response.json({ error, code }, { status }) };
}

export { requireCandidate, requireRecruiter, requireUser };
export type { GuardFailure, GuardSuccess, SessionUser };

/**
 * Load an assessment and verify the caller may access it.
 * Recruiters: any assessment. Candidates: only their own (account email ==
 * candidate email). Anonymous: 401.
 */
export async function requireAssessmentAccess(assessmentId: string): Promise<
  | { ok: true; user: SessionUser; assessment: NonNullable<Awaited<ReturnType<typeof loadAssessment>>> }
  | GuardFailure
> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return fail(404, "Assessment not found", "NOT_FOUND");

  if (guard.user.role !== "recruiter" && assessment.candidate.email !== guard.user.email) {
    return fail(403, "Not your assessment", "FORBIDDEN", {
      actorEmail: guard.user.email,
      assessmentId: assessment.id,
    });
  }
  return { ok: true, user: guard.user, assessment };
}

async function loadAssessment(id: string) {
  return db.assessment.findUnique({ where: { id }, include: { candidate: true } });
}

async function loadAssessmentWithReport(id: string) {
  return db.assessment.findUnique({ where: { id }, include: { candidate: true, report: true } });
}

/**
 * Require access to an assessment AND that a referenced AssessmentQuestion
 * actually belongs to that assessment. IDs supplied independently by the
 * browser are never trusted on their own.
 */
export async function requireAssessmentQuestionAccess(
  assessmentId: string,
  aqId: string
): Promise<
  | { ok: true; user: SessionUser; assessment: NonNullable<Awaited<ReturnType<typeof loadAssessment>>>; aqId: string }
  | GuardFailure
> {
  const access = await requireAssessmentAccess(assessmentId);
  if (!access.ok) return access;

  const aq = await db.assessmentQuestion.findUnique({ where: { id: aqId }, select: { id: true, assessmentId: true } });
  if (!aq || aq.assessmentId !== assessmentId) {
    return fail(404, "Question not found in this assessment", "NOT_FOUND");
  }
  return { ok: true, user: access.user, assessment: access.assessment, aqId };
}

/**
 * Variant for endpoints that receive ONLY the aqId in the body (e.g. the run
 * API): the assessment is derived from the aq itself and ownership is checked
 * against that assessment — a mismatched foreign aqId yields 404.
 */
export async function requireOwnedQuestionByAqId(
  aqId: string
): Promise<
  | { ok: true; user: SessionUser; assessment: NonNullable<Awaited<ReturnType<typeof loadAssessment>>>; aqId: string }
  | GuardFailure
> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const aq = await db.assessmentQuestion.findUnique({
    where: { id: aqId },
    select: { id: true, assessmentId: true },
  });
  if (!aq) return fail(404, "Question not found", "NOT_FOUND");

  const assessment = await loadAssessment(aq.assessmentId);
  if (!assessment) return fail(404, "Assessment not found", "NOT_FOUND");

  if (guard.user.role !== "recruiter" && assessment.candidate.email !== guard.user.email) {
    return fail(403, "Not your assessment", "FORBIDDEN", {
      actorEmail: guard.user.email,
      assessmentId: assessment.id,
    });
  }
  return { ok: true, user: guard.user, assessment, aqId };
}

/**
 * Require access to a submission (submission history, explanations).
 * The submission → assessmentQuestion → assessment → candidate chain is
 * resolved server-side; foreign IDs yield 404/403.
 */
export async function requireSubmissionAccess(submissionId: string): Promise<
  | {
      ok: true;
      user: SessionUser;
      assessment: NonNullable<Awaited<ReturnType<typeof loadAssessment>>>;
      submission: { id: string; assessmentQuestionId: string };
    }
  | GuardFailure
> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const submission = await db.submission.findUnique({
    where: { id: submissionId },
    include: { assessmentQuestion: { select: { assessmentId: true } } },
  });
  if (!submission) return fail(404, "Submission not found", "NOT_FOUND");

  const assessment = await loadAssessment(submission.assessmentQuestion.assessmentId);
  if (!assessment) return fail(404, "Assessment not found", "NOT_FOUND");

  if (guard.user.role !== "recruiter" && assessment.candidate.email !== guard.user.email) {
    return fail(403, "Not your submission", "FORBIDDEN", {
      actorEmail: guard.user.email,
      assessmentId: assessment.id,
      submissionId: submission.id,
    });
  }
  return { ok: true, user: guard.user, assessment, submission };
}

/**
 * Require access to a stored report.
 *  - Authenticated owner or recruiter → full access (token backfilled).
 *  - Anonymous with a valid share token → share access (the share token is a
 *    192-bit cryptographically random secret, NOT the assessment id).
 *  - Otherwise → 401.
 */
export async function requireReportAccess(
  assessmentId: string,
  shareToken: string | null
): Promise<
  | { ok: true; mode: "owner" | "share"; assessment: NonNullable<Awaited<ReturnType<typeof loadAssessmentWithReport>>> }
  | GuardFailure
> {
  const assessment = await loadAssessmentWithReport(assessmentId);
  if (!assessment || !assessment.report) {
    return fail(404, "Report not found", "NOT_FOUND");
  }

  const user = await getSessionUser();
  if (user) {
    if (user.role === "recruiter" || assessment.candidate.email === user.email) {
      // backfill a share token for legacy reports created before the
      // shareToken column existed
      if (!assessment.report.shareToken) {
        const shareToken = await ensureShareToken(assessment.report.id);
        return {
          ok: true,
          mode: "owner",
          assessment: { ...assessment, report: { ...assessment.report, shareToken } },
        };
      }
      return { ok: true, mode: "owner", assessment };
    }
    // authenticated but not the owner and not a recruiter — fall through to
    // the token check, else 403 (do not disclose report existence)
    if (shareToken && assessment.report.shareToken && shareToken === assessment.report.shareToken) {
      audit({
        event: "report.share_access",
        outcome: "ok",
        actor: { id: user.id, email: user.email, role: user.role },
        detail: { assessmentId: assessment.id, reportId: assessment.report.id },
      });
      return { ok: true, mode: "share", assessment };
    }
    return fail(403, "Not your report", "FORBIDDEN");
  }

  if (shareToken && assessment.report.shareToken && shareToken === assessment.report.shareToken) {
    audit({
      event: "report.share_access",
      outcome: "ok",
      detail: { assessmentId: assessment.id, reportId: assessment.report.id },
    });
    return { ok: true, mode: "share", assessment };
  }
  return fail(401, "Sign in required or a valid share link", "AUTH_REQUIRED");
}

/** Generate (once) and persist a cryptographically random share token. */
export async function ensureShareToken(reportId: string): Promise<string> {
  const token = randomShareToken();
  await db.report.update({ where: { id: reportId }, data: { shareToken: token } });
  return token;
}

function randomShareToken(): string {
  // 24 random bytes → 192 bits, base64url (URL-safe, ~32 chars)
  return randomToken(24);
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}
