import { NextRequest, NextResponse } from "next/server";
import { computeCohortStanding } from "@/lib/server/certificates";

export const runtime = "nodejs";

/**
 * GET /api/cohort?score=NN — aggregate cohort standing for a score.
 *
 * Aggregate-only (no PII): counts how completed, reported runs compare to the
 * given score so candidate-facing views can show an honest percentile —
 * "top 12% of a 12-run cohort". Zero-trust friendly: no candidate/assessment
 * identifiers are returned, only distribution aggregates.
 * (The same computation is frozen onto certificates at issue time —
 * see computeCohortStanding in lib/server/certificates.)
 */
export async function GET(req: NextRequest) {
  const scoreParam = req.nextUrl.searchParams.get("score");
  const score = typeof scoreParam === "string" ? Number(scoreParam) : NaN;
  if (!Number.isFinite(score)) {
    return NextResponse.json({ error: "score must be a number" }, { status: 400 });
  }

  try {
    const standing = await computeCohortStanding(score);
    if (!standing) {
      return NextResponse.json({ size: 0, median: null, best: null, rank: null, topPct: null });
    }
    return NextResponse.json(standing);
  } catch (err) {
    console.error("cohort error:", err);
    return NextResponse.json({ error: "Failed to compute cohort standing" }, { status: 500 });
  }
}
