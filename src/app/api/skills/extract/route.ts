import { NextRequest, NextResponse } from "next/server";
import { extractSkillsFromResume } from "@/lib/ai";
import { requireUser } from "@/lib/server/auth";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/skills/extract — {text} → ExtractedProfile
 * Signed-in users only; AI quota is rate-limited per user.
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (!rateLimit(`skills:${guard.user.id}`, 15, 60_000)) {
    return rateLimitResponse();
  }
  try {
    const body = (await req.json()) as { text?: string };
    if (!body.text || body.text.trim().length < 40) {
      return NextResponse.json({ error: "Resume text is too short" }, { status: 400 });
    }
    const profile = await extractSkillsFromResume(body.text);
    return NextResponse.json(profile);
  } catch (err) {
    console.error("skill extraction error:", err);
    return NextResponse.json({ error: "Skill extraction failed" }, { status: 500 });
  }
}
