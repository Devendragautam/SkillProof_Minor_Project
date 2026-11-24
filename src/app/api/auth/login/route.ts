import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";
import {
  SESSION_COOKIE,
  createSessionToken,
  recruiterAccount,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/server/auth";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { loginSchema } from "@/lib/server/validate";

export const runtime = "nodejs";

/**
 * POST /api/auth/login — verify credentials and set the session cookie.
 *
 * `identifier` accepts either an email address (candidates, recruiter) or the
 * recruiter's registered name — the platform has exactly one provisioned
 * recruiter account, so name-based lookup is unambiguous.
 * Brute-force backstop: attempts are rate-limited per IP before the (CPU
 * costly) scrypt verification runs.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp(req)}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  try {
    await ensureSeed(); // guarantees the provisioned accounts exist
    const raw = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }
    const body = parsed.data;
    const identifier =
      body.identifier?.trim() || body.email?.trim() || ""; // backward compat with older clients
    const password = body.password;
    if (!identifier || !password) {
      return NextResponse.json({ error: "Credentials are required" }, { status: 400 });
    }

    const recruiter = recruiterAccount();

    // 1) direct email match
    let user = await db.user.findUnique({
      where: { email: identifier.toLowerCase() },
    });

    // 2) recruiter name match (case/space-insensitive) — one recruiter, safe lookup
    if (!user && identifier.toLowerCase().replace(/\s+/g, " ") === recruiter.name.toLowerCase()) {
      user = await db.user.findUnique({ where: { email: recruiter.email } });
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      // audit the failure with the attempted identifier — NEVER the password
      audit({
        event: "login.failure",
        outcome: "denied",
        ip: clientIp(req),
        detail: { identifier: identifier.slice(0, 120), knownUser: !!user },
      });
      return NextResponse.json(
        { error: "Incorrect credentials — check your ID and password" },
        { status: 401 }
      );
    }

    audit({
      event: "login.success",
      actor: { id: user.id, email: user.email, role: user.role },
      ip: clientIp(req),
    });
    const res = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("login error:", err);
    return NextResponse.json({ error: "Sign-in failed — try again." }, { status: 500 });
  }
}
