import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hintPenaltyFraction } from "@/lib/scoring";
import { requireAssessmentQuestionAccess } from "@/lib/server/guards";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { isAssessmentLive } from "@/lib/server/assessment-state";
import { aqIdBodySchema, parseJson } from "@/lib/server/validate";

export const runtime = "nodejs";

/**
 * POST /api/assessment/[id]/hint — disclose-and-reveal a question hint.
 * The reveal is stored server-side (hintCount) as assessment evidence and
 * carries a small transparent score adjustment (−4% per use, max −12%).
 * The referenced question must belong to THIS assessment and be active.
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

    const aq = await db.assessmentQuestion.findUnique({
      where: { id: parsed.data.aqId },
      include: { question: { select: { hint: true, category: true } } },
    });
    if (!aq) return NextResponse.json({ error: "Question not found" }, { status: 404 });
    if (aq.status !== "current") {
      return NextResponse.json({ error: "Question already resolved", code: "INVALID_STATE" }, { status: 409 });
    }
    if (!aq.question.hint) {
      return NextResponse.json({ error: "No hint available for this question" }, { status: 404 });
    }

    const hintCount = aq.hintCount + 1;
    await db.assessmentQuestion.update({ where: { id: aq.id }, data: { hintCount } });

    return NextResponse.json({
      hint: aq.question.hint,
      hintCount,
      penaltyPct: Math.round(hintPenaltyFraction(hintCount) * 100),
    });
  } catch {
    return NextResponse.json({ error: "Failed to reveal hint" }, { status: 500 });
  }
}
