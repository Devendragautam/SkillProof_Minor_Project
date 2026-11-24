/**
 * Structured pipeline-decision metadata, shared by the candidate PATCH API,
 * the list/timeline/feed serializers and the recruiter UI.
 *
 * Shape (all fields optional, only stage-relevant ones are captured):
 *  - interview → { scheduledAt?: "YYYY-MM-DD", panel?: string }
 *  - offer     → { comp?: string, startDate?: "YYYY-MM-DD" }
 */
export interface PipelineMeta {
  scheduledAt?: string | null;
  panel?: string | null;
  comp?: string | null;
  startDate?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse the stored JSON column into a PipelineMeta (null-safe, never throws). */
export function parsePipelineMeta(json: string | null | undefined): PipelineMeta | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const meta: PipelineMeta = {};
    let any = false;
    for (const key of ["scheduledAt", "panel", "comp", "startDate"] as const) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) {
        meta[key] = v.trim().slice(0, 120);
        any = true;
      }
    }
    return any ? meta : null;
  } catch {
    return null;
  }
}

/**
 * Validate + normalize an untrusted pipelineMeta payload.
 * Returns the cleaned object (only truthy fields kept) or null when empty/invalid.
 * Dates must be YYYY-MM-DD; text fields are trimmed and capped at 120 chars.
 */
export function sanitizePipelineMeta(input: unknown): PipelineMeta | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const meta: PipelineMeta = {};
  let any = false;
  for (const key of ["scheduledAt", "startDate"] as const) {
    const v = raw[key];
    if (v == null) continue;
    if (typeof v !== "string" || !DATE_RE.test(v.trim()) || isNaN(Date.parse(v.trim()))) return null;
    meta[key] = v.trim();
    any = true;
  }
  for (const key of ["panel", "comp"] as const) {
    const v = raw[key];
    if (v == null) continue;
    if (typeof v !== "string") return null;
    const t = v.trim().slice(0, 120);
    if (t) {
      meta[key] = t;
      any = true;
    }
  }
  return any ? meta : null;
}

/** Serialize to the JSON column value (null when empty). */
export function serializePipelineMeta(meta: PipelineMeta | null): string | null {
  return meta ? JSON.stringify(meta) : null;
}

/** Human summary for tooltips/pills — "Oct 2 · panel: Priya + Arjun" / "90k · starts Nov 1". */
export function pipelineMetaSummary(meta: PipelineMeta | null | undefined): string {
  if (!meta) return "";
  const parts: string[] = [];
  if (meta.scheduledAt) {
    const d = new Date(`${meta.scheduledAt}T00:00:00`);
    if (!isNaN(d.getTime())) parts.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  if (meta.panel) parts.push(`panel: ${meta.panel}`);
  if (meta.comp) parts.push(meta.comp);
  if (meta.startDate) {
    const d = new Date(`${meta.startDate}T00:00:00`);
    if (!isNaN(d.getTime()))
      parts.push(`starts ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
  }
  return parts.join(" · ");
}
