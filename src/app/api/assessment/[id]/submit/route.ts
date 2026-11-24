import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAssessmentQuestionAccess } from "@/lib/server/guards";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { parseJson, submitBodySchema } from "@/lib/server/validate";
import {
  isAssessmentLive,
  isWithinDeadline,
  serverElapsedSec,
} from "@/lib/server/assessment-state";
import { runTestsInLanguage } from "@/lib/server/lang-exec";
import { runSqlTests } from "@/lib/server/sql-exec";
import { computeMetrics } from "@/lib/metrics";
import { computeAiRisk, hintPenaltyFraction, scoreCodingQuestion, scoreDebuggingQuestion } from "@/lib/scoring";
import { analyzeCode } from "@/lib/ai";
import type { BehaviorEvent, CodeVersion, TestCase } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/assessment/[id]/submit — grade & store a submission with full
 * behavior evidence.
 *
 * Server-authoritative guarantees:
 *  - the referenced question must belong to THIS assessment and the caller
 *    must own (or be the recruiter of) the run;
 *  - TIME comes from the server: elapsed = now − dealtAt (stored on the
 *    AssessmentQuestion). Any browser-supplied timeSpentSec is accepted for
 *    protocol compatibility and then IGNORED;
 *  - a submission past the server deadline (+grace) is rejected and the
 *    question is finalized as a zero-score timeout — no late work scores;
 *  - scores/pass/results are computed HERE; client-supplied score-like fields
 *    cannot exist (the zod schema strips unknown keys);
 *  - the finalize (AQ update) + submission insert run in one transaction and
 *    the finalize is conditional on status="current", so double submits,
 *    replays and racing tabs yield exactly one graded submission (the
 *    Submission.assessmentQuestionId unique constraint is the last resort).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJson(req, submitBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!body.code && body.mcqAnswerIndex === undefined) {
    return NextResponse.json(
      { error: "code or mcqAnswerIndex required", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  const access = await requireAssessmentQuestionAccess(id, body.aqId);
  if (!access.ok) return access.response;

  if (!rateLimit(`submit:${access.user.id}`, 30, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const assessment = access.assessment;
    if (!isAssessmentLive(assessment)) {
      return NextResponse.json(
        { error: "This assessment is no longer in progress", code: "INVALID_STATE" },
        { status: 409 }
      );
    }

    const aq = await db.assessmentQuestion.findUnique({
      where: { id: body.aqId },
      include: { question: true },
    });
    if (!aq || aq.assessmentId !== id) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (aq.status !== "current") {
      return NextResponse.json(
        { error: "Question already resolved", code: "INVALID_STATE" },
        { status: 409 }
      );
    }

    // ── server-side clock: the browser's timeSpentSec is never trusted ────
    const timeSpentSec = serverElapsedSec(aq);

    // ── deadline enforcement (server decides expiry) ───────────────────────
    if (!isWithinDeadline(aq)) {
      // finalize as timeout in the same atomic step — the question cannot be
      // retried past its deadline and the run can move on
      const finalized = await db.assessmentQuestion.updateMany({
        where: { id: aq.id, status: "current" },
        data: { status: "timeout", score: 0, timeSpentSec, attempts: 1, activeFlag: null },
      });
      if (finalized.count === 0) {
        return NextResponse.json(
          { error: "Question already resolved", code: "INVALID_STATE" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: "Time is up for this question — the deadline passed on the server",
          code: "QUESTION_EXPIRED",
          type: aq.question.category,
          passed: false,
          score: 0,
          status: "timeout",
        },
        { status: 409 }
      );
    }

    // ── MCQ path ────────────────────────────────────────────────────────────
    if (aq.question.category === "mcq") {
      const options: string[] = aq.question.optionsJson ? JSON.parse(aq.question.optionsJson) : [];
      const answerIndex = body.mcqAnswerIndex ?? -1;
      if (answerIndex >= options.length) {
        return NextResponse.json(
          { error: "mcqAnswerIndex out of range", code: "VALIDATION_ERROR" },
          { status: 400 }
        );
      }
      const correct = answerIndex === aq.question.answerIndex;
      const score = correct ? 100 : 0;
      // an unanswered conceptual question at the buzzer is a timeout, not a
      // user skip — timeouts are not revisitable from the palette
      const status = answerIndex < 0 ? "timeout" : correct ? "solved" : "failed";

      const finalized = await db.assessmentQuestion.updateMany({
        where: { id: aq.id, status: "current" },
        data: { status, score, timeSpentSec, attempts: 1, activeFlag: null },
      });
      if (finalized.count === 0) {
        return NextResponse.json(
          { error: "Question already resolved", code: "INVALID_STATE" },
          { status: 409 }
        );
      }

      return NextResponse.json({
        type: "mcq",
        correct,
        answerIndex: aq.question.answerIndex,
        explanation: aq.question.explanation,
        score,
        status,
      });
    }

    // ── Coding / debugging path ─────────────────────────────────────────────
    const code = (body.code ?? "").slice(0, 30000);
    if (!aq.question.testsJson || (!aq.question.fnName && !aq.question.schemaSql)) {
      return NextResponse.json({ error: "Question misconfigured" }, { status: 500 });
    }
    const tests: TestCase[] = JSON.parse(aq.question.testsJson);
    const language = body.language ?? "javascript";
    const run =
      language === "sql"
        ? await runSqlTests(code, tests, {
            schemaSql: aq.question.schemaSql,
            seedSql: aq.question.seedSql,
          })
        : await runTestsInLanguage(code, aq.question.fnName ?? "", tests, language);
    const passed = run.total > 0 && run.passedCount === run.total;

    // behavior metrics + AI risk — zod already bounded the shapes; cast to the
    // canonical behavior types the scoring engine expects
    const events = (body.events ?? []) as BehaviorEvent[];
    const versions = (body.versions ?? []) as CodeVersion[];
    const metrics = computeMetrics(events, versions, code);
    const risk = computeAiRisk(metrics, {
      difficulty: aq.question.difficulty as "easy" | "medium" | "hard",
      category: aq.question.category,
      passed,
      finalCodeLen: code.length,
    });

    // AI code analysis (graceful fallback inside)
    const analysis = await analyzeCode(code, aq.question.title, aq.question.expectedComplexity ?? undefined);

    const score =
      aq.question.category === "coding"
        ? scoreCodingQuestion(run.passedCount, run.total, analysis, aq.question.expectedComplexity, aq.hintCount)
        : scoreDebuggingQuestion(run.passedCount, run.total, metrics.runs, metrics.errorRuns, aq.hintCount);

    const status = passed ? "solved" : "failed";

    // ── atomic finalize: conditional AQ update + submission insert ─────────
    try {
      await db.$transaction(async (tx) => {
        const finalized = await tx.assessmentQuestion.updateMany({
          where: { id: aq.id, status: "current" },
          data: { status, score, timeSpentSec, attempts: 1, activeFlag: null },
        });
        if (finalized.count === 0) {
          throw new AlreadyResolvedError();
        }
        await tx.submission.create({
          data: {
            assessmentQuestionId: aq.id,
            code,
            language,
            eventsJson: JSON.stringify(body.events ?? []),
            versionsJson: JSON.stringify(body.versions ?? []),
            metricsJson: JSON.stringify(metrics),
            testResultsJson: JSON.stringify(run.results),
            passed,
            runtimeMs: run.maxMs,
            analysisJson: JSON.stringify(analysis),
            aiRiskScore: risk.score,
            aiRiskSignalsJson: JSON.stringify(risk.signals),
          },
        });
      }, { timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      if (err instanceof AlreadyResolvedError) {
        return NextResponse.json(
          { error: "Question already resolved", code: "INVALID_STATE" },
          { status: 409 }
        );
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // unique(assessmentQuestionId): a racing submission won — same outcome
        return NextResponse.json(
          { error: "Question already resolved", code: "INVALID_STATE" },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      type: aq.question.category,
      passed,
      score,
      status,
      language,
      compileError: run.compileError,
      logs: run.logs,
      maxRuntimeMs: run.maxMs,
      analysis,
      aiRisk: risk,
      results: run.results,
      hintsUsed: aq.hintCount,
      hintPenaltyPct: aq.hintCount > 0 ? Math.round(hintPenaltyFraction(aq.hintCount) * 100) : 0,
    });
  } catch (err) {
    console.error("submit error:", err);
    return NextResponse.json({ error: "Failed to submit solution" }, { status: 500 });
  }
}

class AlreadyResolvedError extends Error {
  constructor() {
    super("already resolved");
    this.name = "AlreadyResolvedError";
  }
}
