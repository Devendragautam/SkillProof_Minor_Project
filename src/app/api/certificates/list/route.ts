import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * GET /api/certificates/list — recruiter-only registry of every issued
 * certificate (newest first). Used by the dashboard "Certificates" tab:
 * the issued list plus everything ready to be issued.
 */
export async function GET() {
  const guard = await requireRecruiter();
  if (!guard.ok) return guard.response;

  const certs = await db.certificate.findMany({
    orderBy: { issuedAt: "desc" },
    select: {
      code: true,
      overallScore: true,
      confidence: true,
      issuedBy: true,
      issuedAt: true,
      assessmentId: true,
      candidate: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    certificates: certs.map((c) => ({
      code: c.code,
      candidateId: c.candidate.id,
      candidateName: c.candidate.name,
      candidateEmail: c.candidate.email,
      assessmentId: c.assessmentId,
      overall: Math.round(c.overallScore),
      confidence: c.confidence,
      issuedBy: c.issuedBy,
      issuedAt: c.issuedAt.toISOString(),
    })),
  });
}
