import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * POST /api/candidates/merge — merge duplicate candidate profiles into one.
 * Body: { keepId: string, mergeIds: string[] }
 *
 * Moves assessments + resumes to the kept profile, unions recruiter tags,
 * appends the merged profiles' notes (attributed), backfills a missing email,
 * then deletes the merged profiles (any leftovers cascade).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const keepId: string = typeof body.keepId === "string" ? body.keepId : "";
    const mergeIds: string[] = Array.isArray(body.mergeIds)
      ? body.mergeIds.filter((i: unknown) => typeof i === "string" && i !== keepId)
      : [];

    if (!keepId) {
      return NextResponse.json({ error: "keepId is required" }, { status: 400 });
    }
    if (mergeIds.length === 0) {
      return NextResponse.json({ error: "No profiles selected to merge" }, { status: 400 });
    }

    const keep = await db.candidate.findUnique({ where: { id: keepId } });
    if (!keep) {
      return NextResponse.json({ error: "Profile to keep was not found" }, { status: 404 });
    }
    const merged = await db.candidate.findMany({ where: { id: { in: mergeIds } } });
    if (merged.length === 0) {
      return NextResponse.json({ error: "Profiles to merge were not found" }, { status: 404 });
    }

    // union tags (keep order: kept profile's tags first)
    const parseTags = (s: string): string[] => {
      try {
        const arr = JSON.parse(s ?? "[]");
        return Array.isArray(arr) ? arr.filter((t) => typeof t === "string") : [];
      } catch {
        return [];
      }
    };
    const tags = Array.from(
      new Set([parseTags(keep.tagsJson), ...merged.map((m) => parseTags(m.tagsJson))].flat())
    ).slice(0, 12);

    // notes: kept notes first, merged appended with attribution
    let notes = keep.notes ?? "";
    for (const m of merged) {
      const mNotes = (m.notes ?? "").trim();
      if (mNotes) {
        notes = `${notes.trim()}\n\n— merged from ${m.name} —\n${mNotes}`;
      }
    }
    notes = notes.trim().slice(0, 4000);

    // backfill missing email from the newest merged profile that has one
    const email =
      keep.email ??
      [...merged]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .find((m) => m.email)?.email ??
      null;

    const result = await db.$transaction(async (tx) => {
      const movedAssessments = await tx.assessment.updateMany({
        where: { candidateId: { in: mergeIds } },
        data: { candidateId: keepId },
      });
      const movedResumes = await tx.resume.updateMany({
        where: { candidateId: { in: mergeIds } },
        data: { candidateId: keepId },
      });
      // Repoint certificates + pipeline events BEFORE deleting the merged
      // profiles — both cascade-delete with the candidate row, and evidence
      // (issued credentials, journey timeline) must survive a merge.
      const movedCertificates = await tx.certificate.updateMany({
        where: { candidateId: { in: mergeIds } },
        data: { candidateId: keepId },
      });
      const movedPipelineEvents = await tx.pipelineEvent.updateMany({
        where: { candidateId: { in: mergeIds } },
        data: { candidateId: keepId },
      });
      await tx.candidate.update({
        where: { id: keepId },
        data: { tagsJson: JSON.stringify(tags), notes, email },
      });
      const removed = await tx.candidate.deleteMany({ where: { id: { in: mergeIds } } });
      return {
        movedAssessments: movedAssessments.count,
        movedResumes: movedResumes.count,
        movedCertificates: movedCertificates.count,
        movedPipelineEvents: movedPipelineEvents.count,
        removed: removed.count,
      };
    });

    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "candidate.merge", keepId, merged: result.removed },
    });

    return NextResponse.json({
      ok: true,
      keepId,
      merged: result.removed,
      movedAssessments: result.movedAssessments,
      movedResumes: result.movedResumes,
      movedCertificates: result.movedCertificates,
      movedPipelineEvents: result.movedPipelineEvents,
    });
  } catch {
    return NextResponse.json({ error: "Merge failed" }, { status: 500 });
  }
}
