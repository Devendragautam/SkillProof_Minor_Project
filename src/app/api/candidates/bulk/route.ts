import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * POST /api/candidates/bulk — recruiter bulk actions.
 * Body: { action: "tag" | "delete" | "untag" | "archive" | "restore" | "shortlist" | "interview" | "offer" | "reject" | "clear-pipeline", ids: string[], tag?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : [];
    const action: string = body.action;

    if (ids.length === 0) {
      return NextResponse.json({ error: "No candidates selected" }, { status: 400 });
    }
    if (
      ![
        "tag",
        "untag",
        "delete",
        "archive",
        "restore",
        "shortlist",
        "interview",
        "offer",
        "reject",
        "clear-pipeline",
      ].includes(action)
    ) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (action === "delete") {
      const result = await db.candidate.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ ok: true, affected: result.count });
    }

    if (action === "archive" || action === "restore") {
      const result = await db.candidate.updateMany({
        where: { id: { in: ids } },
        data: { archived: action === "archive" },
      });
      return NextResponse.json({ ok: true, affected: result.count });
    }

    // Pipeline decisions — bulk shortlist / interview / offer / reject / clear (note
    // stays optional and is only written when provided, so an existing note
    // survives a re-decision). Each candidate gets a PipelineEvent audit row.
    if (
      action === "shortlist" ||
      action === "interview" ||
      action === "offer" ||
      action === "reject" ||
      action === "clear-pipeline"
    ) {
      const statusMap: Record<string, string> = {
        shortlist: "shortlisted",
        interview: "interview",
        offer: "offer",
        reject: "rejected",
        "clear-pipeline": "cleared",
      };
      const eventStatus = statusMap[action];
      const note =
        action !== "clear-pipeline" &&
        typeof body.note === "string" &&
        body.note.trim()
          ? body.note.trim().slice(0, 4000)
          : null;
      const data =
        action === "clear-pipeline"
          ? { pipelineStatus: null, pipelineNote: null, pipelineUpdatedAt: new Date() }
          : {
              pipelineStatus: eventStatus,
              ...(note ? { pipelineNote: note } : {}),
              pipelineUpdatedAt: new Date(),
            };
      const [result] = await db.$transaction([
        db.candidate.updateMany({ where: { id: { in: ids } }, data }),
        db.pipelineEvent.createMany({
          data: ids.map((id) => ({ candidateId: id, status: eventStatus, note })),
        }),
      ]);
      return NextResponse.json({ ok: true, affected: result.count });
    }

    const tag = typeof body.tag === "string" ? body.tag.trim().slice(0, 24) : "";
    if (!tag) {
      return NextResponse.json({ error: "Tag is required" }, { status: 400 });
    }

    const existing = await db.candidate.findMany({ where: { id: { in: ids } } });
    let affected = 0;
    for (const c of existing) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(c.tagsJson ?? "[]");
        if (!Array.isArray(tags)) tags = [];
      } catch {}
      const next =
        action === "tag"
          ? Array.from(new Set([...tags, tag])).slice(0, 12)
          : tags.filter((t) => t !== tag);
      await db.candidate.update({ where: { id: c.id }, data: { tagsJson: JSON.stringify(next) } });
      affected += 1;
    }
    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "candidate.bulk", bulkAction: action, affected },
    });

    return NextResponse.json({ ok: true, affected });
  } catch {
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
