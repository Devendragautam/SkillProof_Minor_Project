import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { parsePipelineMeta, type PipelineMeta } from "@/lib/pipeline-meta";

export const runtime = "nodejs";

interface TimelineAttempt {
  id: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  overall: number | null;
  confidence: string | null;
}

interface TimelineEvent {
  id: string;
  status: string; // "shortlisted" | "interview" | "offer" | "rejected" | "cleared"
  note: string | null;
  meta: PipelineMeta | null;
  createdAt: string;
}

/**
 * GET /api/candidates/[id]/timeline — the candidate's journey data for the
 * recruiter journey dialog: profile creation, resume uploads, every assessment
 * attempt, and the pipeline-decision audit trail. Recruiter-gated.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const candidate = await db.candidate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        invited: true,
        createdAt: true,
        resumes: { orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, createdAt: true } },
        assessments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            completedAt: true,
            status: true,
            report: { select: { overallScore: true, confidence: true } },
          },
        },
        pipelineEvents: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, note: true, metaJson: true, createdAt: true } },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    const attempts: TimelineAttempt[] = candidate.assessments.map((a) => ({
      id: a.id,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      status: a.status,
      overall: a.report?.overallScore ?? null,
      confidence: a.report?.confidence ?? null,
    }));

    const events: TimelineEvent[] = candidate.pipelineEvents.map((e) => ({
      id: e.id,
      status: e.status,
      note: e.note,
      meta: parsePipelineMeta(e.metaJson),
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({
      timeline: {
        id: candidate.id,
        name: candidate.name,
        invited: candidate.invited,
        createdAt: candidate.createdAt.toISOString(),
        resumes: candidate.resumes.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          createdAt: r.createdAt.toISOString(),
        })),
        attempts,
        events,
      },
    });
  } catch {
    return NextResponse.json({ error: "Timeline lookup failed" }, { status: 500 });
  }
}
