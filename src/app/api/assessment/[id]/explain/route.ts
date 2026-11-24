import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { requireAssessmentQuestionAccess, requireSubmissionAccess } from "@/lib/server/guards";
import { isAssessmentLive } from "@/lib/server/assessment-state";
import { explainBodySchema, parseJson } from "@/lib/server/validate";
import { generateExplainQuestions, evaluateExplanations } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/assessment/[id]/explain?aqId=… — generate (and cache) verification
 * questions. Authenticated owner/recruiter only; the referenced question must
 * belong to THIS assessment.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const aqId = req.nextUrl.searchParams.get("aqId");
  if (!aqId) return NextResponse.json({ error: "aqId required" }, { status: 400 });

  const access = await requireAssessmentQuestionAccess(id, aqId);
  if (!access.ok) return access.response;

  if (!isAssessmentLive(access.assessment)) {
    return NextResponse.json(
      { error: "This assessment is no longer in progress", code: "INVALID_STATE" },
      { status: 409 }
    );
  }

  if (!rateLimit(`explain:${access.user.id}`, 20, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const aq = await db.assessmentQuestion.findUnique({
      where: { id: aqId },
      include: { question: true, submission: true },
    });
    if (!aq || !aq.submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    if (aq.submission.explainQuestionsJson && aq.submission.explainQuestionsJson !== "[]") {
      return NextResponse.json({ questions: JSON.parse(aq.submission.explainQuestionsJson), cached: true, submissionId: aq.submission.id });
    }

    const questions = await generateExplainQuestions(
      aq.submission.code,
      aq.question.title,
      aq.question.description
    );
    await db.submission.update({
      where: { id: aq.submission.id },
      data: { explainQuestionsJson: JSON.stringify(questions) },
    });
    return NextResponse.json({ questions, cached: false, submissionId: aq.submission.id });
  } catch (err) {
    console.error("explain GET error:", err);
    return NextResponse.json({ error: "Failed to prepare verification questions" }, { status: 500 });
  }
}

/**
 * POST /api/assessment/[id]/explain — evaluate code–explanation consistency.
 * Authenticated owner/recruiter only; the submission must belong to an
 * assessment question of THIS run (mismatched submission IDs are rejected).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, explainBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const access = await requireSubmissionAccess(body.submissionId);
  if (!access.ok) return access.response;
  if (access.assessment.id !== id) {
    return NextResponse.json({ error: "Submission not found in this assessment" }, { status: 404 });
  }

  if (!isAssessmentLive(access.assessment)) {
    return NextResponse.json(
      { error: "This assessment is no longer in progress", code: "INVALID_STATE" },
      { status: 409 }
    );
  }

  if (!rateLimit(`explain:${access.user.id}`, 20, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const sub = await db.submission.findUnique({
      where: { id: body.submissionId },
      include: { assessmentQuestion: { include: { question: true } } },
    });
    if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    const cleaned = body.answers
      .filter((a) => a && typeof a.answer === "string")
      .slice(0, 5)
      .map((a) => ({ q: String(a.q).slice(0, 400), answer: a.answer.slice(0, 3000) }));
    const evaluations = await evaluateExplanations(sub.code, sub.assessmentQuestion.question.title, cleaned);

    await db.explanationAnswer.deleteMany({ where: { submissionId: sub.id } });
    for (const e of evaluations) {
      await db.explanationAnswer.create({
        data: {
          submissionId: sub.id,
          questionText: e.q.slice(0, 400),
          answerText: e.answer.slice(0, 3000),
          consistencyScore: e.score,
          aiFeedback: e.feedback.slice(0, 300),
        },
      });
    }

    return NextResponse.json({ evaluations });
  } catch (err) {
    console.error("explain POST error:", err);
    return NextResponse.json({ error: "Failed to evaluate explanations" }, { status: 500 });
  }
}
