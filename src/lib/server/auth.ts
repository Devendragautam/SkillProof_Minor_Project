import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/lib/server/audit";

/**
 * Session auth for SkillProof.
 *
 * - Passwords: scrypt (N=16384) with a per-user random salt → `salt:hex`.
 * - Sessions: HMAC-SHA256 signed token `userId.expiry.signature` in an
 *   httpOnly cookie. Stateless — any server process can verify it.
 * - Roles: "recruiter" unlocks the recruiter dashboard + mutating APIs;
 *   "candidate" attaches assessment attempts to a durable identity.
 *
 * Session secret policy (Phase-1 hardening):
 *   - SESSION_SECRET env var is the source of truth; it is NEVER derived from
 *     DATABASE_URL, usernames or any other predictable application value.
 *   - If SESSION_SECRET is unset, a cryptographically random secret is
 *     generated ONCE and persisted to db/.session-secret (0600) so sessions
 *     survive restarts without any predictable derivation. This also applies
 *     in production so zero-config single-container deploys (one-click space
 *     deploys, demo instances) boot instead of crashing — the secret is still
 *     never predictable, only container-local. Multi-instance production
 *     deployments MUST set a shared SESSION_SECRET (see DEPLOY.md).
 *   - Account provisioning policy:
 *   - The recruiter account is provisioned from env vars (see provisioned
 *     config below) — never hard-coded in source.
 *   - Demo accounts (demo candidate, demo credentials autofill) exist ONLY
 *     when explicitly enabled via DEMO_MODE=1.
 *   - Passwords are written at account creation; an existing account's
 *     password is only re-hashed when the operator explicitly sets the
 *     corresponding env var (never silently reset on boot).
 */

export const SESSION_COOKIE = "sp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const DEV_SECRET_FILE = path.join(process.cwd(), "db", ".session-secret");

let cachedSecret: string | null = null;

function randomSecret(): string {
  return randomBytes(48).toString("base64url"); // 384-bit
}

/**
 * Resolve the session signing secret.
 * 1. SESSION_SECRET env var (set a shared one for multi-instance production).
 * 2. Fallback: persisted random secret in db/.session-secret (created on
 *    first boot, 0600). Nothing predictable is ever mixed in; in production
 *    a loud warning asks operators to configure SESSION_SECRET.
 */
function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] SESSION_SECRET is not configured — using a generated secret " +
        "persisted to db/.session-secret. Sessions are secure but container-local: " +
        "they do not survive redeployments and are NOT shared across instances. " +
        "Multi-instance production deployments must set SESSION_SECRET (see DEPLOY.md)."
    );
  }

  // persist a random secret so cookies survive restarts
  try {
    const existing = fs.readFileSync(DEV_SECRET_FILE, "utf8").trim();
    if (existing.length >= 32) {
      cachedSecret = existing;
      return cachedSecret;
    }
  } catch {
    // first boot — create below
  }
  const generated = randomSecret();
  try {
    fs.mkdirSync(path.dirname(DEV_SECRET_FILE), { recursive: true });
    fs.writeFileSync(DEV_SECRET_FILE, generated + "\n", { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    // non-fatal: fall back to per-boot secret (users just re-login)
    console.warn("[auth] could not persist dev session secret:", err instanceof Error ? err.message : err);
  }
  cachedSecret = generated;
  return cachedSecret;
}

// ─── Passwords ───────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(hex, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ─── Session tokens ──────────────────────────────────────────────────────────

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const payload = `${userId}.${expires}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return userId;
}

// ─── Session user ────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "recruiter" | "candidate";
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const userId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
    if (!userId) return null;
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "recruiter" ? "recruiter" : "candidate",
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // secure-by-default: cookies are HTTPS-only in production. The sandbox
    // gateway serves plain http, so demo/dev deployments may opt out via
    // COOKIE_INSECURE=1 — production never ships that flag.
    secure: isProduction && process.env.COOKIE_INSECURE !== "1",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

// ─── API guards ──────────────────────────────────────────────────────────────

export interface GuardFailure {
  ok: false;
  response: Response;
}

export interface GuardSuccess {
  ok: true;
  user: SessionUser;
}

/** Require any signed-in user. */
export async function requireUser(): Promise<GuardSuccess | GuardFailure> {
  const user = await getSessionUser();
  if (!user) {
    audit({ event: "authz.denied", outcome: "denied", detail: { reason: "unauthenticated", required: "user" } });
    return {
      ok: false,
      response: Response.json(
        { error: "Sign in required", code: "AUTH_REQUIRED" },
        { status: 401 }
      ),
    };
  }
  return { ok: true, user };
}

/** Require a signed-in candidate. */
export async function requireCandidate(): Promise<GuardSuccess | GuardFailure> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (guard.user.role !== "candidate") {
    audit({
      event: "authz.denied",
      outcome: "denied",
      actor: { id: guard.user.id, email: guard.user.email, role: guard.user.role },
      detail: { reason: "role", required: "candidate" },
    });
    return {
      ok: false,
      response: Response.json(
        { error: "Candidate access required", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  return guard;
}

/** Require a signed-in recruiter (mutating recruiter APIs). */
export async function requireRecruiter(): Promise<GuardSuccess | GuardFailure> {
  const user = await getSessionUser();
  if (!user) {
    audit({ event: "authz.denied", outcome: "denied", detail: { reason: "unauthenticated", required: "recruiter" } });
    return {
      ok: false,
      response: Response.json(
        { error: "Sign in required", code: "AUTH_REQUIRED" },
        { status: 401 }
      ),
    };
  }
  if (user.role !== "recruiter") {
    audit({
      event: "authz.denied",
      outcome: "denied",
      actor: { id: user.id, email: user.email, role: user.role },
      detail: { reason: "role", required: "recruiter" },
    });
    return {
      ok: false,
      response: Response.json(
        { error: "Recruiter access required", code: "FORBIDDEN" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, user };
}

// ─── Account provisioning (env-driven, demo-gated) ──────────────────────────

export interface ProvisionedAccount {
  name: string;
  email: string;
  password: string;
  role: "recruiter" | "candidate";
}

/**
 * The platform has EXACTLY ONE recruiter account (owner-provisioned).
 * Credentials come from the environment — no password is hard-coded here.
 * Recruiters cannot self-register; any other recruiter account is removed
 * on boot to preserve the invariant.
 */
export function recruiterAccount(): ProvisionedAccount {
  return {
    name: process.env.SKILLPROOF_RECRUITER_NAME?.trim() || "Platform Recruiter",
    email:
      process.env.SKILLPROOF_RECRUITER_EMAIL?.trim().toLowerCase() ||
      "recruiter@skillproof.local",
    password: process.env.SKILLPROOF_RECRUITER_PASSWORD || "",
    role: "recruiter",
  };
}

/** Demo candidate — only provisioned/autofilled when explicitly configured.
 *  No default password: if SKILLPROOF_DEMO_CANDIDATE_PASSWORD is unset the
 *  demo account is simply not provisioned. */
export function demoCandidateAccount(): ProvisionedAccount | null {
  if (process.env.DEMO_MODE !== "1") return null;
  const password = process.env.SKILLPROOF_DEMO_CANDIDATE_PASSWORD?.trim();
  if (!password) return null;
  return {
    name: process.env.SKILLPROOF_DEMO_CANDIDATE_NAME?.trim() || "Dev Sharma",
    email:
      process.env.SKILLPROOF_DEMO_CANDIDATE_EMAIL?.trim().toLowerCase() ||
      "candidate@skillproof.io",
    password,
    role: "candidate",
  };
}

/** Demo mode gate — also read by the client via NEXT_PUBLIC_DEMO_MODE. */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * Idempotently ensure the provisioned accounts exist.
 *
 * - Recruiter: created from env on first boot. The password is re-hashed
 *   ONLY when SKILLPROOF_RECRUITER_PASSWORD is explicitly set in the env
 *   (deliberate operator rotation) — never silently reset on every startup.
 * - Demo candidate: created on first boot when DEMO_MODE=1; the password is
 *   only re-hashed when SKILLPROOF_DEMO_CANDIDATE_PASSWORD is explicitly set.
 * - Enforces the one-recruiter invariant: any OTHER recruiter account is
 *   deleted.
 */
export async function ensureProvisionedUsers(): Promise<void> {
  const recruiter = recruiterAccount();
  if (recruiter.password) {
    const existing = await db.user.findUnique({ where: { email: recruiter.email } });
    if (!existing) {
      await db.user.create({
        data: {
          name: recruiter.name,
          email: recruiter.email,
          passwordHash: hashPassword(recruiter.password),
          role: recruiter.role,
        },
      });
    } else {
      // keep the display name in sync; rotate the password ONLY on explicit
      // operator rotation (env var set) — never silently on every boot
      if (existing.name !== recruiter.name) {
        await db.user.update({ where: { id: existing.id }, data: { name: recruiter.name } });
      }
      if (
        process.env.SKILLPROOF_RECRUITER_PASSWORD &&
        !verifyPassword(recruiter.password, existing.passwordHash)
      ) {
        await db.user.update({
          where: { id: existing.id },
          data: { passwordHash: hashPassword(recruiter.password) },
        });
      }
    }
  }

  // remove any other recruiter accounts (recruiters cannot self-register) —
  // ONLY when the operator explicitly configured the provisioned email.
  // If SKILLPROOF_RECRUITER_EMAIL is unset, the fallback default email must
  // never be treated as authoritative: deleting against it would silently
  // wipe the real recruiter account whenever .env is missing/reset (e.g. a
  // bare `bun scripts/seed.ts` that did not load .env).
  if (process.env.SKILLPROOF_RECRUITER_EMAIL?.trim()) {
    const recruiters = await db.user.findMany({ where: { role: "recruiter" } });
    const strays = recruiters.filter((u) => u.email !== recruiterAccount().email);
    if (strays.length > 0) {
      await db.user.deleteMany({ where: { id: { in: strays.map((u) => u.id) } } });
    }
  }

  // demo candidate (demo mode only)
  const demo = demoCandidateAccount();
  if (demo) {
    const existing = await db.user.findUnique({ where: { email: demo.email } });
    if (!existing) {
      await db.user.create({
        data: {
          name: demo.name,
          email: demo.email,
          passwordHash: hashPassword(demo.password),
          role: demo.role,
        },
      });
    } else if (
      process.env.SKILLPROOF_DEMO_CANDIDATE_PASSWORD &&
      !verifyPassword(demo.password, existing.passwordHash)
    ) {
      await db.user.update({
        where: { id: existing.id },
        data: { passwordHash: hashPassword(demo.password) },
      });
    }
  }
}

/** Back-compat alias used by seed.ts. */
export const ensureDemoUsers = ensureProvisionedUsers;
