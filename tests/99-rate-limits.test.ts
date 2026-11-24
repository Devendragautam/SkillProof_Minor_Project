/**
 * RATE LIMITING regression tests — expensive/sensitive endpoints cannot be
 * hammered. RUNS LAST (99-) because these probes exhaust per-IP/per-user
 * buckets that other tests may still need.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { post, get, seedCandidateUser, createAssessment, dealUntilCoding, prisma } from "./helpers";

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
});

describe("code execution rate limit (30/min per user)", () => {
  test("rapid run requests eventually hit 429", async () => {
    const { cookie } = await seedCandidateUser("RL Run", "rl-run@skillproof-test.local", "password-for-tests-1");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const coding = await dealUntilCoding(assessmentId, cookie);

    let saw429 = false;
    for (let i = 0; i < 40; i++) {
      const r = await post(
        "/api/run",
        { aqId: coding.aqId, code: "function x(){ return 1; } function solution(){ return 1; }", language: "javascript" },
        cookie
      );
      if (r.status === 429) {
        saw429 = true;
        break;
      }
      expect([200, 500]).toContain(r.status);
    }
    expect(saw429).toBe(true);
  }, 120_000);
});

describe("public certificate lookup rate limit (per IP)", () => {
  test("rapid anonymous lookups eventually hit 429", async () => {
    let saw429 = false;
    for (let i = 0; i < 45; i++) {
      const r = await get(`/api/certificates/SP-ZZZZ-ZZZZ`);
      if (r.status === 429) {
        saw429 = true;
        break;
      }
      expect([404, 200]).toContain(r.status);
    }
    expect(saw429).toBe(true);
  }, 120_000);
});

describe("login rate limit (10/min per IP)", () => {
  test("brute-force attempts are throttled with 429", async () => {
    let saw429 = false;
    for (let i = 0; i < 14; i++) {
      const r = await post("/api/auth/login", {
        identifier: `bruteforce-${i}@audit.local`,
        password: "wrong-password",
      });
      if (r.status === 429) {
        saw429 = true;
        break;
      }
      expect(r.status).toBe(401);
    }
    expect(saw429).toBe(true);
  });
});
