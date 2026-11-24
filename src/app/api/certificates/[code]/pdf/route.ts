import { NextRequest, NextResponse } from "next/server";
import { findCertificateByCode, buildCertificatePayload } from "@/lib/server/certificates";
import { renderCertificatePdf } from "@/lib/server/certificate-pdf";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/**
 * GET /api/certificates/[code]/pdf — downloadable A4 landscape certificate PDF.
 * Certificates are publicly verifiable by code, so the PDF render is public too
 * (consistent with GET /api/certificates/[code]). PDF rendering is CPU-heavy —
 * rate-limited per IP, and the payload is the public (stripped) variant.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (!rateLimit(`cert-pdf:${clientIp(req)}`, 15, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const cert = await findCertificateByCode(code);
    if (!cert) {
      return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    }
    const payload = buildCertificatePayload(cert, "public");
    // The QR on the sheet must point at the host the downloader is actually
    // using (sandbox gateway, localhost, or the production domain).
    const { bytes, filename } = await renderCertificatePdf(payload, { verifyOrigin: req.nextUrl.origin });
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("certificate pdf error:", err);
    return NextResponse.json({ error: "PDF render failed" }, { status: 500 });
  }
}
