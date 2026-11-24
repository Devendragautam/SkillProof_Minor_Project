import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import type { CategoryScores } from "@/lib/types";

export const runtime = "nodejs";

export interface AttemptRecord {
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  overall: number | null;
  confidence: string | null;
  aiRisk: number | null;
  /** Category scores for client-side role-fit computation */
  categories: CategoryScores | null;
}

/**
 * GET /api/attempts — every assessment across all candidates with its report
 * summary (the candidates listing only surfaces the latest completed run).
 * Powers the recruiter "all attempts" CSV export and future analytics.
 * Recruiter-gated: spans every candidate's results.
 */
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  const assessments = await db.assessment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      candidate: { select: { id: true, name: true } },
      report: { select: { overallScore: true, confidence: true, aiRiskScore: true, categoryScoresJson: true } },
    },
  });

  const attempts: AttemptRecord[] = assessments.map((a) => {
    let categories: CategoryScores | null = null;
    if (a.report?.categoryScoresJson) {
      try {
        categories = JSON.parse(a.report.categoryScoresJson) as CategoryScores;
      } catch {}
    }
    return {
      candidateId: a.candidate.id,
      candidateName: a.candidate.name,
      assessmentId: a.id,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      status: a.status,
      overall: a.report?.overallScore ?? null,
      confidence: a.report?.confidence ?? null,
      aiRisk: a.report?.aiRiskScore ?? null,
      categories,
    };
  });

  return NextResponse.json({ attempts });
}
