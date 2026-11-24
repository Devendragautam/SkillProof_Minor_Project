/**
 * Zero-config database bootstrap — runs before `next build` and before the
 * production server starts (see package.json "build" / "start" / "start:node").
 *
 * Why: fresh deploy containers (one-click space deploys, Render, any clone)
 * have NO db/ directory (gitignored) and NO .env (gitignored). Without this
 * script the SQLite file either can't be opened or has no tables, the health
 * probe returns 503, and the deployment is marked failed.
 *
 * What it does (all steps idempotent, safe on every boot):
 *   1. Locate the project root (walks up for prisma/schema.prisma).
 *   2. Ensure db/ exists.
 *   3. Resolve DATABASE_URL — env value wins; otherwise an absolute default
 *      (<root>/db/custom.db). A minimal .env.production (committed) is loaded
 *      for keys not already set so demo credentials work on bare deploys.
 *   4. `prisma db push --skip-generate` — creates/repairs the schema WITHOUT
 *      data loss (no --accept-data-loss).
 *   5. Seed if the question bank is empty (prefer bun; fall back to the
 *      prisma seed hook; never fail the deploy over seeding).
 *
 * Exit codes: 0 on success; 1 only if the schema push itself fails (the
 * server would boot into a broken state, so failing loudly is correct).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function findProjectRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** dotenv-lite: load a committed env file WITHOUT overriding real env vars. */
function loadEnvFile(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trim().startsWith("#")) continue;
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    return true;
  } catch {
    return false;
  }
}

function prismaBin(root) {
  const candidates = [
    path.join(root, "node_modules", ".bin", "prisma"),
    path.join(root, "node_modules", "prisma", "build", "index.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, cwd: process.cwd() });
  return !r.error && r.status === 0;
}

const root = findProjectRoot();
const dbDir = path.join(root, "db");

// 1. the db directory MUST exist before SQLite can open/create the file
fs.mkdirSync(dbDir, { recursive: true });

// 2. committed demo defaults (never override operator-provided env vars)
loadEnvFile(path.join(root, ".env.production"));

// 3. resolve the database URL exactly like src/lib/db.ts does at runtime
let dbUrl = (process.env.DATABASE_URL || "").trim();
if (!dbUrl) {
  dbUrl = "file:" + path.join(dbDir, "custom.db");
  console.log(`[bootstrap] DATABASE_URL not set — using ${dbUrl}`);
}
const bare = dbUrl.startsWith("file:") ? dbUrl.slice(5).split("?")[0] : "";
if (bare.startsWith("/")) {
  fs.mkdirSync(path.dirname(bare), { recursive: true });
}

const env = { ...process.env, DATABASE_URL: dbUrl };

// 4. apply the schema (non-destructive — no --accept-data-loss)
const bin = prismaBin(root);
let pushed = false;
if (bin && bin.endsWith(".js")) {
  pushed = run(process.execPath, [bin, "db", "push", "--skip-generate"], env);
} else if (bin) {
  pushed = run(bin, ["db", "push", "--skip-generate"], env);
} else {
  pushed = run("npx", ["--yes", "prisma", "db", "push", "--skip-generate"], env);
}
if (!pushed) {
  console.error("[bootstrap] prisma db push FAILED — the app would boot into a broken state.");
  process.exit(1);
}
console.log("[bootstrap] schema applied.");

// 5. seed only an empty question bank (real seeds are idempotent upserts)
let seeded = false;
try {
  const { PrismaClient } = await import("@prisma/client");
  const probe = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const count = await probe.question.count();
  await probe.$disconnect();
  if (count > 0) {
    console.log(`[bootstrap] question bank present (${count} questions) — seed skipped.`);
    process.exit(0);
  }
} catch (err) {
  console.warn("[bootstrap] could not probe question count:", err?.message || err);
}

const seedScript = path.join(root, "scripts", "seed.ts");
if (fs.existsSync(seedScript)) {
  console.log("[bootstrap] empty question bank — seeding…");
  // prefer bun (runs TypeScript natively); fall back to the prisma seed hook
  const withBun = run("bun", [seedScript], env);
  if (!withBun) {
    const bin2 = prismaBin(root);
    seeded =
      bin2 && bin2.endsWith(".js")
        ? run(process.execPath, [bin2, "db", "seed"], env)
        : run("npx", ["--yes", "prisma", "db", "seed"], env);
  } else {
    seeded = true;
  }
  console.log(seeded ? "[bootstrap] seed complete." : "[bootstrap] seed FAILED (non-fatal) — run `bun run db:seed` manually.");
} else {
  console.warn("[bootstrap] scripts/seed.ts not found — seed skipped.");
}
process.exit(0);
