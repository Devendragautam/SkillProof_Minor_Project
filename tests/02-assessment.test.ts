/**
 * ASSESSMENT INTEGRITY tests — server-authoritative behavior:
 * flow (next/skip/goto/hint/submit/complete), single-active invariant under
 * concurrency, idempotent completion, state-machine enforcement, forged-field
 * and timer manipulation resistance.
 */
import { describe, test, expect, afterAll } from "bun:test";
import {
  post,
  get,
  demoSession,
  seedCandidateUser,
  createAssessment,
  dealUntilCoding,
  dealNext,
  prisma,
  requireServer,
} from "./helpers";

const createdAssessmentIds: string[] = [];

/** Seeded throwaway candidate (own rate-limit bucket, no register-endpoint cost). */
async function seededCookie(tag: string) {
  const email = `integrity-${tag}@skillproof-test.local`;
  return seedCandidateUser("Integrity " + tag, email, "password-for-tests-1");
}

afterAll(async () => {
  // cascade removes assessments/questions/submissions/reports
  for (const id of createdAssessmentIds) {
    await prisma.assessment.delete({ where: { id } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
});

describe("assessment flow", () => {
  test("next deals a question with a server-seeded countdown", async () => {
    await requireServer();
    const cookie = await demoSession();
    const assessmentId = await createAssessment(cookie, [
      { skill: "Data Structures", level: "Intermediate" },
    ]);
    createdAssessmentIds.push(assessmentId);

    const res = await post(`/api/assessment/${assessmentId}/next`, {}, cookie);
    expect(res.status).toBe(200);
    const q = res.body?.question;
    expect(q?.aqId).toBeTruthy();
    expect(typeof q?.remainingSec).toBe("number");
    expect(q.remainingSec).toBeGreaterThan(0);
    expect(q.remainingSec).toBeLessThanOrEqual(q.timeLimitSec);

    // hint on the active question succeeds
    const hint = await post(`/api/assessment/${assessmentId}/hint`, { aqId: q.aqId }, cookie);
    expect(hint.status).toBe(200);

    // the palette reflects the hint usage
    const snapshot = await get(`/api/assessment/${assessmentId}`, cookie);
    expect(snapshot.status).toBe(200);
  });
});

describe("concurrency: single active question invariant", () => {
  test("six parallel next requests converge on ONE active question", async () => {
    const { cookie } = await seededCookie("concurrency");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => post(`/api/assessment/${assessmentId}/next`, {}, cookie))
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(5);
    const distinctActive = new Set(ok.map((r) => r.body?.question?.aqId).filter(Boolean));
    expect(distinctActive.size).toBe(1);
    // DB invariant: exactly one active-flag row for this assessment
    const activeRows = await prisma.assessmentQuestion.findMany({
      where: { assessmentId, activeFlag: { not: null } },
    });
    expect(activeRows.length).toBe(1);
  });
});

describe("state machine", () => {
  test("skip → goto revives; illegal transitions are 409", async () => {
    const { cookie } = await seededCookie("state");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);

    const first = await dealNext(assessmentId, cookie);
    expect(first && "aqId" in first).toBe(true);
    const aqId = (first as any).aqId!;

    // goto on the CURRENT question is illegal
    expect((await post(`/api/assessment/${assessmentId}/goto`, { aqId }, cookie)).status).toBe(409);

    // skip it, then double-skip is illegal, then goto revives it
    expect((await post(`/api/assessment/${assessmentId}/skip`, { aqId }, cookie)).status).toBe(200);
    expect((await post(`/api/assessment/${assessmentId}/skip`, { aqId }, cookie)).status).toBe(409);
    expect((await post(`/api/assessment/${assessmentId}/goto`, { aqId }, cookie)).status).toBe(200);
    // hint on a terminal (skipped) question is 409
    await post(`/api/assessment/${assessmentId}/skip`, { aqId }, cookie);
    expect((await post(`/api/assessment/${assessmentId}/hint`, { aqId }, cookie)).status).toBe(409);
  });
});

describe("submit integrity", () => {
  test("forged score fields and timeSpentSec are ignored; double submit is 409", async () => {
    const { cookie } = await seededCookie("forge");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);
    const coding = await dealUntilCoding(assessmentId, cookie);

    // a WRONG solution + forged success fields + absurd timer value
    const r = await post(
      `/api/assessment/${assessmentId}/submit`,
      {
        aqId: coding.aqId,
        code: "function solution(){ return 'forged'; }",
        language: "javascript",
        timeSpentSec: 999_999,
        score: 100,
        passed: true,
        percentage: 100,
        status: "solved",
        testResults: [{ index: 0, pass: true, hidden: false, ms: 1, inputPreview: "", expectedPreview: "", actualPreview: "" }],
      },
      cookie
    );
    expect(r.status).toBe(200);

    // server stored its own grade — NOT the forged score
    const aq = await prisma.assessmentQuestion.findUnique({ where: { id: coding.aqId } });
    expect(aq?.score ?? 0).toBeLessThan(100);
    // server-derived elapsed time — the lying browser value never lands
    expect(aq?.timeSpentSec ?? 0).toBeLessThan(60);
    // exactly one graded submission
    expect(await prisma.submission.count({ where: { assessmentQuestionId: coding.aqId } })).toBe(1);

    // double submit → 409
    const again = await post(
      `/api/assessment/${assessmentId}/submit`,
      { aqId: coding.aqId, code: "function solution(){ return 'x'; }", language: "javascript" },
      cookie
    );
    expect(again.status).toBe(409);
  });

  test("server-rewound deadline rejects the submission (QUESTION_EXPIRED)", async () => {
    const { cookie } = await seededCookie("deadline");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);
    const coding = await dealUntilCoding(assessmentId, cookie);

    // rewind the SERVER deadline 20 minutes into the past (beyond the grace window)
    await prisma.assessmentQuestion.update({
      where: { id: coding.aqId },
      data: { deadlineAt: new Date(Date.now() - 20 * 60 * 1000) },
    });

    const r = await post(
      `/api/assessment/${assessmentId}/submit`,
      { aqId: coding.aqId, code: "function solution(){ return 1; }", language: "javascript" },
      cookie
    );
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toMatch(/EXPIRED|timeout/i);

    // the question was finalized server-side as timeout/score-0 — the run never sticks
    const aq = await prisma.assessmentQuestion.findUnique({ where: { id: coding.aqId } });
    expect(aq?.status).toBe("timeout");
    expect(aq?.score).toBe(0);
  });
});

describe("completion", () => {
  test("double completion is idempotent; post-completion mutations are 409", async () => {
    const { cookie } = await seededCookie("complete1");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);
    const dealt = await dealNext(assessmentId, cookie);
    const realAqId = (dealt as any).aqId as string;

    const c1 = await post(`/api/assessment/${assessmentId}/complete`, {}, cookie);
    const c2 = await post(`/api/assessment/${assessmentId}/complete`, {}, cookie);
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c1.body?.reportId).toBeTruthy();
    expect(c1.body?.reportId).toBe(c2.body?.reportId);
    expect(await prisma.report.count({ where: { assessmentId } })).toBe(1);

    // completed is terminal: next and submit are rejected
    expect((await post(`/api/assessment/${assessmentId}/next`, {}, cookie)).status).toBe(409);
    expect(
      (await post(`/api/assessment/${assessmentId}/submit`, { aqId: realAqId, code: "function x(){ return 1; }" }, cookie)).status
    ).toBe(409);
    // a foreign aqId stays contained (404) even on a completed run
    expect(
      (await post(`/api/assessment/${assessmentId}/submit`, { aqId: "cmany0000000000000000", code: "x" }, cookie)).status
    ).toBe(404);
  });

  test("three parallel completions produce exactly one report", async () => {
    const { cookie } = await seededCookie("complete2");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    createdAssessmentIds.push(assessmentId);
    await dealNext(assessmentId, cookie);

    const results = await Promise.all([
      post(`/api/assessment/${assessmentId}/complete`, {}, cookie),
      post(`/api/assessment/${assessmentId}/complete`, {}, cookie),
      post(`/api/assessment/${assessmentId}/complete`, {}, cookie),
    ]);
    for (const r of results) expect(r.status).toBe(200);
    expect(new Set(results.map((r) => r.body?.reportId)).size).toBe(1);
    expect(await prisma.report.count({ where: { assessmentId } })).toBe(1);
  });
});
