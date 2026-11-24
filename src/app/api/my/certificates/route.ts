import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/server/auth";
import { buildCertificatePayload } from "@/lib/server/certificates";

export const runtime = "nodejs";

/**
 * GET /api/my/certificates — the signed-in candidate's issued certificates.
 *
 * Certificates attach to Candidate rows (matched by the account email), so a
 * candidate sees every credential a recruiter issued to them across all their
 * verification runs. Recruiters have their own registry (Certificates tab).
 */
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  if (guard.user.role !== "candidate") {
    return NextResponse.json(
      { error: "Candidate access required", code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  try {
    const certs = await db.certificate.findMany({
      where: { candidate: { email: guard.user.email } },
      orderBy: { issuedAt: "desc" },
      include: {
        assessment: { include: { candidate: { select: { name: true, email: true } } } },
      },
    });

    return NextResponse.json({ certificates: certs.map((c) => buildCertificatePayload(c)) });
  } catch (err) {
    console.error("my-certificates error:", err);
    return NextResponse.json({ error: "Failed to load certificates" }, { status: 500 });
  }
}
