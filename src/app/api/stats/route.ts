import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Public landing figures — live counts straight from the question bank.
 *
 * The marketing page must never drift from the product: rather than
 * hard-coding "90 questions" (which silently went stale the week custom
 * questions landed), the landing reads these numbers from the same tables
 * the assessment engine deals from. No auth — these are public figures.
 */
export async function GET() {
  try {
    const [questions, skills] = await Promise.all([
      db.question.count(),
      db.question.findMany({ select: { skill: true }, distinct: ["skill"] }),
    ]);
    return NextResponse.json({ questions, skills: skills.length });
  } catch {
    // never break the landing over a stats read — fall back to copy defaults
    return NextResponse.json({ questions: null, skills: null }, { status: 200 });
  }
}
