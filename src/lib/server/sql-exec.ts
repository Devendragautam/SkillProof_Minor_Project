import fs from "node:fs";
import path from "node:path";
import { jsonEquivalent } from "@/lib/server/lang-exec";
import { runIsolated, withStaging } from "@/lib/server/exec/isolate";
import type { ClientTestResult, TestCase } from "@/lib/types";

/**
 * SQL execution engine (SQLite via bun:sqlite, run in an isolated subprocess).
 *
 * A SQL question stores:
 *  - schemaSql   : CREATE TABLE statements (applied to a fresh in-memory DB per run)
 *  - seedSql     : INSERT statements (applied after the schema, before every test)
 *  - testsJson   : [{ setup?, expected, hidden, unordered? }] where `expected` is an
 *                  array of rows (array-of-arrays, in the reference column order) and
 *                  `setup` is optional SQL applied before the candidate query (per-test
 *                  scenario changes).
 *  - solutionSql : recruiter-facing reference solution (authoring derives expected rows).
 *
 * Candidate SQL must be a single SELECT statement. The harness runs in an
 * isolated subprocess (bun inside the same namespace/seccomp/rlimit/environ
 * isolation wrapper as the python/cpp/java runners — no network, /home
 * hidden, secrets scrubbed, SIGKILL timeout, process-group kill). The harness
 * never sees expected values; the server compares harness output against the
 * stored tests (float-tolerant canonical compare).
 */

const RUN_TIMEOUT = 8000;
const ROW_CAP = 5000;

/** Statements that must never reach the engine (candidate SQL / authoring SQL). */
export function assertSqlSafe(sql: string): void {
  if (/\b(attach|detach|pragma|vacuum|load_extension|reindex)\b/i.test(sql)) {
    throw new Error("Only read-only SELECT statements are allowed (ATTACH / PRAGMA / VACUUM are disabled)");
  }
  if (/^\s*(\.\w)/m.test(sql)) {
    throw new Error("Dot-commands are not allowed — write plain SQL");
  }
}

const HARNESS = String.raw`const fs = require("fs");
const path = require("path");
const { Database } = require("bun:sqlite");
const testsPath = process.argv[2];
const mode = process.argv[3] || "tests"; // "tests" | "single"
const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
const seed = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");
const sql = fs.readFileSync(path.join(__dirname, "candidate.sql"), "utf8").replace(/\s*;\s*$/, "");

function buildDb(setupSql) {
  const db = new Database(":memory:");
  db.exec(schema);
  if (seed.trim()) db.exec(seed);
  if (setupSql && setupSql.trim()) db.exec(setupSql);
  try { db.exec("PRAGMA query_only = ON;"); } catch {}
  return db;
}

function runQuery(db) {
  const stmt = db.prepare(sql); // throws on syntax errors / multiple statements
  let cols = [];
  try { if (typeof stmt.columns === "function") cols = stmt.columns().map((c) => c.name); } catch {}
  const rows = [];
  for (const row of stmt.iterate()) {
    const vals = Object.values(row);
    if (!cols.length) cols = Object.keys(row);
    rows.push(vals);
    if (rows.length > ${ROW_CAP}) throw new Error("Query returned more than ${ROW_CAP} rows");
  }
  return { columns: cols, rows };
}

if (mode === "single") {
  try {
    const db = buildDb(process.argv[4] || "");
    const res = runQuery(db);
    db.close();
    console.log("SINGLE " + JSON.stringify({ ok: true, columns: res.columns, rows: res.rows }));
  } catch (e) {
    console.log("SINGLE " + JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
  }
} else {
  const tests = JSON.parse(fs.readFileSync(testsPath, "utf8"));
  for (let i = 0; i < tests.length; i++) {
    const started = Date.now();
    try {
      const db = buildDb(tests[i].setup || "");
      const res = runQuery(db);
      db.close();
      console.log("TEST " + JSON.stringify({ i, ok: true, ms: Date.now() - started, columns: res.columns, rows: res.rows }));
    } catch (e) {
      console.log("TEST " + JSON.stringify({ i, ok: false, ms: Date.now() - started, error: String((e && e.message) || e) }));
    }
  }
}
`;

export interface SqlSingleResult {
  ok: boolean;
  columns?: string[];
  rows?: unknown[][];
  rowCount?: number;
  error?: string;
}

/** Run one SQL text against a fresh schema+seed DB — used for authoring/validation. */
export async function runSingleSql(opts: {
  schemaSql: string;
  seedSql?: string | null;
  sql: string;
  setup?: string | null;
}): Promise<SqlSingleResult> {
  assertSqlSafe(opts.sql);
  if (opts.setup) assertSqlSafe(opts.setup);
  return withStaging("sp-sql-", async (dir) => {
    fs.writeFileSync(path.join(dir, "schema.sql"), opts.schemaSql, "utf8");
    fs.writeFileSync(path.join(dir, "seed.sql"), opts.seedSql ?? "", "utf8");
    fs.writeFileSync(path.join(dir, "candidate.sql"), opts.sql, "utf8");
    fs.writeFileSync(path.join(dir, "harness.js"), HARNESS, "utf8");
    const res = await runIsolated({
      cmd: "/usr/local/bin/bun",
      args: ["harness.js", "unused.json", "single", opts.setup ?? ""],
      cwd: dir,
      timeoutMs: RUN_TIMEOUT,
      maxStdoutBytes: 16 * 1024 * 1024,
      maxStderrBytes: 256 * 1024,
      limits: { cpuSec: 8, asBytes: 2 * 1024 * 1024 * 1024, nproc: 256, fsizeBytes: 2 * 1024 * 1024 },
    });
    const line = res.stdout.split("\n").find((l) => l.startsWith("SINGLE "));
    if (!line) {
      return { ok: false, error: res.timedOut ? "Query timed out (8s limit)" : (res.stderr || "SQL execution failed").slice(0, 300) };
    }
    const parsed = JSON.parse(line.slice("SINGLE ".length)) as SqlSingleResult;
    if (parsed.ok && parsed.rows) parsed.rowCount = parsed.rows.length;
    return parsed;
  });
}

function previewRows(rows: unknown[][]): string {
  if (!rows.length) return "∅ (0 rows)";
  const shown = rows.slice(0, 3).map((r) => JSON.stringify(r));
  return `${rows.length} row${rows.length === 1 ? "" : "s"} · ${shown.join(" | ")}${rows.length > 3 ? " …" : ""}`.slice(0, 220);
}

function canonKey(row: unknown[]): string {
  return JSON.stringify(
    row.map((v) => {
      if (v === null) return null;
      if (typeof v === "number") return Math.round(v * 1e9) / 1e9;
      return v;
    })
  );
}

function rowsEquivalent(actual: unknown[][], expected: unknown, unordered: boolean): boolean {
  if (!Array.isArray(expected)) return false;
  if (actual.length !== expected.length) return false;
  if (unordered) {
    const a = [...actual].map(canonKey).sort();
    const e = (expected as unknown[][])
      .map((r) => (Array.isArray(r) ? canonKey(r as unknown[]) : JSON.stringify(r)))
      .sort();
    return a.every((v, i) => v === e[i]);
  }
  const expRows = expected as unknown[][];
  return actual.every((row, i) => {
    const exp = expRows[i];
    if (!Array.isArray(exp) || exp.length !== row.length) return false;
    return row.every((v, j) => jsonEquivalent(v, exp[j] as unknown));
  });
}

export interface SqlRunResult {
  results: ClientTestResult[];
  passedCount: number;
  total: number;
  compileError?: string;
  logs: string[];
  maxMs: number;
}

/** Run candidate SQL against every test (fresh DB per test, optional per-test setup). */
export async function runSqlTests(
  code: string,
  tests: TestCase[],
  opts: { schemaSql: string | null; seedSql: string | null }
): Promise<SqlRunResult> {
  const empty = (error: string): SqlRunResult => ({
    results: tests.map((t, i) => ({
      index: i,
      hidden: t.hidden,
      pass: false,
      error,
      ms: 0,
      inputPreview: t.setup ? `setup: ${t.setup.slice(0, 80)}` : "shared dataset",
      expectedPreview: Array.isArray(t.expected) ? previewRows(t.expected as unknown[][]) : String(t.expected).slice(0, 120),
      actualPreview: "—",
    })),
    passedCount: 0,
    total: tests.length,
    compileError: error,
    logs: [],
    maxMs: 0,
  });

  if (!opts.schemaSql) return empty("SQL question is misconfigured — no schema provided");
  const schemaSql: string = opts.schemaSql;
  const candidate = code.trim();
  if (!candidate) return empty("No query submitted — write a SELECT statement");

  try {
    assertSqlSafe(candidate);
  } catch (e) {
    return empty((e as Error).message);
  }

  return withStaging("sp-sql-", async (dir) => {
    fs.writeFileSync(path.join(dir, "schema.sql"), schemaSql, "utf8");
    fs.writeFileSync(path.join(dir, "seed.sql"), opts.seedSql ?? "", "utf8");
    fs.writeFileSync(path.join(dir, "candidate.sql"), candidate, "utf8");
    fs.writeFileSync(path.join(dir, "harness.js"), HARNESS, "utf8");
    const payload = tests.map((t) => ({ setup: t.setup ?? "" }));
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify(payload), "utf8");

    const res = await runIsolated({
      cmd: "/usr/local/bin/bun",
      args: ["harness.js", "tests.json"],
      cwd: dir,
      timeoutMs: RUN_TIMEOUT * 2,
      maxStdoutBytes: 16 * 1024 * 1024,
      maxStderrBytes: 256 * 1024,
      limits: { cpuSec: 16, asBytes: 2 * 1024 * 1024 * 1024, nproc: 256, fsizeBytes: 2 * 1024 * 1024 },
    });

    if (res.timedOut) return empty("Query timed out (8s limit per test)");

    const byIndex = new Map<number, { ok: boolean; ms?: number; columns?: string[]; rows?: unknown[][]; error?: string }>();
    for (const line of res.stdout.split("\n")) {
      if (!line.startsWith("TEST ")) continue;
      try {
        const o = JSON.parse(line.slice("TEST ".length)) as { i: number; ok: boolean; ms: number; columns?: string[]; rows?: unknown[][]; error?: string };
        byIndex.set(o.i, o);
      } catch {
        // ignore malformed lines
      }
    }

    const results: ClientTestResult[] = tests.map((t, i) => {
      const raw = byIndex.get(i);
      const inputPreview = t.setup ? `setup: ${t.setup.slice(0, 80)}` : "shared dataset";
      const expectedPreview = Array.isArray(t.expected) ? previewRows(t.expected as unknown[][]) : String(t.expected).slice(0, 120);
      if (!raw) {
        return { index: i, hidden: t.hidden, pass: false, error: "No result from the SQL engine", ms: 0, inputPreview, expectedPreview, actualPreview: "—" };
      }
      if (!raw.ok) {
        return { index: i, hidden: t.hidden, pass: false, error: raw.error || "Query failed", ms: raw.ms ?? 0, inputPreview, expectedPreview, actualPreview: "—" };
      }
      const pass = rowsEquivalent(raw.rows ?? [], t.expected, !!t.unordered);
      return {
        index: i,
        hidden: t.hidden,
        pass,
        error: pass ? undefined : "Result rows do not match the expected output",
        ms: raw.ms ?? 0,
        inputPreview,
        expectedPreview,
        actualPreview: previewRows(raw.rows ?? []),
      };
    });

    const allErrored = results.length > 0 && results.every((r) => !r.pass && r.error && r.error !== "Result rows do not match the expected output");
    return {
      results,
      passedCount: results.filter((r) => r.pass).length,
      total: results.length,
      compileError: allErrored ? (byIndex.get(0)?.error ?? "Query failed") : undefined,
      logs: [],
      maxMs: Math.max(0, ...results.map((r) => r.ms)),
    };
  });
}
