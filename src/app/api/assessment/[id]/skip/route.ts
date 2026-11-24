import { NextRequest, NextResponse } from "next/server";
import { skipQuestion } from "@/lib/server/assessment";
import { requireAssessmentQuestionAccess } from "@/lib/server/guards";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { isAssessmentLive } from "@/lib/server/assessment-state";
import { aqIdBodySchema, parseJson } from "@/lib/server/validate";

export const runtime = "nodejs";

/**
 * POST /api/assessment/[id]/skip — park the active question for later.
 * The referenced question must belong to THIS assessment (404 otherwise) and
 * the run must still be live (409 after completion).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, aqIdBodySchema);
  if (!parsed.ok) return parsed.response;

  const access = await requireAssessmentQuestionAccess(id, parsed.data.aqId);
  if (!access.ok) return access.response;

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
    await skipQuestion(id, parsed.data.aqId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.name === "InvalidTransitionError") {
      return NextResponse.json({ error: err.message, code: "INVALID_STATE" }, { status: 409 });
    }
    return NextResponse.json(
      "Failed to skip question",
      { status: 400 }
    );
  }
}
