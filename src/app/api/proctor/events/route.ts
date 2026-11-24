import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * Proctor transcript persistence — the durable twin of the proctor service's
 * in-memory stream.
 *
 * POST /api/proctor/events   — ingest: the local proctor service flushes
 *   event batches here (fire-and-forget; idempotent by event id). Guarded by
 *   the shared ingest key so arbitrary external POSTs can't fabricate
 *   proctoring evidence.
 * GET  /api/proctor/events   — recruiter-only reads:
 *   ?list=1                  → session index (one row per assessment with
 *                              counts + severity tallies + time span)
 *   ?assessmentId=<id>       → full chronological transcript for one run
 */

// Shared secret between the proctor mini-service and this ingest route.
// Both run on the same host and read the SAME env value; the key stops
// random outsiders from writing fabricated proctoring evidence. It is a
// service-to-service key, not a user credential.
const INGEST_KEY = process.env.PROCTOR_INGEST_KEY || "skillproof-proctor-ingest";

const MAX_BATCH = 100;
const PRUNE_KEEP = 4000;

interface IngestEvent {
  id?: unknown;
  candidateId?: unknown;
  candidateName?: unknown;
  assessmentId?: unknown;
  type?: unknown;
  detail?: unknown;
  severity?: unknown;
  ts?: unknown;
}

const str = (v: unknown, max: number): string => String(v ?? "").slice(0, max);

export async function POST(req: NextRequest) {
  if (req.headers.get("x-proctor-key") !== INGEST_KEY) {
    return NextResponse.json({ error: "Unauthorized ingest" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => null)) as { events?: IngestEvent[] } | null;
    const raw = Array.isArray(body?.events) ? body!.events.slice(0, MAX_BATCH) : [];
    if (raw.length === 0) {
      return NextResponse.json({ saved: 0 });
    }

    const rows = raw
      .filter((e) => e && typeof e === "object" && typeof e.id === "string" && e.id.length > 0)
      .map((e) => {
        const tsNum = Number(e.ts);
        const ts = Number.isFinite(tsNum) && tsNum > 0 ? new Date(Math.min(tsNum, Date.now() + 60_000)) : new Date();
        return {
          id: str(e.id, 64),
          candidateId: str(e.candidateId, 64),
          candidateName: str(e.candidateName, 80) || "Candidate",
          assessmentId: str(e.assessmentId, 64),
          type: str(e.type, 32),
          detail: str(e.detail, 160),
          severity: ["info", "good", "warn", "risk"].includes(String(e.severity))
            ? String(e.severity)
            : "info",
          ts,
        };
      });

    // idempotent by event id — re-delivered batches never duplicate
    const saved = await db.$transaction(
      rows.map((row) =>
        db.proctorEventRecord.upsert({
          where: { id: row.id },
          update: {}, // first write wins; the stream is append-only evidence
          create: row,
        })
      )
    );

    // occasional prune so the transcript store can't grow without bound
    if (Math.random() < 0.05) {
      const total = await db.proctorEventRecord.count();
      if (total > PRUNE_KEEP) {
        const oldest = await db.proctorEventRecord.findMany({
          orderBy: { ts: "asc" },
          take: total - PRUNE_KEEP,
          select: { id: true },
        });
        if (oldest.length > 0) {
          await db.proctorEventRecord.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
        }
      }
    }

    return NextResponse.json({ saved: saved.length });
  } catch (err) {
    console.error("proctor ingest error:", err);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireRecruiter();
  if (!guard.ok) return guard.response;

  try {
    const assessmentId = req.nextUrl.searchParams.get("assessmentId")?.trim() ?? "";

    if (!assessmentId) {
      // session index — one row per assessment that has persisted events
      const rows = await db.proctorEventRecord.findMany({
        orderBy: { ts: "desc" },
        take: 3000,
        select: {
          assessmentId: true,
          candidateName: true,
          severity: true,
          type: true,
          ts: true,
        },
      });
      const map = new Map<
        string,
        { assessmentId: string; candidateName: string; count: number; warn: number; risk: number; firstTs: number; lastTs: number; lastType: string }
      >();
      for (const r of rows) {
        if (!r.assessmentId) continue;
        const cur = map.get(r.assessmentId);
        const ts = r.ts.getTime();
        if (!cur) {
          map.set(r.assessmentId, {
            assessmentId: r.assessmentId,
            candidateName: r.candidateName,
            count: 1,
            warn: r.severity === "warn" ? 1 : 0,
            risk: r.severity === "risk" ? 1 : 0,
            firstTs: ts,
            lastTs: ts,
            lastType: r.type,
          });
        } else {
          cur.count += 1;
          if (r.severity === "warn") cur.warn += 1;
          if (r.severity === "risk") cur.risk += 1;
          cur.firstTs = Math.min(cur.firstTs, ts);
          cur.lastTs = Math.max(cur.lastTs, ts);
        }
      }
      const sessions = Array.from(map.values())
        .sort((a, b) => b.lastTs - a.lastTs)
        .slice(0, 30);
      return NextResponse.json({ sessions });
    }

    const events = await db.proctorEventRecord.findMany({
      where: { assessmentId },
      orderBy: { ts: "asc" },
      take: 500,
    });
    return NextResponse.json({
      assessmentId,
      events: events.map((e) => ({
        id: e.id,
        candidateId: e.candidateId,
        candidateName: e.candidateName,
        type: e.type,
        detail: e.detail,
        severity: e.severity,
        ts: e.ts.getTime(),
      })),
    });
  } catch (err) {
    console.error("proctor transcript error:", err);
    return NextResponse.json({ error: "Failed to load transcript" }, { status: 500 });
  }
}
