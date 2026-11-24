#!/usr/bin/env node
/**
 * Production preflight — run before starting the app in production:
 *
 *     NODE_ENV=production npm run preflight
 *
 * Verifies the deployment configuration is actually production-safe:
 *   1. NODE_ENV=production
 *   2. SESSION_SECRET set and cryptographically strong
 *   3. DATABASE_URL set, NOT pointing inside the source tree, and the target
 *      file does NOT contain demo data (checked by marker emails)
 *   4. DEMO_MODE / NEXT_PUBLIC_DEMO_MODE off
 *   5. COOKIE_INSECURE unset (HTTPS-only cookies)
 *   6. provisioned recruiter password provided via env
 *
 * Exits non-zero with a clear report on the first failure class found.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const problems = [];
const warnings = [];

// 1 ─ NODE_ENV
if (process.env.NODE_ENV !== "production") {
  problems.push("NODE_ENV must be 'production' for a production launch.");
}

// 2 ─ SESSION_SECRET
const secret = process.env.SESSION_SECRET?.trim() ?? "";
if (!secret) {
  problems.push("SESSION_SECRET is not set — session tokens would fall back to an error in production boot.");
} else if (secret.length < 32) {
  problems.push(`SESSION_SECRET is too weak (${secret.length} chars — need ≥32, use 48 random bytes).`);
}
const insecureCookie = process.env.COOKIE_INSECURE === "1";

// 3 ─ DATABASE_URL
const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!dbUrl.startsWith("file:")) {
  problems.push("DATABASE_URL must be a SQLite file: URL.");
} else {
  const dbPath = dbUrl.slice("file:".length);
  const abs = isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), "prisma", dbPath);
  const repoRoot = process.cwd();
  if (abs.startsWith(repoRoot)) {
    warnings.push(
      `DATABASE_URL (${abs}) lives inside the app tree — prefer a dedicated data directory (e.g. /var/lib/skillproof) so deployments never ship or clobber the database.`
    );
  }
  if (existsSync(abs)) {
    // demo-data marker scan: the demo/dev seed emails must not exist in a prod DB
    const buf = readFileSync(abs);
    const markers = ["candidate@skillproof.io", "meera@example.com", "devendra.gautam@skillproof.io"];
    const found = markers.filter((m) => buf.includes(Buffer.from(m)));
    if (found.length > 0) {
      problems.push(
        `Database ${abs} contains demo/dev user records (${found.join(", ")}). ` +
          "Production must start from a clean migration (npm run db:init:prod) + npm run db:seed — never from a copied dev database."
      );
    }
  } else {
    warnings.push(`Database ${abs} does not exist yet — it will be created by the clean migration (npm run db:init:prod).`);
  }
}

// 4 ─ demo mode must be off
if (process.env.DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
  problems.push("DEMO_MODE is enabled — demo accounts/autofill must never ship to production.");
}

// 5 ─ cookie security
if (insecureCookie) {
  problems.push("COOKIE_INSECURE=1 would disable Secure cookies — production must serve HTTPS and leave it unset.");
}

// 6 ─ recruiter provisioning
if (!process.env.SKILLPROOF_RECRUITER_PASSWORD?.trim()) {
  problems.push("SKILLPROOF_RECRUITER_PASSWORD is not set — the platform's single recruiter account could not be provisioned.");
}
if (!process.env.SKILLPROOF_RECRUITER_EMAIL?.trim()) {
  warnings.push("SKILLPROOF_RECRUITER_EMAIL unset — falls back to recruiter@skillproof.local.");
}

console.log("SkillProof production preflight");
console.log("==============================");
for (const w of warnings) console.log("WARN:  " + w);
if (problems.length > 0) {
  for (const p of problems) console.error("FAIL:  " + p);
  console.error(`\n${problems.length} blocking issue(s) — fix the environment before launching.`);
  process.exit(1);
}
console.log("OK:     environment is production-safe.");
