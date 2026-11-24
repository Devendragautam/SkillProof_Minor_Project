import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sanitizePipelineMeta, serializePipelineMeta } from "@/lib/pipeline-meta";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/** GET /api/candidates/[id] — public invite-bind data (used by ?invite= links) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const candidate = await db.candidate.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, invited: true, archived: true },
    });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    return NextResponse.json({ candidate });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}

/** DELETE /api/candidates/[id] — remove a candidate (cascades resumes, assessments, reports) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    await db.candidate.delete({ where: { id } });
    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "candidate.delete", candidateId: id },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

/** PATCH /api/candidates/[id] — recruiter notes, tags & pipeline decision */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();

    const data: {
      notes?: string;
      tagsJson?: string;
      archived?: boolean;
      pipelineStatus?: string | null;
      pipelineNote?: string | null;
      pipelineMetaJson?: string | null;
      pipelineUpdatedAt?: Date;
    } = {};
    if (typeof body.notes === "string") data.notes = body.notes.slice(0, 4000);
    if (typeof body.archived === "boolean") data.archived = body.archived;
    if (Array.isArray(body.tags)) {
      const tags = body.tags
        .map((t: unknown) => String(t).trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 12);
      data.tagsJson = JSON.stringify(Array.from(new Set(tags)));
    }
    // Pipeline decision: "shortlisted" | "interview" | "offer" | "rejected" | null (clear).
    // A note is stored alongside the decision; clearing also clears the note.
    // Every change is appended to the PipelineEvent audit trail (journey timeline).
    let pipelineEvent: { status: string; note: string | null; metaJson: string | null } | null = null;
    if (body.pipelineStatus !== undefined) {
      if (body.pipelineStatus === null) {
        data.pipelineStatus = null;
        data.pipelineNote = null;
        data.pipelineMetaJson = null;
        data.pipelineUpdatedAt = new Date();
        pipelineEvent = { status: "cleared", note: null, metaJson: null };
      } else if (
        body.pipelineStatus === "shortlisted" ||
        body.pipelineStatus === "interview" ||
        body.pipelineStatus === "offer" ||
        body.pipelineStatus === "rejected"
      ) {
        data.pipelineStatus = body.pipelineStatus;
        data.pipelineNote =
          typeof body.pipelineNote === "string" && body.pipelineNote.trim()
            ? body.pipelineNote.trim().slice(0, 4000)
            : null;
        // Structured metadata (interview date/panel, offer comp/start) — validated;
        // invalid shapes reject the whole PATCH with 400 so bad data never lands.
        const meta = body.pipelineMeta !== undefined ? sanitizePipelineMeta(body.pipelineMeta) : null;
        if (body.pipelineMeta !== undefined && body.pipelineMeta !== null && meta === null) {
          return NextResponse.json({ error: "Invalid pipeline metadata" }, { status: 400 });
        }
        data.pipelineMetaJson = serializePipelineMeta(meta);
        data.pipelineUpdatedAt = new Date();
        pipelineEvent = { status: body.pipelineStatus, note: data.pipelineNote ?? null, metaJson: data.pipelineMetaJson };
      } else {
        return NextResponse.json({ error: "Invalid pipeline status" }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    await db.$transaction([
      db.candidate.update({ where: { id }, data }),
      ...(pipelineEvent
        ? [db.pipelineEvent.create({ data: { candidateId: id, status: pipelineEvent.status, note: pipelineEvent.note, metaJson: pipelineEvent.metaJson } })]
        : []),
    ]);
    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: {
        action: "candidate.update",
        candidateId: id,
        pipelineStatus: pipelineEvent?.status ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
