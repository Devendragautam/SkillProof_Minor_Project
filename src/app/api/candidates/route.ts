import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { parsePipelineMeta, type PipelineMeta } from "@/lib/pipeline-meta";
import type { BreakdownItem, CategoryScores, Difficulty } from "@/lib/types";

export const runtime = "nodejs";

export interface DifficultyMix {
  easy: { n: number; score: number | null };
  medium: { n: number; score: number | null };
  hard: { n: number; score: number | null };
}

/** Per-difficulty question counts + average scores, from the report breakdown */
function computeDifficultyMix(breakdownJson: string): DifficultyMix {
  const mix: DifficultyMix = {
    easy: { n: 0, score: null },
    medium: { n: 0, score: null },
    hard: { n: 0, score: null },
  };
  try {
    const items = JSON.parse(breakdownJson) as BreakdownItem[];
    const sums: Record<Difficulty, { total: number; n: number }> = {
      easy: { total: 0, n: 0 },
      medium: { total: 0, n: 0 },
      hard: { total: 0, n: 0 },
    };
    for (const it of items) {
      const d = it.difficulty;
      if (d !== "easy" && d !== "medium" && d !== "hard") continue;
      mix[d].n += 1;
      if (typeof it.score === "number") {
        sums[d].total += it.score;
        sums[d].n += 1;
      }
    }
    for (const d of ["easy", "medium", "hard"] as const) {
      mix[d].score = sums[d].n > 0 ? Math.round(sums[d].total / sums[d].n) : null;
    }
  } catch {}
  return mix;
}

interface CandidateRow {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  claimedSkills: Array<{ skill: string; level: string }>;
  assessmentId: string | null;
  completedAt: string | null;
  overall: number | null;
  confidence: string | null;
  aiRisk: number | null;
  aiRiskConfidence: string | null;
  skills: Array<{ skill: string; score: number; confidence: string; assessed: boolean }>;
  categories: CategoryScores | null;
  difficultyMix: DifficultyMix | null;
  notes: string;
  tags: string[];
  archived: boolean;
  invited: boolean;
  attemptCount: number;
  /** Verification code if the completed assessment already carries an issued certificate */
  certificateCode: string | null;
  /** Recruiter pipeline decision: "shortlisted" | "rejected" | null */
  pipelineStatus: string | null;
  pipelineNote: string | null;
  pipelineUpdatedAt: string | null;
  /** Structured decision metadata: interview {scheduledAt, panel} / offer {comp, startDate} */
  pipelineMeta: PipelineMeta | null;
  /** All completed verification runs (oldest → newest) for trend charts */
  completedRuns: Array<{ date: string; overall: number; confidence: string | null }>;
}

/** GET /api/candidates — recruiter dashboard listing (recruiter-gated: PII + reports) */
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  const candidates = await db.candidate.findMany({
    include: {
      assessments: { include: { report: true, certificate: true }, orderBy: { createdAt: "desc" } },
      resumes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: CandidateRow[] = candidates.map((c) => {
    const completed = c.assessments.find((a) => a.status === "completed" && a.report);
    let claimedSkills: Array<{ skill: string; level: string }> = [];
    let tags: string[] = [];
    try {
      if (c.resumes[0]) claimedSkills = JSON.parse(c.resumes[0].skillsJson);
    } catch {}
    try {
      tags = JSON.parse(c.tagsJson ?? "[]");
      if (!Array.isArray(tags)) tags = [];
    } catch {}
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      createdAt: c.createdAt.toISOString(),
      claimedSkills,
      notes: c.notes ?? "",
      tags,
      assessmentId: completed?.id ?? null,
      completedAt: completed?.completedAt?.toISOString() ?? null,
      overall: completed?.report?.overallScore ?? null,
      confidence: completed?.report?.confidence ?? null,
      aiRisk: completed?.report?.aiRiskScore ?? null,
      aiRiskConfidence: completed?.report?.aiRiskConfidence ?? null,
      skills: completed?.report
        ? (JSON.parse(completed.report.skillScoresJson) as CandidateRow["skills"])
        : [],
      categories: completed?.report
        ? (JSON.parse(completed.report.categoryScoresJson) as CategoryScores)
        : null,
      difficultyMix: completed?.report ? computeDifficultyMix(completed.report.breakdownJson) : null,
      archived: c.archived,
      invited: c.invited,
      attemptCount: c.assessments.length,
      certificateCode: completed?.certificate?.code ?? null,
      pipelineStatus: c.pipelineStatus ?? null,
      pipelineNote: c.pipelineNote ?? null,
      pipelineMeta: parsePipelineMeta(c.pipelineMetaJson),
      pipelineUpdatedAt: c.pipelineUpdatedAt?.toISOString() ?? null,
      completedRuns: c.assessments
        .filter((a) => a.status === "completed" && a.report)
        .map((a) => ({
          date: (a.completedAt ?? a.createdAt).toISOString(),
          overall: a.report!.overallScore,
          confidence: a.report!.confidence,
        }))
        .sort((x, y) => x.date.localeCompare(y.date)),
    };
  });

  return NextResponse.json({ candidates: rows });
}
