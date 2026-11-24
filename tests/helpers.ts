/**
 * Shared helpers for the SkillProof HTTP-level security/behavior test suite.
 *
 * Prerequisite: the dev server must be running on :3000 (the suite exercises
 * the REAL app — auth, guards, sandbox, rate limits — over HTTP, exactly like
 * the standing security-audit gate). DB-level assertions open the same SQLite
 * database the server uses (read/write for controlled clock manipulation).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, scryptSync } from "node:crypto";

export const BASE = "http://localhost:3000";

export const prisma = new PrismaClient();

// ── credentials (resolved from the environment / .env — never re-hashed here)
function envValue(key: string): string | undefined {
  const direct = process.env[key];
  if (direct) return direct;
  try {
    const envFile = readFileSync(".env", "utf8");
    const line = envFile.split("\n").find((l: string) => l.startsWith(key + "="));
    if (!line) return undefined;
    const raw = line.slice(key.length + 1).trim();
    const unquoted = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    return unquoted;
  } catch {
    return undefined;
  }
}

export const RECRUITER = {
  identifier: envValue("SKILLPROOF_RECRUITER_EMAIL") ?? "recruiter@skillproof.local",
  password: envValue("SKILLPROOF_RECRUITER_PASSWORD") ?? "",
  name: envValue("SKILLPROOF_RECRUITER_NAME") ?? "Platform Recruiter",
};

export const DEMO_CANDIDATE = {
  identifier: envValue("SKILLPROOF_DEMO_CANDIDATE_EMAIL") ?? "candidate@skillproof.io",
  password: envValue("SKILLPROOF_DEMO_CANDIDATE_PASSWORD") ?? "",
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
}

export async function api(
  path: string,
  init: RequestInit = {},
  cookie?: string
): Promise<ApiResponse> {
  // dev-server keep-alive connections occasionally reset under rapid loops —
  // retry network faults (not HTTP errors) with a short backoff
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await apiOnce(path, init, cookie);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function apiOnce(
  path: string,
  init: RequestInit = {},
  cookie?: string
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  // FormData bodies must negotiate their own multipart boundary header
  if (!(typeof FormData !== "undefined" && init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init.headers as any) } });
  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 500);
  }
  return { status: res.status, body, headers: res.headers };
}

export function post(path: string, data: unknown, cookie?: string): Promise<ApiResponse> {
  return api(path, { method: "POST", body: JSON.stringify(data) }, cookie);
}

export function get(path: string, cookie?: string): Promise<ApiResponse> {
  return api(path, { method: "GET" }, cookie);
}

/** Login and return the session cookie (opaque `sp_session=…` string). */
export async function login(identifier: string, password: string): Promise<{ status: number; cookie: string; user: any }> {
  const res = await post("/api/auth/login", { identifier, password });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  return { status: res.status, cookie, user: res.body?.user };
}

export async function loginRecruiter() {
  const r = await login(RECRUITER.identifier, RECRUITER.password);
  if (r.status === 429) return r; // throttled — callers skip their assertions
  if (r.status !== 200) throw new Error("recruiter login failed — check .env credentials");
  return r;
}

export async function loginDemoCandidate() {
  const r = await login(DEMO_CANDIDATE.identifier, DEMO_CANDIDATE.password);
  if (r.status === 429) return r;
  if (r.status !== 200) throw new Error("demo candidate login failed — is DEMO_MODE enabled?");
  return r;
}

// ── flow helpers ─────────────────────────────────────────────────────────────

export interface DealtQuestion {
  aqId: string;
  question: {
    aqId: string;
    externalId: string;
    category: string;
    fnName?: string;
    languages?: string[];
    visibleTestCount: number;
    [k: string]: unknown;
  };
}

/** Deal the next question; returns the raw response on 409/429, null when done. */
export async function dealNext(assessmentId: string, cookie: string, body: Record<string, unknown> = {}): Promise<DealtQuestion | null | ApiResponse> {
  const res = await post(`/api/assessment/${assessmentId}/next`, body, cookie);
  if (res.status === 409 || res.status === 429) return res;
  if (res.body?.done) return null;
  if (res.status !== 200 || !res.body?.question) throw new Error(`next failed: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  return { aqId: res.body.question.aqId, question: res.body.question };
}

function isDealt(x: DealtQuestion | null | ApiResponse): x is DealtQuestion {
  return !!x && typeof (x as DealtQuestion).aqId === "string";
}

/**
 * Deal questions until a CODING question with an fnName is active (the run API
 * only executes coding questions). Rides the real adaptive dealing engine.
 */
export async function dealUntilCoding(assessmentId: string, cookie: string, maxDeals = 14): Promise<DealtQuestion> {
  for (let i = 0; i < maxDeals; i++) {
    const dealt = await dealNext(assessmentId, cookie);
    if (!isDealt(dealt)) throw new Error("no coding question available in run");
    if ((dealt.question.category === "coding" || dealt.question.category === "debugging") && dealt.question.fnName) {
      return dealt;
    }
    // finalize non-coding actives so the engine can deal the next one
    await post(`/api/assessment/${assessmentId}/skip`, { aqId: dealt.aqId }, cookie);
  }
  throw new Error("exhausted deals without reaching a coding question");
}

export async function createAssessment(cookie: string, skills: Array<{ skill: string; level: string }>): Promise<string> {
  const res = await post("/api/assessment", { skills }, cookie);
  if (res.status !== 200) throw new Error(`assessment create failed: ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
  return res.body.assessmentId as string;
}

/** Register a throwaway candidate account (rate-limited — use sparingly). */
export async function registerCandidate(name: string, email: string, password: string) {
  const res = await post("/api/auth/register", { name, email, password, role: "candidate" });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, cookie: setCookie.split(";")[0], body: res.body };
}

// ── session minting (dev-only fast path that bypasses the login rate limit) ──
// The dev server persists a random signing secret to db/.session-secret (0600).
// Tests sign tokens exactly like auth.ts does, so rate-limit-sensitive files
// never burn the shared per-IP login budget. The login ENDPOINT itself is
// exercised (with its limits) in 01-auth / 99-rate-limits.

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function devSessionSecret(): string {
  // mirror the server's resolution order: SESSION_SECRET env (incl. .env via
  // bun) wins; the persisted dev fallback file comes second
  const fromEnv = envValue("SESSION_SECRET");
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  return readFileSync("db/.session-secret", "utf8").trim();
}

export function hashPasswordTest(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

/** Mint a valid session cookie for a user id, exactly as the server would. */
export function mintSession(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  const sig = createHmac("sha256", devSessionSecret()).update(payload).digest("base64url");
  return `sp_session=${payload}.${sig}`;
}

/** Create a candidate account + profile directly in the DB (bypasses register rate limit). */
export async function seedCandidateUser(name: string, email: string, password: string): Promise<{ userId: string; cookie: string }> {
  const user = await prisma.user.create({
    data: { name, email, passwordHash: hashPasswordTest(password), role: "candidate" },
  });
  return { userId: user.id, cookie: mintSession(user.id) };
}

/** Minted session for an existing account by email — no login endpoint call. */
export async function sessionFor(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no user ${email} — is it provisioned?`);
  return mintSession(user.id);
}

export const demoSession = () => sessionFor(DEMO_CANDIDATE.identifier);
export const recruiterSession = () => sessionFor(RECRUITER.identifier);

/** Remove a test user's candidate rows (cascade: assessments→questions→submissions→reports→certificates). */
export async function cleanupCandidateData(email: string): Promise<void> {
  await prisma.candidate.deleteMany({ where: { email } });
  await prisma.user.deleteMany({ where: { email } });
}

/** Wait for the server to be reachable; throw if not. */
export async function requireServer(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(BASE + "/api/auth/me");
      if (res.status === 401 || res.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("dev server not reachable on :3000 — start it (bun run dev) before npm test");
}
