import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { extractRoleRequirements, type RoleRequirement } from "@/lib/ai";
import { canonicalizeSkill } from "@/lib/skills";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const JD_MIN = 30;
const JD_MAX = 8000;

interface VerifiedSkill {
  skill: string;
  score: number;
  confidence: string;
  assessed: boolean;
  evidence: string[];
}

interface RequirementRow extends RoleRequirement {
  /** Verified score for this skill, null when the candidate has no evidence for it. */
  score: number | null;
  confidence: string | null;
  evidence: string[];
}

interface CandidateFit {
  candidateId: string;
  name: string;
  /** Overall score of the candidate's best verified run. */
  overall: number | null;
  /** Importance-weighted match 0-100 — unverified requirements count as 0. */
  matchPct: number;
  /** Share of the required-skill weight the candidate actually has evidence for. */
  coveragePct: number;
  /** Mean verified score across verified requirements only; null when none. */
  strengthPct: number | null;
  rows: RequirementRow[];
}

/**
 * POST /api/recruiter/role-fit
 * Recruiter pastes a job description; AI extracts the skill requirements,
 * then every verified candidate is ranked against them using the FROZEN
 * verified skill scores in Report.skillScoresJson — evidence-based fit, not
 * resume adjectives. Category weights / presets (the other fit model) stay
 * untouched; this answers "did they verify the skills this role needs".
 */
export async function POST(req: NextRequest) {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  // AI extraction — per-recruiter quota
  if (!rateLimit(`role-fit:${auth.user.id}`, 15, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const body = (await req.json().catch(() => null)) as { jd?: unknown } | null;
    const jd = typeof body?.jd === "string" ? body.jd.trim().slice(0, JD_MAX + 1) : "";
    if (jd.length < JD_MIN) {
      return NextResponse.json(
        { error: `Job description is too short — paste at least ${JD_MIN} characters.` },
        { status: 400 }
      );
    }
    if (jd.length > JD_MAX) {
      return NextResponse.json(
        { error: `Job description is too long (${jd.length} chars) — trim it to ${JD_MAX}.` },
        { status: 400 }
      );
    }

    const requirements = await extractRoleRequirements(jd);
    if (requirements.skills.length === 0) {
      return NextResponse.json(
        { error: "No technical skill requirements could be recognized in this text — paste a job description with concrete skills." },
        { status: 422 }
      );
    }

    // Canonicalize requirements once so they match against report skills.
    const reqCanonical = requirements.skills.map((r) => ({
      ...r,
      canonical: canonicalizeSkill(r.skill)?.name ?? r.skill,
    }));

    // Best verified run per candidate (highest overall among completed+reported).
    const candidates = await db.candidate.findMany({
      where: { archived: false },
      select: {
        id: true,
        name: true,
        assessments: {
          where: { status: "completed", report: { isNot: null } },
          select: { report: { select: { overallScore: true, skillScoresJson: true } } },
        },
      },
    });

    const fits: CandidateFit[] = [];
    for (const c of candidates) {
      const reports = c.assessments.map((a) => a.report).filter((r): r is NonNullable<typeof r> => r !== null);
      if (reports.length === 0) continue; // unverified profiles have no evidence to rank
      const best = reports.reduce((a, b) => (b.overallScore > a.overallScore ? b : a));

      let verified: VerifiedSkill[] = [];
      try {
        const parsed = JSON.parse(best.skillScoresJson) as unknown;
        if (Array.isArray(parsed)) {
          verified = parsed
            .filter((s): s is VerifiedSkill => {
              if (!s || typeof s !== "object") return false;
              const v = s as Record<string, unknown>;
              return typeof v.skill === "string" && typeof v.score === "number";
            })
            .map((s) => ({
              skill: s.skill,
              score: s.score,
              confidence: typeof s.confidence === "string" ? s.confidence : "—",
              assessed: s.assessed !== false,
              evidence: Array.isArray(s.evidence) ? s.evidence.map(String).slice(0, 4) : [],
            }));
        }
      } catch {
        // unparseable snapshot → candidate ranks with no evidence
      }

      // Canonical-name map; strongest score wins when a skill was verified twice.
      const byCanonical = new Map<string, VerifiedSkill>();
      for (const v of verified) {
        const key = canonicalizeSkill(v.skill)?.name ?? v.skill;
        const prev = byCanonical.get(key);
        if (!prev || v.score > prev.score) byCanonical.set(key, v);
      }

      const rows: RequirementRow[] = reqCanonical.map((r) => {
        const hit = byCanonical.get(r.canonical);
        return {
          skill: r.skill,
          importance: r.importance,
          minScore: r.minScore,
          score: hit ? Math.round(hit.score) : null,
          confidence: hit ? hit.confidence : null,
          evidence: hit ? hit.evidence : [],
        };
      });

      const totalW = rows.reduce((a, r) => a + r.importance, 0);
      const verifiedW = rows.reduce((a, r) => a + (r.score !== null ? r.importance : 0), 0);
      const matchPct = totalW > 0 ? Math.round(rows.reduce((a, r) => a + r.importance * (r.score ?? 0), 0) / totalW) : 0;
      const coveragePct = totalW > 0 ? Math.round((verifiedW / totalW) * 100) : 0;
      const strengthPct =
        verifiedW > 0
          ? Math.round(rows.reduce((a, r) => a + (r.score !== null ? r.importance * r.score : 0), 0) / verifiedW)
          : null;

      fits.push({
        candidateId: c.id,
        name: c.name,
        overall: Math.round(best.overallScore),
        matchPct,
        coveragePct,
        strengthPct,
        rows,
      });
    }

    fits.sort(
      (a, b) =>
        b.matchPct - a.matchPct ||
        b.coveragePct - a.coveragePct ||
        (b.overall ?? 0) - (a.overall ?? 0)
    );

    return NextResponse.json({
      role: requirements.role,
      source: requirements.source,
      requirements: requirements.skills,
      fits,
      candidateCount: fits.length,
    });
  } catch (err) {
    console.error("role-fit error:", err);
    return NextResponse.json(
      { error: "Could not analyze the job description — try again." },
      { status: 500 }
    );
  }
}
