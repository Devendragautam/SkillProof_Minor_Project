import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/** POST /api/auth/logout — clear the session cookie. */
export async function POST() {
  const user = await getSessionUser();
  if (user) {
    audit({ event: "logout", actor: actorOf(user) });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
