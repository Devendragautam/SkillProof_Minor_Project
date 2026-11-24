import { NextRequest, NextResponse } from "next/server";
import { gotoQuestion } from "@/lib/server/assessment";
import { requireAssessmentQuestionAccess } from "@/lib/server/guards";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { isAssessmentLive } from "@/lib/server/assessment-state";
import { aqIdBodySchema, parseJson } from "@/lib/server/validate";

export const runtime = "nodejs";

/**
 * POST /api/assessment/[id]/goto — return to a skipped question from the palette.
 * The referenced question must belong to THIS assessment (404 otherwise), the
 * run must still be live, and the target must be a skipped (revisitable)
 * question — solved/failed/timeout rows are locked (409).
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
    const question = await gotoQuestion(id, parsed.data.aqId);
    return NextResponse.json({ question });
  } catch (err) {
    if (err instanceof Error && err.name === "InvalidTransitionError") {
      return NextResponse.json({ error: err.message, code: "INVALID_STATE" }, { status: 409 });
    }
    return NextResponse.json(
      "Failed to reopen question",
      { status: 400 }
    );
  }
}
