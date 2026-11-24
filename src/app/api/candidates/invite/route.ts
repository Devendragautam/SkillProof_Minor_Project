import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

/**
 * POST /api/candidates/invite — recruiter creates a placeholder profile and
 * gets back an invite link id. The candidate opens /?invite=<id>, uploads
 * their resume, and every assessment attaches to this profile.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = (await req.json()) as { name?: string; email?: string; note?: string };

    const name = body.name?.trim();
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Candidate name is required" }, { status: 400 });
    }
    const email = body.email?.trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "That email address doesn't look valid" }, { status: 400 });
    }

    const note = body.note?.trim().slice(0, 500);
    const stamp = new Date().toISOString().slice(0, 10);
    const notes = note ? `[invite ${stamp}] ${note}` : "";

    const candidate = await db.candidate.create({
      data: {
        name: name.slice(0, 80),
        email: email ? email.slice(0, 120) : null,
        invited: true,
        notes,
      },
    });

    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "candidate.invite", candidateId: candidate.id, invited: true },
    });

    return NextResponse.json({
      candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
      invitePath: `/?invite=${candidate.id}`,
    });
  } catch (err) {
    console.error("invite creation error:", err);
    return NextResponse.json({ error: "Failed to create the invite" }, { status: 500 });
  }
}
