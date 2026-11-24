import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";

export const runtime = "nodejs";

/** GET /api/auth/me — current session user (or null). */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
