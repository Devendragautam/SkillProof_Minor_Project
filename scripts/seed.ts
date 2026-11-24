/**
 * Clean seed — SAFE for every environment.
 *
 * Populates ONLY:
 *   1. the curated question bank (platform content, idempotent upserts)
 *   2. the provisioned recruiter account (env-driven, see .env.example)
 *   3. the demo candidate account — ONLY when DEMO_MODE=1
 *
 * Run explicitly:  npm run db:seed
 * This is also wired as the `prisma` seed hook (package.json > prisma.seed).
 *
 * Demo DATA (candidates, assessments, reports, certificates) is NOT created
 * here — use `npm run db:seed:demo` for the optional, clearly-separated demo
 * dataset. A production database should only ever receive THIS seed.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureSeed } from "../src/lib/seed";

/**
 * Load .env into process.env for keys that are not already set.
 *
 * Bun/Next auto-load .env for their own entrypoints, but a bare
 * `bun scripts/seed.ts` (the db:seed hook) does NOT populate process.env —
 * which silently stripped the provisioned-account vars and, via the
 * one-recruiter stray cleanup, could DELETE the real recruiter account.
 * Self-loading here makes the seed safe from any invocation.
 */
function loadDotEnvForSeed(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    let v = m[2];
    // strip surrounding quotes (single or double) and trailing inline comments
    // only outside quotes; "a#b" must stay a#b (DEPLOY.md: quote values with #)
    const q = v[0];
    if ((q === '"' || q === "'") && v.endsWith(q)) {
      v = v.slice(1, -1);
    } else {
      const hash = v.indexOf(" #");
      if (hash !== -1) v = v.slice(0, hash);
      v = v.trim();
    }
    process.env[m[1]] = v;
  }
}

async function main() {
  loadDotEnvForSeed();
  console.log("[seed] ensuring curated question bank + provisioned accounts…");
  await ensureSeed();
  console.log("[seed] done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
