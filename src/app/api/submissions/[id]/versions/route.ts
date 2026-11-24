import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSubmissionAccess } from "@/lib/server/guards";
import type { CodeVersion } from "@/lib/types";

export const runtime = "nodejs";

export interface EvolutionStep {
  t: number;
  label: string;
  lines: number;
  addedLines: number;
  removedLines: number;
  similarity: number; // 0-100 vs previous snapshot
  preview: string; // first ~8 lines
}

function lineDiff(prev: string, next: string): { added: number; removed: number; similarity: number } {
  const a = prev.split("\n").map((l) => l.trim()).filter(Boolean);
  const b = next.split("\n").map((l) => l.trim()).filter(Boolean);
  const count = new Map<string, number>();
  for (const l of a) count.set(l, (count.get(l) ?? 0) + 1);
  let kept = 0;
  for (const l of b) {
    const c = count.get(l) ?? 0;
    if (c > 0) {
      kept++;
      count.set(l, c - 1);
    }
  }
  const added = b.length - kept;
  const removed = a.length - kept;
  const max = Math.max(a.length, b.length, 1);
  return { added, removed, similarity: Math.round((kept / max) * 100) };
}

/**
 * GET /api/submissions/[id]/versions — solution evolution timeline with diffs.
 * Authenticated owner candidate (or the run's recruiter) only.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireSubmissionAccess(id);
  if (!access.ok) return access.response;

  const sub = await db.submission.findUnique({ where: { id } });
  if (!sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

  const versions: CodeVersion[] = JSON.parse(sub.versionsJson || "[]");
  const steps: EvolutionStep[] = [];
  let prev = "";

  for (const v of versions) {
    const d = lineDiff(prev, v.code);
    steps.push({
      t: v.t,
      label: v.label,
      lines: v.code.split("\n").length,
      addedLines: d.added,
      removedLines: d.removed,
      similarity: prev ? d.similarity : 100,
      preview: v.code.split("\n").slice(0, 8).join("\n").slice(0, 420),
    });
    prev = v.code;
  }

  // final submission delta vs last snapshot
  let finalDelta: { addedLines: number; removedLines: number; similarity: number } | null = null;
  if (versions.length > 0 && sub.code) {
    const d = lineDiff(prev, sub.code);
    finalDelta = { addedLines: d.added, removedLines: d.removed, similarity: d.similarity };
  }

  return NextResponse.json({
    submissionId: sub.id,
    versions: steps,
    finalDelta,
    finalLines: sub.code ? sub.code.split("\n").length : 0,
    totalEvents: JSON.parse(sub.eventsJson || "[]").length,
  });
}
