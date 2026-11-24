import { NextRequest, NextResponse } from "next/server";
import { dealNextQuestion } from "@/lib/server/assessment";
import { db } from "@/lib/db";
import { requireAssessmentAccess } from "@/lib/server/guards";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { isAssessmentLive } from "@/lib/server/assessment-state";
import { nextBodySchema, parseJson } from "@/lib/server/validate";

export const runtime = "nodejs";

/**
 * POST /api/assessment/[id]/next — deal the next (adaptive) question.
 * Owner candidate or recruiter only.
 *
 * Concurrency-safe: dealNextQuestion stamps activeFlag and relies on the
 * @@unique([assessmentId, activeFlag]) invariant, so simultaneous requests
 * (double-clicks, replays, two tabs) can never create two active questions —
 * the loser is re-served the already-active question.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (!access.ok) return access.response;

  const parsed = await parseJson(req, nextBodySchema);
  if (!parsed.ok) return parsed.response;

  if (!rateLimit(`assess-mutate:${access.user.id}`, 60, 60_000)) {
    return rateLimitResponse();
  }

  try {
    if (!isAssessmentLive(access.assessment)) {
      return NextResponse.json(
        { error: "This assessment is no longer in progress", code: "INVALID_STATE" },
        { status: 409 }
      );
    }
    const { question, done } = await dealNextQuestion(id, parsed.data);
    return NextResponse.json({ done, question });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get next question";
    if (/already completed/i.test(msg)) {
      return NextResponse.json(
        { error: "This assessment is already completed", code: "INVALID_STATE" },
        { status: 409 }
      );
    }
    console.error("next question error:", err);
    return NextResponse.json({ error: "Failed to get next question" }, { status: 500 });
  }
}

/** Owner-scoped snapshot of the most recently dealt question. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (!access.ok) return access.response;

  const rows = await db.assessmentQuestion.findMany({
    where: { assessmentId: id },
    orderBy: { order: "desc" },
    take: 1,
  });
  return NextResponse.json({ latest: rows[0] ?? null });
}
