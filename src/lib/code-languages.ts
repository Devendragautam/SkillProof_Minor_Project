/** Shared code-language metadata (safe for client + server) */

export type CodeLanguage = "javascript" | "python" | "cpp" | "java" | "sql";

export interface CodeLanguageMeta {
  id: CodeLanguage;
  label: string;
  /** Monaco editor language id */
  monaco: string;
  /** Editor tab file name */
  file: string;
  /** Short badge label */
  badge: string;
}

export const CODE_LANGUAGES: CodeLanguageMeta[] = [
  { id: "javascript", label: "JavaScript", monaco: "javascript", file: "solution.js", badge: "JS" },
  { id: "python", label: "Python 3", monaco: "python", file: "solution.py", badge: "PY" },
  { id: "cpp", label: "C++", monaco: "cpp", file: "Solution.cpp", badge: "C++" },
  { id: "java", label: "Java", monaco: "java", file: "Solution.java", badge: "Java" },
  { id: "sql", label: "SQL (SQLite)", monaco: "sql", file: "solution.sql", badge: "SQL" },
];

export const CODE_LANGUAGE_IDS: CodeLanguage[] = CODE_LANGUAGES.map((l) => l.id);

export function codeLanguageMeta(id: string): CodeLanguageMeta | undefined {
  return CODE_LANGUAGES.find((l) => l.id === id);
}

/** Parse a `function name(a, b)` or `var name = function (a, b)` JS starter into { name, params } */
export function parseJsSignature(starterCode: string | null | undefined): { name: string; params: string[] } | null {
  if (!starterCode) return null;
  let m = starterCode.match(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
  if (!m) m = starterCode.match(/([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/);
  if (!m) return null;
  const params = m[2]
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return { name: m[1], params };
}

/** Build the canonical JS starter for a signature (used when a question has none) */
export function buildJsStarter(fnName: string, params: string[]): string {
  return `function ${fnName}(${params.join(", ")}) {\n  // your code here\n}\n`;
}

/** Default starter for SQL questions (SQLite dialect) */
export const SQL_STARTER = `-- SQLite — write a single SELECT statement
-- Column names/order of your SELECT must match the expected output
SELECT ...;
`;
