import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CategoryScores } from "@/lib/types";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

const MAX_PRESETS = 12;
const CATEGORY_KEYS: Array<keyof CategoryScores> = [
  "problemSolving",
  "debugging",
  "efficiency",
  "codeQuality",
  "explanation",
  "timeManagement",
  "consistency",
];

function parseWeights(raw: string): Partial<CategoryScores> {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<CategoryScores> = {};
    for (const k of CATEGORY_KEYS) {
      const v = Number(obj[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** GET /api/fit-presets — all recruiter-saved role-fit presets (oldest → newest). */
export async function GET() {
  const rows = await db.fitPreset.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    presets: rows.map((r) => ({ id: r.id, name: r.name, weights: parseWeights(r.weightsJson), createdAt: r.createdAt })),
  });
}

/** POST /api/fit-presets — create or update (by name) a saved preset. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as { name?: string; weights?: Record<string, unknown> };
    const name = (body.name ?? "").trim().slice(0, 32);
    if (!name) {
      return NextResponse.json({ error: "Preset name is required" }, { status: 400 });
    }
    const weights = body.weights ?? {};
    const clean: Record<string, number> = {};
    for (const k of CATEGORY_KEYS) {
      const v = Number(weights[k]);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: `Invalid weight for ${k}` }, { status: 400 });
      }
      clean[k] = v;
    }

    const existing = await db.fitPreset.findUnique({ where: { name } });
    if (!existing && (await db.fitPreset.count()) >= MAX_PRESETS) {
      return NextResponse.json(
        { error: `Preset limit reached (${MAX_PRESETS}) — delete one to save another` },
        { status: 400 }
      );
    }

    const preset = await db.fitPreset.upsert({
      where: { name },
      update: { weightsJson: JSON.stringify(clean) },
      create: { name, weightsJson: JSON.stringify(clean) },
    });
    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "fit-preset.save", presetId: preset.id, name },
    });

    return NextResponse.json({ preset: { id: preset.id, name: preset.name, weights: clean, createdAt: preset.createdAt } });
  } catch {
    return NextResponse.json({ error: "Failed to save preset" }, { status: 500 });
  }
}
