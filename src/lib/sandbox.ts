import vm from "node:vm";
import type { TestCase, ClientTestResult } from "./types";

const TIMEOUT_MS = 1500;
const MAX_LOG_LINES = 40;

function preview(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 120 ? s.slice(0, 117) + "..." : s;
  } catch {
    return String(v);
  }
}

function makeContext(): vm.Context {
  const logs: string[] = [];
  const fakeConsole = {
    log: (...args: unknown[]) => {
      if (logs.length < MAX_LOG_LINES) {
        logs.push(args.map((a) => (typeof a === "string" ? a : preview(a))).join(" "));
      }
    },
    error: (...args: unknown[]) => {
      if (logs.length < MAX_LOG_LINES) {
        logs.push("ERROR: " + args.map((a) => (typeof a === "string" ? a : preview(a))).join(" "));
      }
    },
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  const ctx = vm.createContext({
    console: fakeConsole,
    Math,
    JSON,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    RegExp,
    Error,
    TypeError,
    RangeError,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    Symbol,
    BigInt,
    Promise,
    Infinity,
    NaN,
    undefined,
  });
  // attach logs via a symbol on globalThis
  (ctx as unknown as { __logs: string[] }).__logs = logs;
  return ctx;
}

export interface SandboxRunResult {
  results: ClientTestResult[];
  passedCount: number;
  total: number;
  compileError?: string;
  logs: string[];
  maxMs: number;
}

/**
 * Execute candidate JavaScript in an isolated V8 context with per-test
 * CPU timeout, no filesystem, no network, no require/process access.
 */
export function runTests(code: string, fnName: string, tests: TestCase[]): SandboxRunResult {
  const results: ClientTestResult[] = [];
  const logs: string[] = [];
  let compileError: string | undefined;
  let maxMs = 0;

  // quick static guard against obvious sandbox escapes
  const forbidden = /\b(require|process|globalThis|import\s*\(|Function\s*\(|eval\s*\(|WebAssembly|fetch\s*\()/;
  if (forbidden.test(code)) {
    return {
      results: [],
      passedCount: 0,
      total: tests.length,
      compileError: "Sandbox violation: require/process/eval/Function/fetch are not permitted in the execution sandbox.",
      logs: [],
      maxMs: 0,
    };
  }

  let fnMissing = false;

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const t0 = Date.now();
    const ctx = makeContext();
    let actual: unknown;
    let error: string | undefined;

    const script = `"use strict";\n${code}\n;typeof ${fnName} === "function" ? ${fnName}(...${JSON.stringify(t.args)}) : __FN_MISSING__();`;
    try {
      const value = vm.runInNewContext(
        script.replace("__FN_MISSING__()", `(0, () => { throw new ReferenceError("Function '${fnName}' was not found. Define it exactly as specified."); })()`),
        ctx,
        { timeout: TIMEOUT_MS }
      );
      actual = value;
      const d = Date.now() - t0;
      maxMs = Math.max(maxMs, d);
    } catch (e) {
      const d = Date.now() - t0;
      maxMs = Math.max(maxMs, d);
      const msg = e instanceof Error ? e.message : String(e);
      error = msg.includes("Script execution timed out")
        ? `Execution timed out after ${TIMEOUT_MS}ms (possible infinite loop)`
        : msg;
      if (error.includes("was not found")) fnMissing = true;
    }

    const ctxLogs = (ctx as unknown as { __logs?: string[] }).__logs ?? [];
    if (logs.length < MAX_LOG_LINES) logs.push(...ctxLogs.slice(0, MAX_LOG_LINES - logs.length));

    const pass =
      !error &&
      actual !== undefined &&
      JSON.stringify(actual) === JSON.stringify(t.expected);

    results.push({
      index: i,
      hidden: t.hidden,
      pass: !!pass,
      error,
      ms: Date.now() - t0,
      inputPreview: t.args.map((a) => preview(a)).join(", ").slice(0, 100),
      expectedPreview: preview(t.expected),
      actualPreview: error ? "—" : actual === undefined ? "undefined" : preview(actual),
    });
  }

  const passedCount = results.filter((r) => r.pass).length;
  if (fnMissing && !compileError) {
    compileError = `Function '${fnName}' was not found in the submitted code.`;
  }
  return { results, passedCount, total: tests.length, compileError, logs: logs.slice(0, MAX_LOG_LINES), maxMs };
}
