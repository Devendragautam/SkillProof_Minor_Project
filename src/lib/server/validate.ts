import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Shared request-body validation (Phase-2 hardening).
 *
 * Every mutating endpoint parses its payload through a zod schema from THIS
 * module so lengths, enums, numeric ranges and shapes are enforced
 * consistently server-side. Unknown keys are STRIPPED (zod default) — the
 * browser can never smuggle authoritative fields (score, passed, status,
 * aiRiskScore, …) into a graded payload; anything not declared is discarded.
 */

// ─── primitive building blocks ───────────────────────────────────────────────

/** Database ids (cuid / cuid2 / uuid-ish) — length-bounded, no whitespace. */
export const idSchema = z.string().min(6).max(40).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

export const languageSchema = z.enum(["javascript", "python", "cpp", "java", "sql"]);

/** 60 KB hard reject (abuse), graded payloads additionally slice to 30 KB. */
export const codeSchema = z.string().max(60_000, "Code exceeds the maximum size");

/** Behavior-event timestamps are MILLISECONDS since question start (see
 *  BehaviorTracker.t() — Date.now() delta — and metrics.ts totalMs). The cap
 *  is 24h in ms; the previous 86_400 cap silently rejected every submission
 *  from a question worked longer than 86.4 seconds with a 400. */
const eventTimeSchema = z
  .number()
  .finite()
  .min(0)
  .max(86_400_000, "Event timestamp out of range")
  .nullable()
  .optional();

export const behaviorEventSchema = z.object({
  type: z.string().max(40),
  t: eventTimeSchema,
  passCount: z.number().int().min(0).max(10_000).optional(),
  total: z.number().int().min(0).max(10_000).optional(),
  error: z.boolean().optional(),
});

export const codeVersionSchema = z.object({
  code: z.string().max(60_000),
  label: z.string().max(120).optional(),
  t: eventTimeSchema,
});

export const adaptiveResultSchema = z.enum(["solved_fast", "solved", "partial", "failed"]);

// ─── endpoint payloads ───────────────────────────────────────────────────────

/** POST /api/run */
export const runBodySchema = z.object({
  aqId: idSchema,
  code: codeSchema,
  language: languageSchema.optional(),
});
export type RunBody = z.infer<typeof runBodySchema>;

/** POST /api/assessment/[id]/submit */
export const submitBodySchema = z.object({
  aqId: idSchema,
  code: codeSchema.optional(),
  language: languageSchema.optional(),
  events: z.array(behaviorEventSchema).max(2000).optional(),
  versions: z.array(codeVersionSchema).max(30).optional(),
  mcqAnswerIndex: z.number().int().min(-1).max(64).optional(),
  // accepted for protocol compatibility but NEVER trusted and NEVER stored —
  // the server derives time from dealtAt/deadlineAt (see assessment-state.ts).
  // Any finite number is accepted and then ignored: a lying browser must not
  // get a validation error, it must simply not influence grading.
  timeSpentSec: z.number().finite().optional(),
});
export type SubmitBody = z.infer<typeof submitBodySchema>;

/** POST /api/assessment/[id]/next */
export const nextBodySchema = z.object({
  skill: z.string().max(80).optional(),
  result: adaptiveResultSchema.optional(),
});

/** aqId-only bodies (skip / goto / hint) */
export const aqIdBodySchema = z.object({ aqId: idSchema });

/** POST /api/assessment/[id]/explain */
export const explainBodySchema = z.object({
  submissionId: idSchema,
  answers: z
    .array(z.object({ q: z.string().max(400), answer: z.string().max(3000) }))
    .max(5),
});

/** POST /api/assessment — create a run */
export const createAssessmentSchema = z.object({
  candidateId: idSchema.optional(),
  name: z.string().max(80).optional(),
  email: z.string().max(120).optional(),
  resumeText: z.string().max(60_000).optional(),
  resumeFileName: z.string().max(160).optional(),
  skills: z
    .array(z.object({ skill: z.string().min(1).max(60), level: z.enum(["Basic", "Intermediate", "Advanced"]) }))
    .min(1)
    .max(10),
});

/** POST /api/certificates — issue */
export const issueCertificateSchema = z.object({ assessmentId: idSchema });

/** POST /api/auth/login */
export const loginSchema = z.object({
  identifier: z.string().min(1).max(120).optional(),
  email: z.string().min(1).max(120).optional(),
  password: z.string().min(1).max(200),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  status = 400;
  code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Parse a JSON body against a schema. Returns a discriminated result — use
 * `parsed.ok`, or reply with `parsed.response` (a 400 with the first issue).
 */
export async function parseJson<S extends z.ZodType>(
  req: Request,
  schema: S
): Promise<
  | { ok: true; data: z.infer<S> }
  | { ok: false; response: NextResponse }
> {
  const raw = await req.json().catch(() => null);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request body", code: "VALIDATION_ERROR" },
        { status: 400 }
      ),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return {
      ok: false,
      response: NextResponse.json(
        { error: `${field}${first?.message ?? "Invalid request body"}`, code: "VALIDATION_ERROR" },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data as z.infer<S> };
}

/**
 * Sanitize a client-supplied filename for storage/display: basename only (no
 * path traversal), control characters stripped, safe fallback. The extension
 * is preserved so type checks keep working downstream.
 */
export function sanitizeFileName(raw: string | null | undefined, fallback = "upload.txt"): string {
  if (!raw) return fallback;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/^\.+/, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned.slice(0, 120) || fallback;
}
