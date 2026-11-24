"use client";

import { io, type Socket } from "socket.io-client";

/**
 * SkillProof — client side of the live proctoring service.
 * A single shared socket, safe to call from any component.
 */

export interface ProctorEvent {
  id: string;
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  type: string;
  detail: string;
  severity: "info" | "good" | "warn" | "risk";
  ts: number;
}

export interface LiveSession {
  candidateId: string;
  candidateName: string;
  assessmentId: string;
  startedAt: number;
  lastEventAt: number;
  eventCount: number;
  lastType: string;
}

let socket: Socket | null = null;

// Sandbox gateway routes /?XTransformPort=3003 to the proctor service. Local
// (VS Code) runs have no gateway — set NEXT_PUBLIC_PROCTOR_URL=http://localhost:3003
// in .env.local and the socket connects to the proctor service directly
// (it sends CORS origin:*, so cross-origin from :3000 is fine).
const PROCTOR_URL = process.env.NEXT_PUBLIC_PROCTOR_URL || "/?XTransformPort=3003";

// ── connection status store (shared by LiveMonitor + dashboard tab dot) ────
export type ProctorStatus = "idle" | "connecting" | "live" | "offline";

let proctorStatus: ProctorStatus = "idle";
const statusListeners = new Set<() => void>();

function setStatus(next: ProctorStatus) {
  if (proctorStatus === next) return;
  proctorStatus = next;
  for (const fn of statusListeners) fn();
}

/** Subscribe to proctor connection status changes (for useSyncExternalStore). */
export function subscribeProctorStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

export function getProctorStatusSnapshot(): ProctorStatus {
  return proctorStatus;
}

export function getProctorSocket(): Socket {
  if (typeof window === "undefined") throw new Error("proctor socket is browser-only");
  if (!socket) {
    // polling first: the gateway forwards long-polling reliably; websocket
    // is used as an upgrade when available. (websocket-first would fail
    // hard behind the Caddy XTransformPort rule, with no automatic fallback)
    socket = io(PROCTOR_URL, {
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      reconnection: true,
      // never give up: recruiter tabs live long and the proctor service may
      // restart (deploy/crash) — the tab must recover automatically
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });
    proctorStatus = "connecting";
    socket.on("connect", () => setStatus("live"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));
    socket.on("disconnect", (reason) => setStatus(reason === "io client disconnect" ? "idle" : "offline"));
    socket.on("connect_error", () => setStatus("offline"));
  }
  return socket;
}

export function closeProctorSocket(): void {
  socket?.disconnect();
  socket = null;
}

export interface ProctorIdentity {
  candidateId: string;
  candidateName: string;
  assessmentId: string;
}

const lastEmit = new Map<string, number>();
const THROTTLE_MS = 700;

/** Emit a live proctoring event (throttled per type; silently drops when offline). */
export function emitProctorEvent(
  identity: ProctorIdentity,
  type: string,
  detail: string,
  severity: ProctorEvent["severity"] = "info"
): void {
  try {
    const now = Date.now();
    const prev = lastEmit.get(type) ?? 0;
    if (now - prev < THROTTLE_MS) return;
    lastEmit.set(type, now);
    const s = getProctorSocket();
    if (!s.connected) return;
    s.emit("proctor:event", { ...identity, type, detail, severity });
  } catch {
    // proctoring must never break the assessment
  }
}

export function joinAsCandidate(identity: ProctorIdentity): void {
  try {
    const s = getProctorSocket();
    s.emit("proctor:join-candidate", identity);
  } catch {}
}

export function leaveAsCandidate(identity: ProctorIdentity): void {
  try {
    socket?.emit("proctor:leave-candidate", { candidateId: identity.candidateId });
  } catch {}
}
