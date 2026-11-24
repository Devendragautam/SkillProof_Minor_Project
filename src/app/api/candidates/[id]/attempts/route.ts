import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * GET /api/candidates/[id]/attempts — all assessments for a candidate with
 * their report summary (the dashboard table only surfaces the latest one).
 * Access: recruiters (any profile) or the signed-in candidate who owns the
 * profile (matched by account email) — the results view reads its own run
 * history through this endpoint.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: "Sign in required", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const candidate = await db.candidate.findUnique({ where: { id } });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (user.role !== "recruiter" && user.email !== candidate.email) {
      return NextResponse.json(
        { error: "Not your profile", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    const assessments = await db.assessment.findMany({
      where: { candidateId: id },
      orderBy: { createdAt: "desc" },
      include: { report: { select: { overallScore: true, confidence: true } } },
    });
    return NextResponse.json({
      attempts: assessments.map((a) => ({
        assessmentId: a.id,
        status: a.status,
        createdAt: a.createdAt,
        completedAt: a.completedAt,
        overall: a.report?.overallScore ?? null,
        confidence: a.report?.confidence ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load attempts" }, { status: 500 });
  }
}
