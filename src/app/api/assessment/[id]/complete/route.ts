import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAssessmentAccess, ensureShareToken } from "@/lib/server/guards";
import { actorOf, audit } from "@/lib/server/audit";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import {
  buildSkillReports,
  buildCategoryScores,
  buildBreakdown,
  computeOverall,
  computeAssessmentAiRisk,
  loadSubmissions,
} from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/assessment/[id]/complete — aggregate evidence & generate the
 * verified report. Owner candidate or recruiter only. A fresh report gets a
 * cryptographically random share token (public sharing NEVER rides the
 * assessment id).
 *
 * Integrity rules:
 *  - IDENTITY: resolved through requireAssessmentAccess — knowing the id is
 *    never enough;
 *  - IDEMPOTENT: completing an already-completed assessment replays the STORED
 *    report (no re-aggregation, no state churn) — calling completion twice can
 *    never corrupt the report or double-issue a share token;
 *  - ATOMIC: the state flip (in_progress → completed), the final resolution of
 *    lingering "current" questions and the aggregation run inside one
 *    transaction, so a concurrent submit cannot slip a submission in after the
 *    scores were computed;
 *  - STATE: completed is terminal — invalid transitions are 409.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (!access.ok) return access.response;

  if (!rateLimit(`complete:${access.user.id}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const assessment = access.assessment;

    // ── idempotent replay: already completed → return the stored report ────
    if (assessment.status === "completed") {
      const stored = await loadStored(id);
      if (stored?.report) {
        if (!stored.report.shareToken) {
          stored.report.shareToken = await ensureShareToken(stored.report.id);
        }
        audit({
          event: "assessment.complete",
          actor: actorOf(access.user),
          detail: { assessmentId: id, reportId: stored.report.id, replay: true },
        });
        return NextResponse.json(replayReportResponse(stored));
      }
      // completed without a report (operator tampering / partial failure):
      // fall through and repair by re-running the aggregation below
    }

    // ── first completion: atomic flip + resolve + aggregate ────────────────
    let completion;
    try {
      completion = await db.$transaction(async (tx) => {
      // re-read inside the transaction — the status check and the write must
      // share one snapshot (SQLite serializes writers)
      const current = await tx.assessment.findUnique({ where: { id } });
      if (!current) return { error: "Assessment not found" as const, status: 404 };

      const alreadyCompleted = current.status === "completed";
      if (!alreadyCompleted) {
        // resolve lingering "current" questions as skipped (score 0) and clear
        // the single-active flag — inside the same transaction as the flip
        await tx.assessmentQuestion.updateMany({
          where: { assessmentId: id, status: "current" },
          data: { status: "skipped", score: 0, activeFlag: null },
        });
      }

      // aggregate from the transaction snapshot: any concurrent submission
      // either fully committed before this read or is rejected afterwards
      const { subs, claimedLevels } = await loadSubmissions(id, tx);
      const skills = buildSkillReports(subs, claimedLevels);
      const categories = buildCategoryScores(subs);
      const overall = computeOverall(categories);
      const breakdown = buildBreakdown(subs);
      const aiRisk = computeAssessmentAiRisk(subs);

      const weakest = [...skills].filter((s) => s.assessed).sort((a, b) => a.score - b.score)[0];
      const overallConfidence =
        skills.filter((s) => s.confidence === "HIGH").length >= Math.ceil(skills.filter((s) => s.assessed).length / 2)
          ? "HIGH"
          : "MEDIUM";

      const report = await tx.report.upsert({
        where: { assessmentId: id },
        update: {
          overallScore: alreadyCompleted ? undefined : overall,
          confidence: alreadyCompleted ? undefined : overallConfidence,
          aiRiskScore: alreadyCompleted ? undefined : aiRisk.score,
          aiRiskConfidence: alreadyCompleted ? undefined : aiRisk.confidence,
          aiRiskSignalsJson: alreadyCompleted ? undefined : JSON.stringify(aiRisk.signals),
          skillScoresJson: alreadyCompleted ? undefined : JSON.stringify(skills),
          categoryScoresJson: alreadyCompleted ? undefined : JSON.stringify(categories),
          breakdownJson: alreadyCompleted ? undefined : JSON.stringify(breakdown),
        },
        create: {
          assessmentId: id,
          overallScore: overall,
          confidence: overallConfidence,
          aiRiskScore: aiRisk.score,
          aiRiskConfidence: aiRisk.confidence,
          aiRiskSignalsJson: JSON.stringify(aiRisk.signals),
          skillScoresJson: JSON.stringify(skills),
          categoryScoresJson: JSON.stringify(categories),
          breakdownJson: JSON.stringify(breakdown),
        },
      });

      if (!alreadyCompleted) {
        await tx.assessment.update({
          where: { id },
          data: { status: "completed", completedAt: new Date() },
        });
      }

      return { report, skills, categories, breakdown, overall, overallConfidence, aiRisk, weakest, candidateName: assessment.candidate.name };
      // generous budget: the transaction holds the SQLite write lock while
      // aggregating, so concurrent completions WAIT (Prisma defaults to 5s,
      // which a waiting loser can exceed under load → P2028)
      }, { timeout: 20_000, maxWait: 10_000 });
    } catch (err) {
      // Race losers must never surface 5xx: whichever completion wrote the
      // report first is authoritative (P2002 unique-race, P2028/P2024/P1008
      // lock or timeout while a loser waited on the SQLite write lock — any
      // of them is resolved by replaying the stored report when it exists).
      const stored = await db.assessment.findUnique({ where: { id }, include: { report: true, candidate: true } });
      if (stored?.report) return NextResponse.json(replayReportResponse(stored));
      throw err;
    }

    if ("error" in completion) {
      return NextResponse.json({ error: completion.error }, { status: completion.status });
    }

    // guarantee a share token on every freshly written report
    let shareToken = completion.report.shareToken;
    if (!shareToken) {
      shareToken = await ensureShareToken(completion.report.id);
    }

    audit({
      event: "assessment.complete",
      actor: actorOf(access.user),
      detail: {
        assessmentId: id,
        reportId: completion.report.id,
        overall: Math.round(completion.overall),
        replay: false,
      },
    });

    return NextResponse.json({
      reportId: completion.report.id,
      assessmentId: id,
      candidateName: completion.candidateName,
      createdAt: completion.report.createdAt,
      overall: completion.overall,
      confidence: completion.overallConfidence,
      aiRisk: completion.aiRisk.score,
      aiRiskConfidence: completion.aiRisk.confidence,
      aiSignals: completion.aiRisk.signals,
      skills: completion.skills,
      categories: completion.categories,
      breakdown: completion.breakdown,
      // owner/recruiter only — used to build intentional share links
      shareToken,
      note: completion.weakest ? `Weakest area: ${completion.weakest.skill} (${completion.weakest.score}/100)` : null,
    });
  } catch (err) {
    console.error("complete error:", err);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

/**
 * Rebuild the exact completion response shape from a STORED report — the
 * idempotent second call must look identical to the client without touching
 * any aggregates.
 */
function replayReportResponse(stored: NonNullable<Awaited<ReturnType<typeof loadStored>>>) {
  const r = stored.report!;
  const rawSkills = safeParseArray(r.skillScoresJson) as Array<Record<string, unknown>>;
  const skills = rawSkills.map((s) => ({
    ...s,
    evidence: Array.isArray(s.evidence) ? s.evidence : [],
    improvements: Array.isArray(s.improvements) ? s.improvements : [],
  }));
  const assessed = rawSkills.filter(
    (s): s is { skill: string; score: number } =>
      typeof s.skill === "string" && typeof s.score === "number" && s.assessed !== false
  );
  const weakest = [...assessed].sort((a, b) => a.score - b.score)[0];
  return {
    reportId: r.id,
    assessmentId: stored.id,
    candidateName: stored.candidate.name,
    createdAt: r.createdAt,
    overall: r.overallScore,
    confidence: r.confidence,
    aiRisk: r.aiRiskScore,
    aiRiskConfidence: r.aiRiskConfidence,
    aiSignals: safeParseArray(r.aiRiskSignalsJson),
    skills,
    categories: safeParse(r.categoryScoresJson),
    breakdown: safeParseArray(r.breakdownJson),
    shareToken: r.shareToken ?? undefined,
    note: weakest ? `Weakest area: ${weakest.skill} (${Math.round(weakest.score)}/100)` : null,
  };
}

async function loadStored(id: string) {
  return db.assessment.findUnique({ where: { id }, include: { report: true, candidate: true } });
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function safeParseArray(json: string): unknown[] {
  const v = safeParse(json);
  return Array.isArray(v) ? v : [];
}
