import { SKILL_CATALOG } from "@/lib/skills";
import { assertSqlSafe } from "@/lib/server/sql-exec";

/**
 * Shared question-draft types, validation and parsing helpers used by
 * POST /api/questions (custom create) and POST /api/questions/import.
 */

export interface DraftTest {
  args: unknown[];
  expected: unknown;
  hidden: boolean;
  /** SQL questions: statements applied (after schema+seed) before the query */
  setup?: string;
  /** SQL questions: compare result rows ignoring row order */
  unordered?: boolean;
}

export interface QuestionDraft {
  title: string;
  description: string;
  skill: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  fnName: string;
  starterCode: string;
  tests: DraftTest[];
  timeLimitSec: number;
  points: number;
  hint?: string;
  sourceUrl?: string;
  source: "imported" | "custom";
  /** SQL questions */
  mode?: "code" | "sql";
  schemaSql?: string;
  seedSql?: string;
  solutionSql?: string;
}

/** All Question.skill values assessments can draw from */
export const QUESTION_SKILL_VALUES: string[] = Array.from(new Set(SKILL_CATALOG.flatMap((s) => s.questionSkills))).sort();

export interface DraftValidation {
  ok: boolean;
  error?: string;
  clean?: QuestionDraft & { externalSlug: string };
}

const FN_RE = /^[A-Za-z_$][\w$]*$/;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function jsonSize(v: unknown): number {
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return -1;
  }
}

function isSerializable(v: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return true;
  if (Array.isArray(v)) return v.length <= 64 && v.every((x) => isSerializable(x, depth + 1));
  return false;
}

/** Slugify a title for the externalId */
export function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "question"
  );
}

/** Validate + normalize a client-supplied draft. Returns 400-ready error text. */
export function validateQuestionDraft(raw: unknown): DraftValidation {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Draft payload required" };
  const d = raw as Partial<QuestionDraft>;
  const mode = d.mode === "sql" || (!d.mode && typeof d.schemaSql === "string" && d.schemaSql.trim()) ? "sql" : "code";
  if (mode === "sql") return validateSqlDraft(d);
  return validateCodeDraft(d);
}

function validateCommon(d: Partial<QuestionDraft>) {
  const title = String(d.title ?? "").trim();
  if (title.length < 5 || title.length > 160) return { error: "Title must be 5–160 characters" };

  const description = String(d.description ?? "").trim();
  if (description.length < 20 || description.length > 8000) {
    return { error: "Description must be 20–8000 characters" };
  }

  const skill = String(d.skill ?? "").trim();
  if (!QUESTION_SKILL_VALUES.includes(skill)) {
    return { error: `Skill must be one of: ${QUESTION_SKILL_VALUES.join(", ")}` };
  }

  const topic = String(d.topic ?? "").trim().slice(0, 60) || skill;
  if (topic.length < 2) return { error: "Topic must be at least 2 characters" };

  const difficulty = String(d.difficulty ?? "medium");
  if (!DIFFICULTIES.has(difficulty)) return { error: "Difficulty must be easy, medium or hard" };

  const timeLimitSec = Math.round(Number(d.timeLimitSec ?? 900));
  if (!Number.isFinite(timeLimitSec) || timeLimitSec < 120 || timeLimitSec > 3600) {
    return { error: "Time limit must be 120–3600 seconds" };
  }

  const points = Math.round(Number(d.points ?? 10));
  if (!Number.isFinite(points) || points < 5 || points > 100) {
    return { error: "Points must be 5–100" };
  }

  const sourceUrl = String(d.sourceUrl ?? "").trim();
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return { error: "Source URL must start with http(s)://" };

  return {
    title,
    description,
    skill,
    topic,
    difficulty: difficulty as QuestionDraft["difficulty"],
    timeLimitSec,
    points,
    hint: String(d.hint ?? "").trim().slice(0, 500) || undefined,
    sourceUrl: sourceUrl || undefined,
    source: d.source === "imported" ? ("imported" as const) : ("custom" as const),
  };
}

/** SQL-question validation: schema/seed/solution + row-based tests (no args). */
function validateSqlDraft(d: Partial<QuestionDraft>): DraftValidation {
  const common = validateCommon(d);
  if ("error" in common) return { ok: false, error: common.error };

  const schemaSql = String(d.schemaSql ?? "").trim();
  if (schemaSql.length < 5 || schemaSql.length > 20000) {
    return { ok: false, error: "Schema SQL must be 5–20000 characters and include CREATE TABLE statements" };
  }
  if (!/\bcreate\s+table\b/i.test(schemaSql)) {
    return { ok: false, error: "Schema SQL must include at least one CREATE TABLE statement" };
  }
  const seedSql = String(d.seedSql ?? "").trim();
  if (seedSql.length > 20000) return { ok: false, error: "Seed SQL must be at most 20000 characters" };
  const solutionSql = String(d.solutionSql ?? "").trim();
  if (solutionSql.length < 5 || solutionSql.length > 10000) {
    return { ok: false, error: "Reference solution SQL must be 5–10000 characters" };
  }
  try {
    assertSqlSafe(schemaSql);
    if (seedSql) assertSqlSafe(seedSql);
    assertSqlSafe(solutionSql);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const fnName = String(d.fnName ?? "").trim() || "run_query";
  if (!FN_RE.test(fnName)) return { ok: false, error: "Function name must be a valid identifier when provided" };
  const starterCode = String(d.starterCode ?? "").slice(0, 4000);

  if (!Array.isArray(d.tests) || d.tests.length === 0 || d.tests.length > 10) {
    return { ok: false, error: "Provide between 1 and 10 test cases" };
  }
  const tests: DraftTest[] = [];
  for (let i = 0; i < d.tests.length; i++) {
    const t = d.tests[i] as Partial<DraftTest>;
    if (t.args !== undefined && Array.isArray(t.args) && t.args.length > 0) {
      return { ok: false, error: `Test ${i + 1}: SQL questions take no arguments — expected must be the result rows` };
    }
    if (!Array.isArray(t.expected)) {
      return { ok: false, error: `Test ${i + 1}: expected must be an array of result rows` };
    }
    if ((t.expected as unknown[]).some((row) => !Array.isArray(row))) {
      return { ok: false, error: `Test ${i + 1}: every expected row must be an array of column values` };
    }
    if ((t.expected as unknown[]).length > 5000) {
      return { ok: false, error: `Test ${i + 1}: max 5000 expected rows` };
    }
    if (!isSerializable(t.expected)) return { ok: false, error: `Test ${i + 1}: expected rows must be JSON values` };
    const setup = String(t.setup ?? "").trim();
    if (setup.length > 4000) return { ok: false, error: `Test ${i + 1}: setup SQL must be at most 4000 characters` };
    if (setup) {
      try {
        assertSqlSafe(setup);
      } catch (e) {
        return { ok: false, error: `Test ${i + 1}: ${(e as Error).message}` };
      }
    }
    const size = jsonSize({ expected: t.expected, setup });
    if (size < 0 || size > 6000) return { ok: false, error: `Test ${i + 1}: payload too large (max ~6KB)` };
    tests.push({ args: [], expected: t.expected, hidden: !!t.hidden, setup: setup || undefined, unordered: !!t.unordered || undefined });
  }

  return {
    ok: true,
    clean: {
      ...common,
      mode: "sql",
      fnName,
      starterCode,
      schemaSql,
      seedSql: seedSql || undefined,
      solutionSql,
      tests,
      externalSlug: slugifyTitle(common.title),
    },
  };
}

function validateCodeDraft(d: Partial<QuestionDraft>): DraftValidation {
  const common = validateCommon(d);
  if ("error" in common) return { ok: false, error: common.error };

  const fnName = String(d.fnName ?? "").trim();
  if (!FN_RE.test(fnName)) return { ok: false, error: "Function name must be a valid identifier (e.g. twoSum)" };

  const starterCode = String(d.starterCode ?? "").slice(0, 4000);

  if (!Array.isArray(d.tests) || d.tests.length === 0 || d.tests.length > 10) {
    return { ok: false, error: "Provide between 1 and 10 test cases" };
  }
  const tests: DraftTest[] = [];
  for (let i = 0; i < d.tests.length; i++) {
    const t = d.tests[i] as Partial<DraftTest>;
    if (!Array.isArray(t.args) || t.args.length === 0) {
      return { ok: false, error: `Test ${i + 1}: args must be a non-empty JSON array` };
    }
    if (t.args.length > 8) return { ok: false, error: `Test ${i + 1}: max 8 arguments` };
    if (!isSerializable(t.args)) return { ok: false, error: `Test ${i + 1}: args must be JSON values (arrays, numbers, strings, booleans)` };
    if (t.expected === undefined) return { ok: false, error: `Test ${i + 1}: expected value required` };
    if (!isSerializable(t.expected)) return { ok: false, error: `Test ${i + 1}: expected must be a JSON value` };
    const size = jsonSize({ args: t.args, expected: t.expected });
    if (size < 0 || size > 6000) return { ok: false, error: `Test ${i + 1}: payload too large (max ~6KB)` };
    tests.push({ args: t.args, expected: t.expected, hidden: !!t.hidden });
  }

  const timeLimitSec = Math.round(Number(d.timeLimitSec ?? 900));
  if (!Number.isFinite(timeLimitSec) || timeLimitSec < 120 || timeLimitSec > 3600) {
    return { ok: false, error: "Time limit must be 120–3600 seconds" };
  }

  const points = Math.round(Number(d.points ?? 10));
  if (!Number.isFinite(points) || points < 5 || points > 100) {
    return { ok: false, error: "Points must be 5–100" };
  }

  const sourceUrl = String(d.sourceUrl ?? "").trim();
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) return { ok: false, error: "Source URL must start with http(s)://" };

  return {
    ok: true,
    clean: {
      title: common.title,
      description: common.description,
      skill: common.skill,
      topic: common.topic,
      difficulty: common.difficulty,
      fnName,
      starterCode,
      tests,
      timeLimitSec: common.timeLimitSec,
      points: common.points,
      hint: common.hint,
      sourceUrl: common.sourceUrl,
      source: common.source,
      externalSlug: slugifyTitle(common.title),
    },
  };
}

// ─── LeetCode HTML → readable text ──────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  quot: '"',
  lt: "<",
  gt: ">",
  amp: "&",
  nbsp: " ",
  apos: "'",
  "#39": "'",
  "#x27": "'",
  "#x2B": "+",
};

export function htmlToText(html: string): string {
  let s = html;
  // preserve structure of common blocks
  s = s.replace(/<pre[^>]*>/gi, "\n```\n").replace(/<\/pre>/gi, "\n```\n");
  s = s.replace(/<p[^>]*>/gi, "\n").replace(/<\/p>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n• ").replace(/<\/li>/gi, "");
  s = s.replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<strong[^>]*>|<b[^>]*>/gi, "").replace(/<\/strong>|<\/b>/gi, "");
  s = s.replace(/<em[^>]*>|<i[^>]*>/gi, "").replace(/<\/em>|<\/i>/gi, "");
  s = s.replace(/<code[^>]*>/gi, "").replace(/<\/code>/gi, "");
  s = s.replace(/<sup[^>]*>/gi, "^").replace(/<\/sup>/gi, "");
  // strip all remaining tags
  s = s.replace(/<[^>]+>/g, "");
  // decode entities (numeric + named, possibly with trailing semicolon)
  s = s.replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  s = s.replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
  s = s.replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
  // collapse whitespace
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/**
 * Parse LeetCode-style examples into test cases:
 *   Input: nums = [2,7,11,15], target = 9
 *   Output: [0,1]
 * Returns parsed {args, expected} entries; entries that fail to parse are skipped.
 */
export function parseExamples(text: string, paramNames: string[] | null): DraftTest[] {
  const tests: DraftTest[] = [];
  const re = /Input:\s*([\s\S]*?)\n\s*Output:\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && tests.length < 5) {
    const inputPart = m[1].trim();
    const outputPart = m[2].trim().replace(/^`\[?|`$/g, "");
    const expected = parseJsonish(outputPart);
    if (expected === undefined) continue;

    // split assignments respecting brackets/quotes
    const values = parseAssignments(inputPart);
    if (!values || values.length === 0) continue;

    let args: unknown[];
    if (paramNames && paramNames.length === values.length) {
      args = paramNames.map((p) => values.find((v) => v.name === p)?.value).map((v) => (v === undefined ? null : v));
      if (args.some((a) => a === null)) continue;
    } else {
      args = values.map((v) => v.value);
    }
    tests.push({ args, expected, hidden: false });
  }
  return tests;
}

function parseAssignments(input: string): Array<{ name: string; value: unknown }> | null {
  const out: Array<{ name: string; value: unknown }> = [];
  let i = 0;
  while (i < input.length) {
    const nm = input.slice(i).match(/^\s*([A-Za-z_][\w]*)\s*=\s*/);
    if (!nm) return out.length ? out : null;
    i += nm[0].length;
    const val = readValue(input, i);
    if (!val) return null;
    out.push({ name: nm[1], value: val.value });
    i = val.end;
    // skip trailing comma / constraint suffixes
    const rest = input.slice(i).match(/^\s*,?/);
    if (rest) i += rest[0].length;
  }
  return out;
}

function readValue(s: string, start: number): { value: unknown; end: number } | null {
  let i = start;
  while (i < s.length && s[i] === " ") i++;
  if (s[i] === "[") {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "[") depth++;
      else if (s[j] === "]") {
        depth--;
        if (depth === 0) return { value: parseJsonish(s.slice(i, j + 1)), end: j + 1 };
      }
    }
    return null;
  }
  if (s[i] === '"') {
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === '"') return { value: parseJsonish(s.slice(i, j + 1)), end: j + 1 };
    }
    return null;
  }
  // scalar: read until comma/newline
  let j = i;
  while (j < s.length && !",\n".includes(s[j])) j++;
  return { value: parseJsonish(s.slice(i, j).trim()), end: j };
}

/** JSON.parse with lenient cleanups (single quotes, trailing text) */
function parseJsonish(raw: string): unknown {
  const t = raw.trim().replace(/^`|`$/g, "");
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(t.replace(/'/g, '"'));
    } catch {
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      if (t === "true") return true;
      if (t === "false") return false;
      if (t === "null") return null;
      return undefined;
    }
  }
}

/** Extract fnName + params from a JS starter snippet (both `function name(...)` and `var name = function(...)` styles) */
export function paramsFromJsSnippet(code: string): { fnName: string; params: string[] } | null {
  let m = code.match(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (!m) m = code.match(/([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/);
  if (!m) return null;
  return {
    fnName: m[1],
    params: m[2].split(",").map((p) => p.trim()).filter(Boolean),
  };
}

// ─── externalId uniqueness helper ───────────────────────────────────────────

export async function uniqueExternalId(base: string): Promise<string> {
  const { db } = await import("@/lib/db");
  let id = base;
  for (let n = 2; n < 60; n++) {
    const exists = await db.question.findUnique({ where: { externalId: id }, select: { id: true } });
    if (!exists) return id;
    id = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}
