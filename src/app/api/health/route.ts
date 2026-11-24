import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiProviderInfo } from "@/lib/ai";

/**
 * Deployment health probe (Render healthCheckPath and similar).
 *
 * Deliberately unauthenticated and disclosure-safe: it reports service
 * liveness, database reachability, and WHICH AI provider is configured
 * (model + endpoint only — never key material). Returns 503 when the
 * database is unreachable so orchestrators can act on real failures.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    service: "skillproof",
    time: new Date().toISOString(),
    db: dbOk ? "ok" : "error",
    ai: aiProviderInfo(),
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
