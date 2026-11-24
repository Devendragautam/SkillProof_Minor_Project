import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
} from "@/lib/server/auth";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8).max(72),
  // recruiters cannot self-register — the single recruiter account is provisioned
  role: z.enum(["candidate"]),
});

/** POST /api/auth/register — create an account and start a session. */
export async function POST(req: NextRequest) {
  // account-creation spam backstop (per IP)
  if (!rateLimit(`register:${clientIp(req)}`, 5, 60_000)) {
    return rateLimitResponse();
  }
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path?.[0];
      if (field === "role") {
        return NextResponse.json(
          { error: "Recruiter accounts are provisioned by SkillProof — sign in with your recruiter ID instead." },
          { status: 403 }
        );
      }
      const msg =
        field === "password" ? "Password must be at least 8 characters"
        : field === "email" ? "Enter a valid email address"
        : field === "name" ? "Enter your full name"
        : first?.message ?? "Invalid registration details";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const { name, email, password, role } = parsed.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists — sign in instead." },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: { name, email, passwordHash: hashPassword(password), role },
    });

    const res = NextResponse.json(
      { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 201 }
    );
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
    return res;
  } catch (err) {
    console.error("register error:", err);
    return NextResponse.json({ error: "Registration failed — try again." }, { status: 500 });
  }
}
