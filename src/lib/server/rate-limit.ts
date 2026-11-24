/**
 * Minimal in-memory fixed-window rate limiter (per-instance).
 *
 * Used on expensive or abusable endpoints (code execution, AI generation) so
 * an authenticated user cannot burn host CPU or third-party AI quota in a
 * tight loop. This is an abuse-mitigation backstop on top of the real
 * authorization checks — not a security boundary by itself.
 */

import { audit } from "@/lib/server/audit";

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(windowMs: number): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}

/**
 * Allow one hit for `key` if fewer than `max` hits happened in `windowMs`.
 * Returns true when allowed (and records the hit), false when over budget.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    // suspicious-activity signal: a caller is hammering an expensive endpoint
    audit({ event: "rate_limit.hit", outcome: "denied", detail: { bucket: key, max, windowMs } });
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function rateLimitResponse(): Response {
  return Response.json(
    { error: "Too many requests — slow down and try again shortly", code: "RATE_LIMITED" },
    { status: 429 }
  );
}

/**
 * Best-effort client IP for per-IP rate limits. Behind the sandbox gateway the
 * real address arrives in x-forwarded-for; direct connections fall back to a
 * shared "local" bucket (per-instance limiting is the documented deployment
 * story anyway — production front-ends supply the proxy header).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}
