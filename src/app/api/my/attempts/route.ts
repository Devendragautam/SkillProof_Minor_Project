import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server/auth";
import { standingFromScores } from "@/lib/server/certificates";

export const runtime = "nodejs";

interface SkillScoreRaw {
  skill?: unknown;
  score?: unknown;
  assessed?: unknown;
}

/**
 * GET /api/my/attempts — the signed-in candidate's completed verification runs.
 *
 * The credential wallet shows issued certificates; this ledger shows every
 * completed assessment behind them (certified or not): overall score,
 * confidence, AI-assist risk, top verified skills, duration, and the
 * certificate code when one was issued. Matched by account email, so a
 * candidate sees their own history across every sign-in.
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (guard.user.role !== "candidate") {
    return NextResponse.json(
      { error: "Candidate access required", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    // A candidate may have several profile rows sharing the account email
    // (legacy rows created before session-bound profile reuse). The ledger is
    // ONE continuous history — aggregate every profile with this email, not
    // just the first findFirst hit.
    const profiles = await db.candidate.findMany({
      where: { email: guard.user.email },
      select: { id: true },
    });
    if (profiles.length === 0) {
      return NextResponse.json({ attempts: [] });
    }

    const runs = await db.assessment.findMany({
      where: { candidateId: { in: profiles.map((p) => p.id) }, status: "completed" },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        completedAt: true,
        report: {
          select: {
            overallScore: true,
            confidence: true,
            aiRiskScore: true,
            skillScoresJson: true,
          },
        },
        certificate: { select: { code: true } },
        questions: { select: { status: true, timeSpentSec: true } },
      },
    });

    // cohort distribution once — each scored run gets its live standing
    // (same midstep percentile the certificate freezes at issue time)
    const cohortScores = (
      await db.report.findMany({
        where: { assessment: { status: "completed" } },
        select: { overallScore: true },
      })
    ).map((r) => r.overallScore);

    const attempts = runs.map((a) => {
      // top verified skills from the report snapshot (assessed only, strongest first)
      let topSkills: Array<{ name: string; score: number }> = [];
      if (a.report) {
        try {
          const raw = JSON.parse(a.report.skillScoresJson) as SkillScoreRaw[];
          topSkills = (Array.isArray(raw) ? raw : [])
            .filter(
              (s): s is { skill: string; score: number; assessed?: boolean } =>
                typeof s.skill === "string" &&
                typeof s.score === "number" &&
                s.assessed !== false
            )
            .sort((x, y) => (y.score as number) - (x.score as number))
            .slice(0, 3)
            .map((s) => ({ name: s.skill, score: Math.round(s.score) }));
        } catch {
          topSkills = [];
        }
      }

      const spentSec = a.questions.reduce((acc, q) => acc + (q.timeSpentSec ?? 0), 0);
      const answered = a.questions.filter((q) => q.status !== "skipped").length;
      const standing = a.report ? standingFromScores(cohortScores, a.report.overallScore) : null;

      return {
        assessmentId: a.id,
        completedAt: a.completedAt?.toISOString() ?? null,
        overall: a.report ? Math.round(a.report.overallScore) : null,
        confidence: a.report?.confidence ?? null,
        aiRisk: a.report ? Math.round(a.report.aiRiskScore) : null,
        topSkills,
        questions: a.questions.length,
        answered,
        timeSpentMin: spentSec > 0 ? Math.round(spentSec / 60) : null,
        certificateCode: a.certificate?.code ?? null,
        cohort: standing ? { rank: standing.rank, size: standing.size, topPct: standing.topPct } : null,
      };
    });

    return NextResponse.json({ attempts });
  } catch (err) {
    console.error("my-attempts error:", err);
    return NextResponse.json({ error: "Failed to load attempts" }, { status: 500 });
  }
}
