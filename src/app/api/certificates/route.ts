import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter, requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { issueCertificateSchema, parseJson } from "@/lib/server/validate";
import {
  buildCertificatePayload,
  computeCohortStanding,
  findCertificateByCode,
  generateCertificateCode,
  snapshotSkills,
} from "@/lib/server/certificates";

export const runtime = "nodejs";

/**
 * POST /api/certificates — recruiter issues a skill certificate for a completed
 * assessment (idempotent: one certificate per assessment — re-calling returns
 * the existing certificate).
 */
export async function POST(req: NextRequest) {
  const guard = await requireRecruiter();
  if (!guard.ok) return guard.response;

  if (!rateLimit(`cert-issue:${guard.user.id}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  const parsed = await parseJson(req, issueCertificateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const assessmentId = parsed.data.assessmentId;

    const assessment = await db.assessment.findUnique({
      where: { id: assessmentId },
      include: { report: true, candidate: { select: { name: true, email: true } }, certificate: true },
    });
    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }
    if (!assessment.report) {
      return NextResponse.json(
        { error: "This assessment has no verified report yet — certificates can only be issued for completed assessments." },
        { status: 409 }
      );
    }

    // idempotent — return the existing certificate
    if (assessment.certificate) {
      const existing = await findCertificateByCode(assessment.certificate.code);
      if (existing) {
        audit({
          event: "certificate.issue",
          actor: { id: guard.user.id, email: guard.user.email, role: guard.user.role },
          detail: { certificateId: existing.id, assessmentId, reused: true },
        });
        return NextResponse.json({ certificate: buildCertificatePayload(existing), created: false });
      }
    }

    const scores = snapshotSkills(assessment.report.skillScoresJson);
    // Freeze the cohort standing at issue time — the live standing moves as
    // the cohort grows, this snapshot becomes permanent point-in-time evidence
    // printed on the PDF ("cohort at issue") while the web view stays live.
    const standing = await computeCohortStanding(assessment.report.overallScore);
    const cert = await db.certificate.create({
      data: {
        code: generateCertificateCode(),
        candidateId: assessment.candidateId,
        assessmentId: assessment.id,
        scoresJson: JSON.stringify(scores),
        overallScore: assessment.report.overallScore,
        confidence: assessment.report.confidence,
        cohortStandingJson: standing
          ? JSON.stringify({ ...standing, recordedAt: new Date().toISOString() })
          : null,
        issuedBy: guard.user.name,
      },
    });

    audit({
      event: "certificate.issue",
      actor: { id: guard.user.id, email: guard.user.email, role: guard.user.role },
      detail: {
        certificateId: cert.id,
        assessmentId,
        candidateId: assessment.candidateId,
        overall: assessment.report.overallScore,
      },
    });

    const full = await findCertificateByCode(cert.code);
    return NextResponse.json(
      { certificate: full ? buildCertificatePayload(full) : null, created: true },
      { status: 201 }
    );
  } catch (err) {
    console.error("certificate issue error:", err);
    return NextResponse.json({ error: "Failed to issue certificate — try again." }, { status: 500 });
  }
}

/**
 * GET /api/certificates?assessmentId=<id> — check whether an assessment already
 * has a certificate. AUTHENTICATED + ownership-scoped: recruiters may look up
 * any run; candidates only their own. Anonymous callers are rejected —
 * knowing an internal assessment id must never reveal certificate metadata.
 */
export async function GET(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  if (!rateLimit(`cert-lookup:${guard.user.id}`, 30, 60_000)) {
    return rateLimitResponse();
  }

  const assessmentId = req.nextUrl.searchParams.get("assessmentId")?.trim();
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId is required" }, { status: 400 });
  }

  const assessment = await db.assessment.findUnique({
    where: { id: assessmentId },
    select: { candidate: { select: { email: true } }, certificate: { select: { code: true, issuedBy: true, issuedAt: true } } },
  });
  if (!assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }
  if (guard.user.role !== "recruiter" && assessment.candidate.email !== guard.user.email) {
    return NextResponse.json({ error: "Not your assessment" }, { status: 403 });
  }

  const cert = assessment.certificate;
  return NextResponse.json({
    certificate: cert
      ? { code: cert.code, issuedBy: cert.issuedBy, issuedAt: cert.issuedAt.toISOString() }
      : null,
  });
}
