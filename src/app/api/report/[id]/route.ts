import { NextRequest, NextResponse } from "next/server";
import { requireReportAccess } from "@/lib/server/guards";

export const runtime = "nodejs";

/**
 * GET /api/report/[id] — fetch a stored assessment report (id = assessmentId).
 *
 * Access rules:
 *  - authenticated owner candidate or recruiter → full payload + shareToken
 *    (tokens are backfilled for legacy reports)
 *  - anonymous with a VALID ?t=<shareToken> → the shared payload (no token
 *    disclosed). The share token is a 192-bit random secret — the assessment
 *    id alone never grants access.
 *  - otherwise → 401/403/404 per guards.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t");

  const access = await requireReportAccess(id, token);
  if (!access.ok) return access.response;
  const assessment = access.assessment;
  const r = assessment.report!;
  // Normalize legacy report JSON (older reports may predate per-skill
  // evidence/improvements arrays or carry non-array fields) so every client
  // consumer can rely on the shape.
  const rawSkills = JSON.parse(r.skillScoresJson) as Array<Record<string, unknown>>;
  const skills = (Array.isArray(rawSkills) ? rawSkills : []).map((s) => ({
    ...s,
    evidence: Array.isArray(s.evidence) ? s.evidence : [],
    improvements: Array.isArray(s.improvements) ? s.improvements : [],
  }));
  const rawSignals = JSON.parse(r.aiRiskSignalsJson);
  const rawBreakdown = JSON.parse(r.breakdownJson);
  return NextResponse.json({
    reportId: r.id,
    assessmentId: assessment.id,
    candidateName: assessment.candidate.name,
    createdAt: r.createdAt,
    overall: r.overallScore,
    confidence: r.confidence,
    aiRisk: r.aiRiskScore,
    aiRiskConfidence: r.aiRiskConfidence,
    aiSignals: Array.isArray(rawSignals) ? rawSignals : [],
    skills,
    categories: JSON.parse(r.categoryScoresJson),
    breakdown: Array.isArray(rawBreakdown) ? rawBreakdown : [],
    // the token is disclosed ONLY to the owner/recruiter (share-mode viewers
    // already hold it; they must never be able to mint new links)
    shareToken: access.mode === "owner" ? r.shareToken : undefined,
  });
}
