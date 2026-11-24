import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnedQuestionByAqId } from "@/lib/server/guards";
import { audit } from "@/lib/server/audit";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { parseJson, runBodySchema } from "@/lib/server/validate";
import { runTestsInLanguage } from "@/lib/server/lang-exec";
import { runSqlTests } from "@/lib/server/sql-exec";
import type { TestCase } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/run — execute candidate code against VISIBLE tests only.
 *
 * Authorization: the caller must be signed in and must own (or be the
 * recruiter of) the assessment the referenced question belongs to — the
 * assessment is derived server-side from the aqId; foreign IDs are 404.
 * Execution itself happens inside the isolated execution worker
 * (lib/server/exec/isolate.ts) — never on the Next.js host directly.
 * Payloads are zod-validated and unknown keys stripped.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, runBodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const auth = await requireOwnedQuestionByAqId(body.aqId);
  if (!auth.ok) return auth.response;

  if (!rateLimit(`run:${auth.user.id}`, 30, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const aq = await db.assessmentQuestion.findUnique({
      where: { id: body.aqId },
      include: { question: true },
    });
    if (!aq || aq.assessmentId !== auth.assessment.id) {
      // belt-and-braces: the referenced question must still be in THIS run
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    if (!aq.question.testsJson || (!aq.question.fnName && !aq.question.schemaSql)) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }
    const tests: TestCase[] = JSON.parse(aq.question.testsJson);
    const visible = tests.filter((t) => !t.hidden);
    const language = body.language ?? "javascript";
    const run =
      language === "sql"
        ? await runSqlTests(body.code.slice(0, 30000), visible, {
            schemaSql: aq.question.schemaSql,
            seedSql: aq.question.seedSql,
          })
        : await runTestsInLanguage(body.code.slice(0, 30000), aq.question.fnName ?? "", visible, language);
    return NextResponse.json({
      results: run.results,
      passedCount: run.passedCount,
      total: run.total,
      compileError: run.compileError,
      logs: run.logs,
      maxRuntimeMs: run.maxMs,
      language,
    });
  } catch (err) {
    console.error("run error:", err);
    audit({
      event: "exec.failure",
      outcome: "error",
      actor: { id: auth.user.id, email: auth.user.email, role: auth.user.role },
      detail: {
        aqId: body.aqId,
        language: body.language ?? "javascript",
        reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
    });
    return NextResponse.json({ error: "Execution failed" }, { status: 500 });
  }
}
