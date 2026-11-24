import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { parsePipelineMeta } from "@/lib/pipeline-meta";

export const runtime = "nodejs";

/**
 * GET /api/pipeline-events — every pipeline decision across all candidates,
 * oldest → newest, with the candidate name flattened in.
 * Powers the Insights "Pipeline health" card (velocity + recent activity).
 * Recruiter-gated: decision notes span every candidate.
 */
export async function GET() {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  try {
    const events = await db.pipelineEvent.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        note: true,
        metaJson: true,
        createdAt: true,
        candidateId: true,
        candidate: { select: { name: true } },
      },
    });
    return NextResponse.json({
      events: events.map(({ candidate, metaJson, ...e }) => ({
        ...e,
        meta: parsePipelineMeta(metaJson),
        candidateName: candidate.name,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
