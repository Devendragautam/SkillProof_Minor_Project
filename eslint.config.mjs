import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Lint policy (Phase-3 hardening): correctness rules are ON. Issues are fixed,
 * not suppressed — targeted inline `eslint-disable` comments are allowed only
 * where genuinely justified.
 *
 * Rules kept OFF, deliberately:
 *   - @typescript-eslint/no-explicit-any        — pervasive legacy typing; enforcing it is a
 *     separate typing-rewrite task, not a lint flag flip.
 *   - react-hooks/exhaustive-deps               — legacy effects intentionally skip deps; enforcing
 *     retroactively risks behavior changes in working features.
 *   - react-hooks/purity, react-compiler rules  — compiler-preview rules, not correctness gates.
 *   - no-console                                — structured server logging is deliberate.
 */
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ── correctness: re-enabled (was broadly off) ──────────────────────────
    "no-debugger": "error",
    "no-unreachable": "error",
    "no-unsafe-finally": "error",
    "no-redeclare": "off", // TS-aware rule below covers TS files without false positives
    "@typescript-eslint/no-redeclare": "error",
    "no-unused-vars": "off", // TS-aware rule below covers TS files without false positives
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "all" },
    ],
    "@typescript-eslint/ban-ts-comment": [
      "error",
      { "ts-ignore": "allow-with-description", "ts-expect-error": "allow-with-description", "ts-nocheck": true },
    ],
    "no-undef": "error", // disabled for TS files below — the type checker owns that job
    "prefer-const": ["error", { destructuring: "all" }],
    "no-empty": ["error", { allowEmptyCatch: true }],
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-useless-escape": "error",
    "no-irregular-whitespace": "error",

    // ── intentionally off (see policy note above) ───────────────────────────
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    "no-console": "off",
  },
}, {
  // TypeScript's own checker (npm run typecheck) owns undefined-global
  // detection in TS files — no-undef there only produces false positives
  // for ambient/browser globals.
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    "no-undef": "off",
  },
}, {
  // Declaration files legitimately use triple-slash references to pull in
  // ambient type packages (e.g. bun:test) — the import-style restriction
  // applies to source files only.
  files: ["**/*.d.ts"],
  rules: {
    "@typescript-eslint/triple-slash-reference": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "public/**", "db/**"]
}];

export default eslintConfig;
