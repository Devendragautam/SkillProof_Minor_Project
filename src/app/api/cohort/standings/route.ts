import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { parseCohortStanding, standingFromScores } from "@/lib/server/certificates";
import type { CohortStanding } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/cohort/standings — recruiter export of per-run cohort standings.
 *
 * One row per completed, reported verification run with:
 *  - live standing: rank / cohort size / top-% computed against every
 *    completed run in the database right now (standingFromScores)
 *  - frozen standing: the snapshot stored on the certificate at issue time
 *    (historical truth — the cohort at the moment the certificate was minted)
 *
 * Recruiter-gated: contains candidate names, emails and ranked results.
 */
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  try {
    const assessments = await db.assessment.findMany({
      where: { status: "completed" },
      orderBy: { completedAt: "asc" },
      select: {
        id: true,
        completedAt: true,
        candidate: { select: { name: true, email: true } },
        report: {
          select: { overallScore: true, confidence: true },
        },
        certificate: {
          select: { code: true, issuedAt: true, cohortStandingJson: true },
        },
      },
    });

    const reported = assessments.filter((a) => a.report);
    const scores = reported.map((a) => a.report!.overallScore);

    const rows = reported
      .map((a) => {
        const live: CohortStanding | null = standingFromScores(scores, a.report!.overallScore);
        const frozen = parseCohortStanding(a.certificate?.cohortStandingJson ?? null);
        return {
          candidateName: a.candidate.name,
          email: a.candidate.email,
          assessmentId: a.id,
          completedAt: a.completedAt?.toISOString() ?? null,
          overall: a.report!.overallScore,
          confidence: a.report!.confidence,
          liveStanding: live,
          certificate: a.certificate
            ? {
                code: a.certificate.code,
                issuedAt: a.certificate.issuedAt.toISOString(),
                standing: frozen,
              }
            : null,
        };
      })
      .sort((x, y) => y.overall - x.overall || (x.completedAt ?? "").localeCompare(y.completedAt ?? ""));

    return NextResponse.json({
      rows,
      cohortSize: scores.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("standings export error:", err);
    return NextResponse.json({ error: "Failed to build standings" }, { status: 500 });
  }
}
