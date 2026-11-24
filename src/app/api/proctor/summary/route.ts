import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * GET /api/proctor/summary?assessmentId=<id>
 * Aggregate-only proctoring tally for ONE assessment: event counts by
 * severity and the session time span. No event details, no types, no
 * free-text — candidates may read their own summary line on the results
 * view (disclosure), while full transcripts stay recruiter-only.
 *
 * Access: recruiters (any run) or the signed-in candidate who owns the
 * assessment's profile (matched by account email). Anonymous → 401.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required", code: "AUTH_REQUIRED" }, { status: 401 });
    }

    const assessmentId = req.nextUrl.searchParams.get("assessmentId")?.trim() ?? "";
    if (!assessmentId) {
      return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
    }

    if (user.role !== "recruiter") {
      const assessment = await db.assessment.findUnique({
        where: { id: assessmentId },
        select: { candidate: { select: { email: true } } },
      });
      if (!assessment) {
        return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
      }
      if (user.email !== assessment.candidate.email) {
        return NextResponse.json({ error: "Not your assessment", code: "FORBIDDEN" }, { status: 403 });
      }
    }

    const rows = await db.proctorEventRecord.findMany({
      where: { assessmentId },
      select: { severity: true, ts: true },
      orderBy: { ts: "asc" },
    });

    const summarize = (sev: string) => rows.filter((r) => r.severity === sev).length;
    const positive = summarize("info");
    const warn = summarize("warn");
    const risk = summarize("risk");

    return NextResponse.json({
      assessmentId,
      total: rows.length,
      positive,
      warn,
      risk,
      firstTs: rows.length > 0 ? rows[0].ts : null,
      lastTs: rows.length > 0 ? rows[rows.length - 1].ts : null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
