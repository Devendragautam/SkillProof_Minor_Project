import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPlan, difficultyFor, planTotal, type SelectedSkill } from "@/lib/server/assessment";
import { requireCandidate } from "@/lib/server/guards";
import { actorOf, audit } from "@/lib/server/audit";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import { createAssessmentSchema, parseJson, sanitizeFileName } from "@/lib/server/validate";
import type { AssessmentPlan } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/assessment — create the personalized assessment for the signed-in
 * candidate. Unauthenticated runs are not allowed: candidate code executes in
 * the verification worker only for authenticated owners of the run.
 * Payloads are zod-validated; client-supplied filenames are sanitized before
 * they are ever persisted.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCandidate();
  if (!guard.ok) return guard.response;

  if (!rateLimit(`assess-create:${guard.user.id}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  const parsed = await parseJson(req, createAssessmentSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const sessionEmail = guard.user.email;

  try {
    let candidateId = body.candidateId;

    // session-bound reuse — a signed-in candidate always reuses their durable
    // profile (oldest row wins) instead of minting a duplicate per run, so the
    // credential wallet and verification ledger stay one continuous history
    if (!candidateId && sessionEmail) {
      const own = await db.candidate.findFirst({
        where: { email: sessionEmail },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (own) candidateId = own.id;
    }

    if (!candidateId) {
      const candidate = await db.candidate.create({
        data: { name: (body.name ?? guard.user.name).trim().slice(0, 80) || "Candidate", email: sessionEmail },
      });
      candidateId = candidate.id;
      if (body.resumeText) {
        await db.resume.create({
          data: {
            candidateId,
            fileName: sanitizeFileName(body.resumeFileName, "pasted-resume.txt"),
            rawText: body.resumeText.slice(0, 60000),
            skillsJson: JSON.stringify(body.skills),
          },
        });
      }
    } else {
      // reuse an existing profile (recruiter-invited candidate, or a signed-in
      // candidate's durable profile): bind the resume to it and keep the
      // identity fields in sync with what the candidate entered
      const existing = await db.candidate.findUnique({ where: { id: candidateId } });
      if (!existing) {
        return NextResponse.json({ error: "Invited profile no longer exists" }, { status: 404 });
      }
      const patch: { name?: string; email?: string | null } = {};
      const newName = body.name?.trim();
      if (newName && newName.length >= 2 && newName !== existing.name) patch.name = newName.slice(0, 80);
      // session-bound reuse: the ACCOUNT email is authoritative — pin it so an
      // empty form field can never detach the run from the candidate's history
      if (existing.email !== sessionEmail) patch.email = sessionEmail;
      if (Object.keys(patch).length > 0) {
        await db.candidate.update({ where: { id: candidateId }, data: patch });
      }
      if (body.resumeText) {
        await db.resume.create({
          data: {
            candidateId,
            fileName: sanitizeFileName(body.resumeFileName, "pasted-resume.txt"),
            rawText: body.resumeText.slice(0, 60000),
            skillsJson: JSON.stringify(body.skills),
          },
        });
      }
    }

    const selected: SelectedSkill[] = body.skills.slice(0, 10).map((s) => ({
      skill: s.skill,
      level: s.level,
    }));

    const { items, skipped } = await buildPlan(selected);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "None of the selected skills have assessment content available.", skipped },
        { status: 422 }
      );
    }

    const claimedLevels: Record<string, string> = {};
    for (const s of selected) claimedLevels[s.skill] = s.level;

    const plan: AssessmentPlan = {
      items: items.map((i) => ({
        skill: i.skill,
        claimedLevel: i.claimedLevel,
        coding: i.coding,
        debugging: i.debugging,
        mcq: i.mcq,
      })),
      currentDifficulty: Object.fromEntries(items.map((i) => [i.skill, difficultyFor(i.claimedLevel)])),
      askedExternalIds: [],
      startedAt: new Date().toISOString(),
    };

    const assessment = await db.assessment.create({
      data: {
        candidateId: candidateId!,
        planJson: JSON.stringify({ ...plan, items, claimedLevels }),
      },
    });

    audit({
      event: "assessment.start",
      actor: actorOf(guard.user),
      detail: { assessmentId: assessment.id, candidateId, skills: selected.map((s) => s.skill) },
    });

    return NextResponse.json({
      assessmentId: assessment.id,
      candidateId,
      total: planTotal(items),
      plan,
      skipped,
    });
  } catch (err) {
    console.error("assessment creation error:", err);
    return NextResponse.json({ error: "Failed to create assessment" }, { status: 500 });
  }
}
