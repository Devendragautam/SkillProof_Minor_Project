import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";
import { getTimerPolicy, sanitizeTimerPolicy, TIMER_DEFAULTS } from "@/lib/server/timer-policy";

export const runtime = "nodejs";

/**
 * GET /api/timer-policy — current section-wise assessment timer policy.
 * Public read (the policy also drives candidate-facing timers), mutations
 * are recruiter-only via PUT.
 */
export async function GET() {
  try {
    const policy = await getTimerPolicy();
    const row = await db.timerPolicy.findUnique({
      where: { id: "default" },
      select: { updatedBy: true, updatedAt: true },
    });
    return NextResponse.json({
      policy,
      defaults: TIMER_DEFAULTS,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("timer-policy GET error:", err);
    return NextResponse.json({ error: "Failed to load timer policy" }, { status: 500 });
  }
}

/**
 * PUT /api/timer-policy — recruiter updates the section-wise time limits,
 * per-skill overrides and proctor severity thresholds. Body:
 * { debuggingMin, dsaEasyMin, dsaMediumMin, dsaHardMin, mcqSec,
 *   skillOverrides?: { [skill]: minutes }, pasteWarnChars?, pasteRiskChars?,
 *   explainWarnPct? }
 * Values are clamped server-side (minutes 1–180, seconds 10–3600, ≤32 skills,
 * paste warn 10–10000 chars, risk ≥ warn+10, explain 0–100%).
 */
export async function PUT(req: NextRequest) {
  const guard = await requireRecruiter();
  if (!guard.ok) return guard.response;
  try {
    const body = await req.json().catch(() => ({}));
    const values = sanitizeTimerPolicy(body);
    await db.timerPolicy.upsert({
      where: { id: "default" },
      update: {
        debuggingMin: values.debuggingMin,
        dsaEasyMin: values.dsaEasyMin,
        dsaMediumMin: values.dsaMediumMin,
        dsaHardMin: values.dsaHardMin,
        mcqSec: values.mcqSec,
        skillOverridesJson: JSON.stringify(values.skillOverrides),
        pasteWarnChars: values.pasteWarnChars,
        pasteRiskChars: values.pasteRiskChars,
        explainWarnPct: values.explainWarnPct,
        updatedBy: guard.user.name,
      },
      create: {
        id: "default",
        debuggingMin: values.debuggingMin,
        dsaEasyMin: values.dsaEasyMin,
        dsaMediumMin: values.dsaMediumMin,
        dsaHardMin: values.dsaHardMin,
        mcqSec: values.mcqSec,
        skillOverridesJson: JSON.stringify(values.skillOverrides),
        pasteWarnChars: values.pasteWarnChars,
        pasteRiskChars: values.pasteRiskChars,
        explainWarnPct: values.explainWarnPct,
        updatedBy: guard.user.name,
      },
    });
    const row = await db.timerPolicy.findUnique({
      where: { id: "default" },
      select: { updatedBy: true, updatedAt: true },
    });
    audit({
      event: "recruiter.action",
      actor: actorOf(guard.user),
      detail: { action: "timer-policy.update" },
    });

    return NextResponse.json({
      policy: values,
      updatedBy: row?.updatedBy ?? guard.user.name,
      updatedAt: row?.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error("timer-policy PUT error:", err);
    return NextResponse.json({ error: "Failed to save timer policy" }, { status: 500 });
  }
}
