import { NextRequest, NextResponse } from "next/server";
import { runSingleSql } from "@/lib/server/sql-exec";
import { requireRecruiter } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/questions/validate-sql — authoring helper for SQL questions.
 * Runs the recruiter's schema + seed (+ optional per-test setup) and their
 * reference solution against a fresh in-memory SQLite database, returning the
 * derived result (columns + rows) that becomes the question's expected output.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as {
      schemaSql?: string;
      seedSql?: string;
      sql?: string;
      setup?: string;
    };
    const schemaSql = String(body.schemaSql ?? "").trim();
    const sql = String(body.sql ?? "").trim();
    const seedSql = String(body.seedSql ?? "").trim();
    const setup = String(body.setup ?? "").trim();
    if (!schemaSql || !sql) {
      return NextResponse.json({ ok: false, error: "Schema SQL and solution SQL are required" }, { status: 400 });
    }
    if (schemaSql.length > 20000 || seedSql.length > 20000 || sql.length > 10000 || setup.length > 4000) {
      return NextResponse.json({ ok: false, error: "SQL block too large" }, { status: 400 });
    }

    const result = await runSingleSql({ schemaSql, seedSql, sql, setup: setup || null });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "Query failed" }, { status: 200 });
    }
    return NextResponse.json({
      ok: true,
      columns: result.columns ?? [],
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? 0,
    });
  } catch (err) {
    console.error("validate-sql error:", err);
    return NextResponse.json({ ok: false, error: "Failed to run SQL" }, { status: 500 });
  }
}
