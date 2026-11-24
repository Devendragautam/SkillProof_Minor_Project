import { NextRequest, NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/server/guards";
import { getSessionUser } from "@/lib/server/auth";
import { db } from "@/lib/db";
import { renderReportPdf } from "@/lib/server/report-pdf";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/report/[id]/pdf — server-rendered, branded PDF of a verified report.
 * Owner candidate or recruiter (session), or a valid ?t=<shareToken> for
 * intentionally shared links — the assessment id alone never grants access.
 * PDF rendering is CPU-heavy: rate-limited per identity (session user or IP).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t");

  const access = await requireReportAccess(id, token);
  if (!access.ok) return access.response;

  // PDF rendering is CPU-heavy — bound it per identity (session user when
  // authenticated, client IP for shared-token viewers)
  const sessionUser = await getSessionUser();
  const limitKey = sessionUser
    ? `report-pdf:user:${sessionUser.id}`
    : `report-pdf:ip:${clientIp(req)}`;
  if (!rateLimit(limitKey, 20, 60_000)) {
    return rateLimitResponse();
  }

  const assessment = await db.assessment.findUnique({
    where: { id },
    include: { report: true, candidate: true },
  });
  if (!assessment || !assessment.report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  try {
    const { bytes, filename } = await renderReportPdf(assessment);
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF render failed" }, { status: 500 });
  }
}
