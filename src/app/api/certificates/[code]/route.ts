import { NextRequest, NextResponse } from "next/server";
import { buildCertificatePayload, findCertificateByCode } from "@/lib/server/certificates";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/certificates/[code] — public certificate verification.
 * Anyone with the code (printed on the certificate) can verify authenticity.
 *
 * The lookup is rate-limited per IP (the code is the capability — but a
 * request loop must not be able to grind through the code space), and the
 * public payload strips internal data (assessment id, candidate email).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (!rateLimit(`cert-verify:${clientIp(_req)}`, 30, 60_000)) {
    return rateLimitResponse();
  }

  const cert = await findCertificateByCode(code);
  if (!cert) {
    return NextResponse.json(
      { error: "No certificate found for this code — check the code and try again." },
      { status: 404 }
    );
  }
  return NextResponse.json({ certificate: buildCertificatePayload(cert, "public") });
}
