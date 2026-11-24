import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma logging policy (Phase-3 hardening):
 *   - production: warn + error only — query logging is a performance leak and
 *     can expose data shapes in shared log infrastructure.
 *   - development: verbose (query) logging preserved for local debugging;
 *     opt out with PRISMA_LOG_QUERIES=0.
 */
function prismaLog(): Array<"query" | "warn" | "error"> {
  if (process.env.NODE_ENV === "production") return ["warn", "error"];
  return process.env.PRISMA_LOG_QUERIES === "0" ? ["warn", "error"] : ["query", "warn", "error"];
}

/**
 * SQLite connection tuning is enforced HERE (not only via DATABASE_URL):
 * process-level env vars legitimately override .env files, so a shell-provided
 * DATABASE_URL could otherwise arrive without the tuning the single-writer
 * database needs:
 *   - connection_limit=1 → serialize access through one pooled connection
 *     (SQLite has exactly one writer; pooling connections only produces
 *     write-lock contention, timeouts and 5xx under concurrent traffic)
 *   - socket_timeout=25  → long interactive transactions (report aggregation
 *     inside its write transaction) must not trip the default 5s cap
 * Non-SQLite URLs are passed through untouched.
 */
/**
 * Zero-config fallback: when DATABASE_URL is unset (fresh clone, one-click
 * deploy containers where .env is absent because it is gitignored), derive an
 * absolute SQLite URL from the project root instead of letting Prisma fail
 * with "Environment variable not found: DATABASE_URL".
 *
 * The project root is located by walking up from cwd looking for
 * prisma/schema.prisma — this also works when the production server runs from
 * .next/standalone via a wrapper that sets cwd to the repo root (see
 * scripts/start-server.mjs).
 */
function defaultDatabaseUrl(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) {
      return "file:" + path.join(dir, "db", "custom.db");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "file:" + path.join(process.cwd(), "db", "custom.db");
}

function resolveDatabaseUrl(): string | undefined {
  const fromEnv = process.env.DATABASE_URL?.trim();
  const url = fromEnv || defaultDatabaseUrl();
  if (!fromEnv) {
    console.warn(
      `[db] DATABASE_URL is not set — falling back to ${url}. ` +
        "Set DATABASE_URL explicitly for non-default deployments."
    );
  }
  if (!url || !url.startsWith("file:")) return url;
  const [pathPart, queryPart = ""] = url.split("?");
  // Absolute file paths whose parent directory does not exist are the #1
  // cause of "unable to open database file" on fresh deploys (db/ is
  // gitignored). Creating it is always safe; SQLite creates the file itself.
  const barePath = pathPart.slice("file:".length);
  if (barePath.startsWith("/")) {
    try {
      fs.mkdirSync(path.dirname(barePath), { recursive: true });
    } catch {
      // non-fatal: Prisma will surface a clearer error if the dir can't be made
    }
  }
  const params = new URLSearchParams(queryPart);
  if (!params.has("connection_limit")) params.set("connection_limit", "1");
  if (!params.has("socket_timeout")) params.set("socket_timeout", "25");
  return `${pathPart}?${params.toString()}`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: prismaLog(),
    ...(resolveDatabaseUrl() ? { datasources: { db: { url: resolveDatabaseUrl()! } } } : {}),
  })

// WAL journal mode (persisted at the database-file level, idempotent): readers
// no longer block writers and vice versa — concurrent assessment traffic and
// report aggregation stop fighting over the single write lock.
void db
  .$queryRawUnsafe('PRAGMA journal_mode=WAL;')
  .catch(() => {
    // non-fatal: the DB falls back to the default journal mode
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
