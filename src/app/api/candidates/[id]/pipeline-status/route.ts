import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";
import { parsePipelineMeta } from "@/lib/pipeline-meta";

export const runtime = "nodejs";

/**
 * GET /api/candidates/[id]/pipeline-status — candidate-facing view of where
 * they stand in the hiring pipeline. Requires authentication: the owning
 * candidate (account email match) or a recruiter. Privacy-preserving by
 * design: decision notes, AI risk, fit scores and every other candidate's
 * data are never exposed here — only the current stage, the stage-relevant
 * scheduling/offer details (what a candidate would genuinely be told) and
 * the public stage history (status + timestamps, notes stripped).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in required", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { id } = await params;
    const candidate = await db.candidate.findUnique({
      where: { id },
      select: {
        email: true,
        pipelineStatus: true,
        pipelineMetaJson: true,
        pipelineUpdatedAt: true,
        pipelineEvents: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, status: true, metaJson: true, createdAt: true },
        },
      },
    });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (user.role !== "recruiter" && user.email !== candidate.email) {
      return NextResponse.json({ error: "Not your profile", code: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json({
      status: candidate.pipelineStatus,
      meta: parsePipelineMeta(candidate.pipelineMetaJson),
      updatedAt: candidate.pipelineUpdatedAt?.toISOString() ?? null,
      events: candidate.pipelineEvents.map((e) => ({
        id: e.id,
        status: e.status,
        meta: parsePipelineMeta(e.metaJson),
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
