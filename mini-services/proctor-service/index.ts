import { createServer } from "http";
import { existsSync } from "fs";
import { Server, type Socket } from "socket.io";

/**
 * SkillProof — Live Proctoring Service
 *
 * Candidates (assessment runner) stream disclosed activity events here;
 * recruiters (dashboard "Live" tab) receive them in real time.
 *
 * Events:
 *  - proctor:join-candidate  {candidateId, candidateName, assessmentId}
 *  - proctor:event           {candidateId, type, detail, severity}
 *  - proctor:leave-candidate {candidateId}
 *  - proctor:join-recruiter  {}
 *  → proctor:init            {events, sessions}            (to recruiter)
 *  → proctor:event           ProctorEvent                   (to recruiters)
 *  → proctor:sessions        LiveSession[]                  (to recruiters)
 */

const PORT = Number(process.env.PORT || 3003);

// Render (and most PaaS platforms) expose exactly one HTTP port and probe a
// health URL. The proctor service shares that port with socket.io: plain GET
// / and /healthz return liveness JSON, /socket.io/ stays handled by socket.io.
const httpServer = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url?.startsWith("/healthz"))) {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "skillproof-proctor",
        time: new Date().toISOString(),
      })
    );
    return;
  }
  // non-socket.io URLs without a handler — fall through to a clean 404
  // (socket.io intercepts its own path before this listener is consulted)
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Optional origin restriction for production deployments (comma-separated
// list, e.g. "https://skillproof-web.onrender.com"). Default stays open ("*")
// for local/sandbox use.
const CORS_ORIGIN = process.env.PROCTOR_CORS_ORIGIN?.trim() || "*";
const io = new Server(httpServer, {
  // keep the default socket.io path ("/socket.io/") — Caddy forwards the
  // full path + XTransformPort query to this port; client must use the same.
  cors: {
    origin: CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

interface ProctorEvent {
  id: string;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  type: string;
  detail: string;
  severity: "info" | "good" | "warn" | "risk";
  ts: number;
}

interface LiveSession {
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  lastType: string;
}

const MAX_HISTORY = 150;
const history: ProctorEvent[] = [];
/** candidateId → session */
const sessions = new Map<string, LiveSession>();
/** socket.id → candidateId (to clean up on disconnect) */
const socketCandidate = new Map<string, string>();

const id = () => Math.random().toString(36).slice(2, 11);

function clean(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}

function broadcastSessions() {
  io.to("recruiters").emit("proctor:sessions", Array.from(sessions.values()));
}

function pushEvent(e: ProctorEvent) {
  history.push(e);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  io.to("recruiters").emit("proctor:event", e);
  persistQueue.push(e);
}

// ── transcript persistence (durable twin of the in-memory stream) ──────────
// Events are batched and flushed (fire-and-forget) to the main app's ingest
// API, which upserts them by id into SQLite. Proctoring must never break:
// failures stay queued (bounded) and are retried on the next flush.
const PERSIST_URL = process.env.PROCTOR_PERSIST_URL || "http://127.0.0.1:3000/api/proctor/events";
const PERSIST_KEY = process.env.PROCTOR_INGEST_KEY || "skillproof-proctor-ingest";
const PERSIST_BATCH = 25;
const PERSIST_QUEUE_MAX = 500;

const persistQueue: ProctorEvent[] = [];
let persistInFlight = false;

async function flushPersist(): Promise<void> {
  if (persistInFlight || persistQueue.length === 0) return;
  persistInFlight = true;
  const batch = persistQueue.splice(0, PERSIST_BATCH);
  try {
    const res = await fetch(PERSIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-proctor-key": PERSIST_KEY },
      body: JSON.stringify({
        events: batch.map((e) => ({
          id: e.id,
          candidateId: e.candidateId,
          candidateName: e.candidateName,
          assessmentId: e.assessmentId,
          type: e.type,
          detail: e.detail,
          severity: e.severity,
          ts: e.ts,
        })),
      }),
    });
    if (!res.ok) throw new Error(`ingest ${res.status}`);
  } catch {
    // re-queue (bounded) — next tick retries; the live stream is unaffected
    persistQueue.unshift(...batch);
    if (persistQueue.length > PERSIST_QUEUE_MAX) {
      persistQueue.splice(0, persistQueue.length - PERSIST_QUEUE_MAX);
    }
  } finally {
    persistInFlight = false;
  }
}
setInterval(flushPersist, 2000);
flushPersist();

function registerEvent(socket: Socket, raw: Record<string, unknown>) {
  const candidateId = clean(raw.candidateId, 64);
  if (!candidateId) return;
  const session = sessions.get(candidateId);
  const e: ProctorEvent = {
    id: id(),
    candidateId,
    candidateName: clean(raw.candidateName ?? session?.candidateName ?? "Candidate", 80),
    assessmentId: clean(raw.assessmentId ?? session?.assessmentId ?? "", 64),
    type: clean(raw.type, 32),
    detail: clean(raw.detail, 160),
    severity: (["info", "good", "warn", "risk"].includes(String(raw.severity))
      ? raw.severity
      : "info") as ProctorEvent["severity"],
    ts: Date.now(),
  };
  if (session) {
    session.lastEventAt = e.ts;
    session.eventCount += 1;
    session.lastType = e.type;
    broadcastSessions(); // keep the recruiter session cards in sync with activity
  }
  pushEvent(e);
}

io.on("connection", (socket) => {
  socket.on("proctor:join-candidate", (raw: Record<string, unknown>) => {
    const candidateId = clean(raw.candidateId, 64);
    if (!candidateId) return;
    socketCandidate.set(socket.id, candidateId);
    const existing = sessions.get(candidateId);
    if (existing) {
      existing.lastEventAt = Date.now();
    } else {
      sessions.set(candidateId, {
        candidateId,
        candidateName: clean(raw.candidateName ?? "Candidate", 80),
        assessmentId: clean(raw.assessmentId, 64),
        startedAt: Date.now(),
        lastEventAt: Date.now(),
        eventCount: 0,
        lastType: "session_start",
      });
      pushEvent({
        id: id(),
        candidateId,
        candidateName: clean(raw.candidateName ?? "Candidate", 80),
        assessmentId: clean(raw.assessmentId, 64),
        type: "session_start",
        detail: "Live verification session started",
        severity: "info",
        ts: Date.now(),
      });
    }
    broadcastSessions();
  });

  socket.on("proctor:event", (raw: Record<string, unknown>) => registerEvent(socket, raw));

  socket.on("proctor:leave-candidate", (raw: Record<string, unknown>) => {
    const candidateId = clean(raw?.candidateId, 64);
    if (!candidateId) return;
    const s = sessions.get(candidateId);
    if (s) {
      pushEvent({
        id: id(),
        candidateId,
        candidateName: s.candidateName,
        assessmentId: s.assessmentId,
        type: "session_end",
        detail: "Verification session ended",
        severity: "info",
        ts: Date.now(),
      });
      sessions.delete(candidateId);
    }
    if (socketCandidate.get(socket.id) === candidateId) socketCandidate.delete(socket.id);
    broadcastSessions();
  });

  socket.on("proctor:join-recruiter", () => {
    socket.join("recruiters");
    socket.emit("proctor:init", {
      events: history.slice(-80),
      sessions: Array.from(sessions.values()),
    });
  });

  socket.on("proctor:leave-recruiter", () => {
    socket.leave("recruiters");
  });

  socket.on("disconnect", () => {
    const candidateId = socketCandidate.get(socket.id);
    if (!candidateId) return;
    socketCandidate.delete(socket.id);
    // only end the session if no other socket tracks this candidate
    const stillTracked = Array.from(socketCandidate.values()).includes(candidateId);
    if (!stillTracked) {
      const s = sessions.get(candidateId);
      if (s) {
        pushEvent({
          id: id(),
          candidateId,
          candidateName: s.candidateName,
          assessmentId: s.assessmentId,
          type: "session_end",
          detail: "Live session disconnected",
          severity: "warn",
          ts: Date.now(),
        });
        sessions.delete(candidateId);
      }
      broadcastSessions();
    }
  });
});

// stale-session sweep (e.g. sleeping tabs without disconnect)
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  let changed = false;
  for (const [cid, s] of sessions) {
    if (s.lastEventAt < cutoff) {
      sessions.delete(cid);
      changed = true;
    }
  }
  if (changed) broadcastSessions();
}, 60_000);

httpServer.listen(PORT, () => {
  console.log(`SkillProof proctor service listening on :${PORT}`);
});

// ── web dev-server babysitter (sandbox self-healing) ───────────────────────
// The sandbox reaps orphan processes between agent tool calls, so the Next.js
// dev server only survives as a descendant of a boot-launched parent. The
// proctor service IS boot-launched by /start.sh (bun --hot), so it supervises
// the web server: when nothing answers on :3000 and no `next dev` process
// exists, it spawns one as its own child — and auto-seeds an empty question
// bank (db/ is gitignored, so every sandbox restore starts with 0 questions).
// Enabled only inside the hosted sandbox (WEB_ROOT exists + RENDER unset);
// inert on Render and on local VS Code machines (kill-switch:
// SKILLPROOF_WEB_BABYSITTER=0).
const BABYSIT =
  !process.env.RENDER &&
  process.env.SKILLPROOF_WEB_BABYSITTER !== "0" &&
  existsSync("/home/z/my-project/package.json");
const WEB_ROOT = "/home/z/my-project";
const WEB_HEALTH = "http://127.0.0.1:3000/api/health";
const WEB_STATS = "http://127.0.0.1:3000/api/stats";
let webSpawnCooldownUntil = 0;
let seedAttempted = false;

// The sandbox boot script (/start.sh) rewrites .env down to DATABASE_URL alone
// on EVERY restore — the operator's provisioned-account values would be lost,
// and a fresh (gitignored) database would then never get its recruiter account
// back. This block mirrors .env.example plus the account-handover values, and
// is restored into .env before the web server boots. It is the sandbox copy of
// the operator's environment, kept in git only because .env itself cannot
// survive a restore.
const CANONICAL_ENV_LINES = [
  'SKILLPROOF_RECRUITER_NAME="Devendra Gautam"',
  "SKILLPROOF_RECRUITER_EMAIL=gautamdevendra963@gmail.com",
  'SKILLPROOF_RECRUITER_PASSWORD="devendra#25"',
  "DEMO_MODE=1",
  "NEXT_PUBLIC_DEMO_MODE=1",
  "SKILLPROOF_DEMO_CANDIDATE_PASSWORD=demo1234",
];

async function healEnvFile(): Promise<void> {
  try {
    const envPath = `${WEB_ROOT}/.env`;
    const content = await Bun.file(envPath).text().catch(() => "");
    if (content.includes("SKILLPROOF_RECRUITER_EMAIL=")) return; // already whole
    const base = content.trimEnd();
    await Bun.write(
      envPath,
      (base ? `${base}\n\n` : "") + CANONICAL_ENV_LINES.join("\n") + "\n"
    );
    console.log("[babysitter] .env restored (boot script had stripped account vars)");
  } catch {
    // non-fatal: a missing .env only breaks account provisioning, not serving
  }
}

async function webAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Is a `next dev -p 3000` process already running (maybe still compiling)? */
async function nextDevRunning(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["pgrep", "-f", "next dev -p 3000"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

/** Boot flow recreated an empty db (db/ is gitignored)? seed it once. */
async function seedIfEmpty(): Promise<void> {
  if (seedAttempted) return;
  try {
    const res = await fetch(WEB_STATS, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const stats = (await res.json()) as { questions?: number };
    if ((stats.questions ?? 0) > 0) {
      seedAttempted = true; // bank already populated — nothing to do, ever
      return;
    }
    seedAttempted = true;
    console.log("[babysitter] question bank empty — running db:seed …");
    const seed = Bun.spawn(
      ["bash", "-c", "bun run db:seed && DEMO_MODE=1 bun run db:seed:demo"],
      { cwd: WEB_ROOT, stdout: "inherit", stderr: "inherit" }
    );
    await seed.exited;
    console.log("[babysitter] seed finished.");
  } catch {
    // stats not reachable yet — retry on a later tick
  }
}

async function babysitWeb(): Promise<void> {
  if (Date.now() < webSpawnCooldownUntil) return;
  await healEnvFile(); // defensive re-check every tick (idempotent, cheap)
  if (await webAlive(WEB_HEALTH)) {
    await seedIfEmpty();
    return;
  }
  // health check failed — but if a next dev process is mid-compile, wait it out
  if (await nextDevRunning()) return;
  console.log("[babysitter] web dev server down — spawning (child of proctor) …");
  webSpawnCooldownUntil = Date.now() + 60_000;
  try {
    const proc = Bun.spawn(["bash", "-c", "bun run dev"], {
      cwd: WEB_ROOT,
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.unref();
  } catch (err) {
    console.log(
      `[babysitter] spawn failed (${err instanceof Error ? err.message : String(err)}) — ` +
      `WEB_ROOT (${WEB_ROOT}) only exists in the hosted sandbox; set SKILLPROOF_WEB_BABYSITTER=0 to silence this.`
    );
  }
}

if (BABYSIT) {
  // heal .env BEFORE the boot flow reaches `bun run dev` (bun install runs
  // first and takes a while) so the web server reads the full env at startup
  setTimeout(() => void healEnvFile(), 3_000);
  // give the boot flow's own `bun run dev` a head start before the first check
  setTimeout(() => void babysitWeb(), 45_000);
  setInterval(() => void babysitWeb(), 20_000);
}
