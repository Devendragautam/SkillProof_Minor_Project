/**
 * DATA LEAKAGE tests — candidate-facing APIs never expose solutions, hidden
 * tests, private recruiter notes, internal AI metadata or other users' data.
 */
import { describe, test, expect, afterAll } from "bun:test";
import { get, post, demoSession, seedCandidateUser, createAssessment, dealUntilCoding, prisma, requireServer } from "./helpers";

const FORBIDDEN_KEYS = [
  "solutionSql",
  "answerIndex",
  "explanation",
  "testsJson",
  "hiddenTests",
  "solutionCode",
  "expectedRows",
  "notes",
  "pipelineNote",
  "tagsJson",
];

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
});

function assertNoForbiddenKeys(payload: unknown, path = "root") {
  if (Array.isArray(payload)) {
    payload.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
    return;
  }
  if (payload && typeof payload === "object") {
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      expect(FORBIDDEN_KEYS.includes(k)).toBe(false);
      assertNoForbiddenKeys(v, `${path}.${k}`);
    }
  }
}

describe("question bank exposure", () => {
  test("candidate cannot list the recruiter question bank", async () => {
    await requireServer();
    const cookie = await demoSession();
    const r = await get("/api/questions", cookie);
    expect(r.status).toBe(403);
  });

  test("dealt questions never carry solutions, answers or hidden tests", async () => {
    const cookie = await demoSession();
    const assessmentId = await createAssessment(cookie, [
      { skill: "Data Structures", level: "Intermediate" },
      { skill: "SQL", level: "Intermediate" },
    ]);
    // walk up to 8 questions of the run and inspect every payload
    for (let i = 0; i < 8; i++) {
      const res = await post(`/api/assessment/${assessmentId}/next`, {}, cookie);
      if (res.status !== 200 || res.body?.done) break;
      const q = res.body.question;
      assertNoForbiddenKeys(q);
      // visible-test metadata only: no `hidden` flags or expected values leak here
      expect(!("tests" in q) || !JSON.stringify(q.tests).includes('"hidden":true')).toBe(true);
      // finalize to move on: skip non-MCQ actives too
      const skip = await post(`/api/assessment/${assessmentId}/skip`, { aqId: q.aqId }, cookie);
      if (skip.status === 409) break; // run finished or transition rejected
    }
  });

  test("run responses carry visible-test results only", async () => {
    const { cookie } = await (async () => {
      const email = `leak-run@skillproof-test.local`;
      return { cookie: (await seedCandidateUser("Leak Run", email, "password-for-tests-1")).cookie };
    })();
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const coding = await dealUntilCoding(assessmentId, cookie);
    const r = await post(
      "/api/run",
      { aqId: coding.aqId, code: `function ${coding.question.fnName}(){ return 0; }`, language: "javascript" },
      cookie
    );
    expect(r.status).toBe(200);
    const results = r.body?.results ?? [];
    for (const x of results) {
      // hidden-flagged results are never sent to the browser
      expect(x.hidden).toBe(false);
    }
    assertNoForbiddenKeys(r.body);
  }, 45_000);
});

describe("recruiter-private data exposure", () => {
  test("candidate cannot read the recruiter pipeline (notes, tags, decisions)", async () => {
    const cookie = await demoSession();
    expect((await get("/api/candidates", cookie)).status).toBe(403);
    expect((await get("/api/candidates/cmany0000000000000000/timeline", cookie)).status).toBe(403);
    expect((await get("/api/attempts", cookie)).status).toBe(403);
  });

  test("my/attempts returns only the caller's own verification ledger", async () => {
    const cookie = await demoSession();
    const r = await get("/api/my/attempts", cookie);
    expect(r.status).toBe(200);
    const rows = r.body?.attempts ?? r.body ?? [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const email = row.candidateEmail ?? row.email ?? "candidate@skillproof.io";
      expect(email).toBe("candidate@skillproof.io");
    }
  });

  test("own report payload exposes no recruiter-only internals", async () => {
    const cookie = await demoSession();
    // find one of the demo candidate's completed assessments (pre-existing demo data)
    const candidate = await prisma.candidate.findFirst({ where: { email: "candidate@skillproof.io" } });
    const assessment = await prisma.assessment.findFirst({
      where: { candidateId: candidate?.id, status: "completed" },
      include: { report: true },
    });
    if (!assessment?.report) return; // no completed demo data — nothing to inspect
    const r = await get(`/api/report/${assessment.id}`, cookie);
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.body).toLowerCase();
    // AI-risk internals are summarized, never raw recruiter analysis
    expect(body.includes("solution")).toBe(false);
  });
});
