import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Structured audit log (Phase-3 hardening).
 *
 * One JSON line per security-relevant event, written to `logs/audit.log`
 * (relative to the process working directory — deployment-independent) with
 * simple size rotation. The log is a forensic trail, not application state:
 * every write is best-effort and must NEVER break or slow the request path.
 *
 * Events: login success/failure · logout · assessment start/complete ·
 * authorization denials · rate-limit denials · code-execution failures ·
 * recruiter actions · shared-report access · certificate issuance.
 *
 * REDACTION RULES (enforced here, the only place audit details are built):
 *   - never log passwords, session secrets, API keys or tokens
 *   - never log full submission code (bounded previews at most, and only
 *     where explicitly passed in by a caller)
 *   - all strings bounded; unknown keys stripped (only the declared fields
 *     of AuditEvent make it to disk)
 */

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "audit.log");
const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB → audit.log.1

export type AuditEventName =
  | "login.success"
  | "login.failure"
  | "logout"
  | "assessment.start"
  | "assessment.complete"
  | "authz.denied"
  | "rate_limit.hit"
  | "exec.failure"
  | "recruiter.action"
  | "report.share_access"
  | "certificate.issue";

export interface AuditEvent {
  event: AuditEventName;
  /** Outcome — defaults to "ok" (meaning depends on the event). */
  outcome?: "ok" | "denied" | "error";
  /** Actor when authenticated. */
  actor?: { id?: string; email?: string; role?: string };
  /** Client IP when known (best-effort behind the gateway). */
  ip?: string;
  /** Bounded, event-specific context — values are stringified + truncated. */
  detail?: Record<string, unknown>;
}

/** Keys that must never reach the audit log even if a caller passes them. */
const FORBIDDEN_KEYS = /^(password|passwordhash|secret|sessionsecret|token|sharetoken|code|apikey|authorization|cookie)$/i;
const MAX_VALUE = 200;
const MAX_JSON = 2000;

function truncate(value: string, max = MAX_VALUE): string {
  return value.length <= max ? value : value.slice(0, max) + "…";
}

function sanitizeDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!detail) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (FORBIDDEN_KEYS.test(k)) continue; // hard redaction
    if (v === null || v === undefined) continue;
    if (typeof v === "string") clean[k] = truncate(v);
    else if (typeof v === "number" || typeof v === "boolean") clean[k] = v;
    else {
      try {
        clean[k] = truncate(JSON.stringify(v), MAX_JSON);
      } catch {
        clean[k] = "[unserializable]";
      }
    }
  }
  return clean;
}

function rotateIfNeeded(): void {
  try {
    const st = statSync(LOG_FILE);
    if (st.size >= MAX_BYTES) {
      try {
        renameSync(LOG_FILE, LOG_FILE + ".1");
      } catch {
        // a concurrent rename is harmless — next event retries
      }
    }
  } catch {
    // file missing — nothing to rotate
  }
}

/** Fire-and-forget audit write. Synchronous append keeps event ordering. */
export function audit(event: AuditEvent): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    const record = {
      ts: new Date().toISOString(),
      event: event.event,
      outcome: event.outcome ?? "ok",
      actor: event.actor ?? null,
      ip: event.ip ?? null,
      detail: sanitizeDetail(event.detail),
    };
    appendFileSync(LOG_FILE, JSON.stringify(record) + "\n", { encoding: "utf8" });
  } catch {
    // auditing must never break the request path
  }
}

/** Best-effort actor summary from a session user (no secrets). */
export function actorOf(user: { id: string; email: string; role: string }): AuditEvent["actor"] {
  return { id: user.id, email: user.email, role: user.role };
}
