import type { CodeLanguage } from "@/lib/code-languages";
import { buildJsStarter, parseJsSignature } from "@/lib/code-languages";
import type { TestCase } from "@/lib/types";

/**
 * Type inference + per-language starter generation.
 *
 * Test arguments arrive as JSON. We infer a "family" (kind + depth + width)
 * per argument/return from the test cases, then map to LeetCode-style typed
 * signatures for C++ and Java. If inference fails for a language, that
 * language is simply not offered for the question.
 */

export type CppType =
  | "int"
  | "long long"
  | "double"
  | "bool"
  | "string"
  | "vector<int>"
  | "vector<long long>"
  | "vector<double>"
  | "vector<bool>"
  | "vector<string>"
  | "vector<vector<int>>"
  | "vector<vector<long long>>"
  | "vector<vector<double>>"
  | "vector<vector<string>>";

export type JavaType =
  | "int"
  | "long"
  | "double"
  | "boolean"
  | "String"
  | "int[]"
  | "long[]"
  | "double[]"
  | "boolean[]"
  | "String[]"
  | "List<Integer>"
  | "List<List<Integer>>"
  | "List<List<String>>"
  | "List<List<Double>>";

interface Family {
  kind: "int" | "double" | "bool" | "string";
  wide: boolean; // int magnitude beyond int32 → long long / long
  depth: number; // 0 scalar, 1 array, 2 nested array
}

/**
 * Infer the family of a JSON value; null when un-inferable
 * (objects, null, mixed depths, mixed kinds like [1, "a"], empty arrays).
 */
function inferFamily(v: unknown): Family | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return Number.isInteger(v)
      ? { kind: "int", wide: Math.abs(v) > 2147483647, depth: 0 }
      : { kind: "double", wide: false, depth: 0 };
  }
  if (typeof v === "boolean") return { kind: "bool", wide: false, depth: 0 };
  if (typeof v === "string") return { kind: "string", wide: false, depth: 0 };
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    let best: Family | null = null;
    for (const el of v) {
      const f = inferFamily(el);
      if (!f) return null;
      if (!best) {
        best = f;
        continue;
      }
      if (f.depth !== best.depth) return null;
      if (f.kind !== best.kind) {
        // int + double promote to double
        if ((f.kind === "int" && best.kind === "double") || (f.kind === "double" && best.kind === "int")) {
          best = { kind: "double", wide: false, depth: f.depth };
        } else {
          return null;
        }
      }
      if (f.wide) best = { ...best, wide: true };
    }
    return best ? { kind: best.kind, wide: best.wide, depth: best.depth + 1 } : null;
  }
  return null;
}

function unifyFamily(a: Family | null, b: Family | null): Family | null {
  if (!a) return b;
  if (!b) return a;
  if (a.depth !== b.depth) return null;
  if (a.kind === b.kind) return { kind: a.kind, wide: a.wide || b.wide, depth: a.depth };
  // int + double promote to double
  if ((a.kind === "int" && b.kind === "double") || (a.kind === "double" && b.kind === "int")) {
    return { kind: "double", wide: false, depth: a.depth };
  }
  return null;
}

function cppType(f: Family): CppType | null {
  const { kind, wide, depth } = f;
  if (depth === 0) {
    if (kind === "int") return wide ? "long long" : "int";
    if (kind === "double") return "double";
    if (kind === "bool") return "bool";
    return "string";
  }
  if (depth === 1) {
    if (kind === "int") return wide ? "vector<long long>" : "vector<int>";
    if (kind === "double") return "vector<double>";
    if (kind === "bool") return "vector<bool>";
    return "vector<string>";
  }
  if (depth === 2) {
    if (kind === "int") return wide ? "vector<vector<long long>>" : "vector<vector<int>>";
    if (kind === "double") return "vector<vector<double>>";
    if (kind === "string") return "vector<vector<string>>";
    return null;
  }
  return null;
}

function javaType(f: Family): JavaType | null {
  const { kind, wide, depth } = f;
  if (depth === 0) {
    if (kind === "int") return wide ? "long" : "int";
    if (kind === "double") return "double";
    if (kind === "bool") return "boolean";
    return "String";
  }
  if (depth === 1) {
    if (kind === "int") return wide ? "long[]" : "int[]";
    if (kind === "double") return "double[]";
    if (kind === "bool") return "boolean[]";
    return "String[]";
  }
  if (depth === 2) {
    if (kind === "int") return wide ? null : "List<List<Integer>>";
    if (kind === "double") return "List<List<Double>>";
    if (kind === "string") return "List<List<String>>";
    return null;
  }
  return null;
}

export interface InferredSignature {
  paramCpp: CppType[];
  paramJava: JavaType[];
  retCpp: CppType | null;
  retJava: JavaType | null;
}

/**
 * Infer a typed signature from test cases. A param whose type is
 * undecidable in one test may be decidable in another (e.g. an empty array
 * in test 0 but populated in test 1) — inference unions across all tests.
 * Null (no signature) when anything remains un-inferable or tests disagree.
 */
export function inferSignature(fnName: string, tests: TestCase[]): InferredSignature | null {
  if (!fnName || tests.length === 0) return null;

  const arity = tests[0].args.length;
  if (!tests.every((t) => t.args.length === arity)) return null;

  const paramFam: Array<Family | null> = Array.from({ length: arity }, () => null);
  let retFam: Family | null = null;

  for (const t of tests) {
    for (let i = 0; i < arity; i++) {
      paramFam[i] = unifyFamily(paramFam[i], inferFamily(t.args[i]));
    }
    retFam = unifyFamily(retFam, inferFamily(t.expected));
  }

  if (!retFam) return null;
  for (let i = 0; i < arity; i++) if (!paramFam[i]) return null;

  const paramCpp: CppType[] = [];
  const paramJava: JavaType[] = [];
  for (let i = 0; i < arity; i++) {
    const c = cppType(paramFam[i]!);
    const j = javaType(paramFam[i]!);
    if (!c || !j) return null;
    paramCpp.push(c);
    paramJava.push(j);
  }

  return { paramCpp, paramJava, retCpp: cppType(retFam), retJava: javaType(retFam) };
}

// ─── starter generation ─────────────────────────────────────────────────────

const CPP_PRELUDE_COMMENT = "#include <bits/stdc++.h>\nusing namespace std;\n\n";

function cppStarter(sig: InferredSignature, fnName: string, paramNames: string[] | null): string {
  const params = sig.paramCpp
    .map((t, i) => `${t}${t.startsWith("vector<") ? "&" : ""} ${paramNames?.[i] ?? `arg${i + 1}`}`)
    .join(", ");
  return `${CPP_PRELUDE_COMMENT}class Solution {\npublic:\n    ${sig.retCpp} ${fnName}(${params}) {\n        // your code here\n    }\n};\n`;
}

function javaStarter(sig: InferredSignature, fnName: string, paramNames: string[] | null): string {
  const params = sig.paramJava.map((t, i) => `${t} ${paramNames?.[i] ?? `arg${i + 1}`}`).join(", ");
  return `class Solution {\n    public ${sig.retJava} ${fnName}(${params}) {\n        // your code here\n    }\n}\n`;
}

function pythonStarter(fnName: string, paramNames: string[]): string {
  return `def ${fnName}(${paramNames.join(", ")}):\n    # your code here\n    pass\n`;
}

export interface StarterBundle {
  starters: Partial<Record<CodeLanguage, string>>;
  languages: CodeLanguage[];
}

/**
 * Build the per-language starter bundle for a question.
 * - javascript: always offered (stored JS starter, or generated).
 * - python: always offered (JSON args map naturally to Python values).
 * - cpp / java: offered only when a typed signature is inferable from tests.
 */
export function buildStarters(
  fnName: string | null | undefined,
  starterCode: string | null | undefined,
  tests: TestCase[]
): StarterBundle {
  if (!fnName || !tests.length) return { starters: {}, languages: ["javascript"] };

  const jsSig = parseJsSignature(starterCode);
  const paramNames: string[] | null =
    jsSig && jsSig.name === fnName && jsSig.params.length === tests[0].args.length ? jsSig.params : null;
  const fallbackNames = tests[0].args.map((_, i) => `arg${i + 1}`);

  const jsStarter = starterCode?.trim() ? starterCode : buildJsStarter(fnName, paramNames ?? fallbackNames);

  const starters: Partial<Record<CodeLanguage, string>> = {
    javascript: jsStarter,
    python: pythonStarter(fnName, paramNames ?? fallbackNames),
  };
  const languages: CodeLanguage[] = ["javascript", "python"];

  const sig = inferSignature(fnName, tests);
  if (sig && sig.retCpp && sig.retJava) {
    starters.cpp = cppStarter(sig, fnName, paramNames);
    starters.java = javaStarter(sig, fnName, paramNames);
    languages.push("cpp", "java");
  }

  return { starters, languages };
}
