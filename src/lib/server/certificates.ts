import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import type { CertificatePayload, CertificateSkill, CohortStanding } from "@/lib/types";

/**
 * Certificate issuing & verification helpers.
 *
 * A certificate is a permanent, publicly verifiable record of a completed
 * assessment: candidate name, per-skill verified percentages, overall score,
 * issuing recruiter and a human-readable verification code (SP-XXXX-XXXX).
 * Skill scores are snapshotted at issue time so the certificate stays stable.
 */

// Unambiguous alphabet (no 0/O/1/I) for human-readable codes
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Generate a verification code like "SP-7K3M-9QX2". */
export function generateCertificateCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `SP-${pick(4)}-${pick(4)}`;
}

/** Build the public certificate payload from a Certificate row.
 *
 *  `scope: "public"` (unauthenticated verification) strips internal data:
 *  the assessment id is a capability-adjacent internal identifier that public
 *  verifiers never need, and the candidate email is not part of the printed
 *  credential. Owner/recruiter contexts keep the full payload.
 */
export function buildCertificatePayload(
  cert: {
    code: string;
    overallScore: number;
    confidence: string;
    scoresJson: string;
    cohortStandingJson?: string | null;
    issuedBy: string;
    issuedAt: Date;
    assessment: { id: string; completedAt: Date | null; candidate: { name: string; email: string | null } };
  },
  scope: "public" | "full" = "full"
): CertificatePayload {
  let rawSkills: unknown;
  try {
    rawSkills = JSON.parse(cert.scoresJson);
  } catch {
    rawSkills = [];
  }
  const skills: CertificateSkill[] = Array.isArray(rawSkills)
    ? rawSkills
        .filter(
          (s): s is { name: string; score: number; level?: string | null; assessed?: boolean } =>
            !!s && typeof s === "object" && typeof (s as { name?: unknown }).name === "string" && typeof (s as { score?: unknown }).score === "number"
        )
        .map((s) => ({
          name: s.name,
          score: Math.round(s.score),
          level: s.level ?? null,
          assessed: s.assessed !== false,
        }))
    : [];

  return {
    code: cert.code,
    candidateName: cert.assessment.candidate.name,
    candidateEmail: scope === "public" ? null : cert.assessment.candidate.email,
    // public verification works through the random code — the internal
    // assessment id is never exposed to unauthenticated callers
    assessmentId: scope === "public" ? "" : cert.assessment.id,
    overallScore: Math.round(cert.overallScore),
    confidence: cert.confidence,
    skills,
    cohort: parseCohortStanding(cert.cohortStandingJson ?? null),
    issuedBy: cert.issuedBy,
    issuedAt: cert.issuedAt.toISOString(),
    completedAt: cert.assessment.completedAt ? cert.assessment.completedAt.toISOString() : null,
  };
}

/** Snapshot the verified skill scores from a report into certificate shape. */
export function snapshotSkills(skillScoresJson: string): CertificateSkill[] {
  let raw: unknown;
  try {
    raw = JSON.parse(skillScoresJson);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (s): s is { skill?: string; score?: number; claimedLevel?: string | null; assessed?: boolean } =>
        !!s && typeof s === "object"
    )
    .filter((s) => typeof s.skill === "string" && typeof s.score === "number")
    .map((s) => ({
      name: s.skill as string,
      score: Math.round(s.score as number),
      level: s.claimedLevel ?? null,
      assessed: s.assessed !== false,
    }));
}

/** Load a certificate by verification code with all relations, or null. */
export async function findCertificateByCode(code: string) {
  const normalized = code.trim().toUpperCase();
  return db.certificate.findUnique({
    where: { code: normalized },
    include: {
      assessment: { include: { candidate: { select: { name: true, email: true } } } },
    },
  });
}

/**
 * Pure cohort math over a list of scores — midstep percentile (half of ties
 * counted) so the score-holder is never flattered by ties. Shared by the
 * live /api/cohort route, certificate freezing and per-run wallet standings.
 */
export function standingFromScores(scores: number[], score: number): CohortStanding | null {
  if (!Number.isFinite(score)) return null;
  const size = scores.length;
  if (size === 0) return null;

  const sorted = [...scores].sort((a, b) => b - a); // best first
  const best = sorted[0];
  const median =
    size % 2 === 1
      ? sorted[(size - 1) / 2]
      : Math.round(((sorted[size / 2 - 1] + sorted[size / 2]) / 2) * 10) / 10;
  const rank = 1 + sorted.filter((s) => s > score).length; // 1-based, ties share the better rank
  const below = sorted.filter((s) => s < score).length;
  const equal = sorted.filter((s) => s === score).length;
  const percentile = Math.round(((below + 0.5 * equal) / size) * 1000) / 10;
  const topPct = Math.max(0, Math.round((100 - percentile) * 10) / 10);

  return { size, median, best, rank, topPct };
}

/**
 * Cohort standing for a score across all completed, reported runs.
 * Aggregate-only (no PII): rank + midstep percentile + distribution stats.
 * Used live by GET /api/cohort and frozen onto certificates at issue time.
 */
export async function computeCohortStanding(score: number): Promise<CohortStanding | null> {
  const reports = await db.report.findMany({
    where: { assessment: { status: "completed" } },
    select: { overallScore: true },
  });
  return standingFromScores(
    reports.map((r) => r.overallScore),
    score
  );
}

/** Parse a certificate's frozen cohort snapshot, or null. */
export function parseCohortStanding(json: string | null): CohortStanding | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<CohortStanding> | null;
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.size !== "number" || typeof raw.rank !== "number" || typeof raw.topPct !== "number") {
      return null;
    }
    return {
      size: raw.size,
      rank: raw.rank,
      topPct: raw.topPct,
      median: typeof raw.median === "number" ? raw.median : null,
      best: typeof raw.best === "number" ? raw.best : null,
      recordedAt: typeof raw.recordedAt === "string" ? raw.recordedAt : null,
    };
  } catch {
    return null;
  }
}
