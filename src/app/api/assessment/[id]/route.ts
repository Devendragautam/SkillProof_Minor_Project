import { NextRequest, NextResponse } from "next/server";
import { listPalette, loadPlan, planTotal } from "@/lib/server/assessment";
import { requireAssessmentAccess } from "@/lib/server/guards";

export const runtime = "nodejs";

/**
 * GET /api/assessment/[id] — assessment state, progress & question palette.
 * Owner candidate or recruiter only (401/403/404 per guards).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireAssessmentAccess(id);
  if (!access.ok) return access.response;
  const loaded = await loadPlan(id);
  if (!loaded) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const { assessment, items } = loaded;

  const resolved = assessment.questions.filter((q) => q.status !== "current").length;
  return NextResponse.json({
    id: assessment.id,
    status: assessment.status,
    candidateName: assessment.candidate.name,
    progress: { resolved, total: planTotal(items) },
    palette: await listPalette(id),
    skills: items.map((i) => ({
      skill: i.skill,
      claimedLevel: i.claimedLevel,
      coding: i.coding,
      debugging: i.debugging,
      mcq: i.mcq,
    })),
  });
}
