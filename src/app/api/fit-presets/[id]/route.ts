import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/** DELETE /api/fit-presets/[id] — remove a saved role-fit preset. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    await db.fitPreset.delete({ where: { id } });
    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "fit-preset.delete", presetId: id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 });
  }
}
