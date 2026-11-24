/**
 * SECURITY REGRESSION tests — every fixed vulnerability stays fixed:
 * share-token report access, submission/explain authorization, share-token
 * entropy, validation gates, upload hardening, timer authority.
 */
import { describe, test, expect, afterAll } from "bun:test";
import {
  get,
  post,
  api,
  demoSession,
  seedCandidateUser,
  createAssessment,
  dealUntilCoding,
  dealNext,
  prisma,
  requireServer,
} from "./helpers";

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
});

describe("report share-token regime", () => {
  test("a random assessment id grants NOTHING (no id-based report access)", async () => {
    await requireServer();
    // valid-shaped but nonexistent ids — anonymous
    expect((await get("/api/report/cmn0ttherealassessment000000")).status).toBe(404);
    // a REAL completed assessment id, anonymous → 401 (must not disclose existence)
    const completed = await prisma.assessment.findFirst({
      where: { status: "completed", report: { isNot: null } },
      select: { id: true },
    });
    if (completed) {
      expect((await get(`/api/report/${completed.id}`)).status).toBe(401);
      // wrong token → 401
      expect(
        (await get(`/api/report/${completed.id}?t=definitely-not-the-token`)).status
      ).toBe(401);
    }
  });

  test("share tokens are high-entropy random secrets, never the assessment id", async () => {
    const cookie = await demoSession();
    const candidate = await prisma.candidate.findFirst({ where: { email: "candidate@skillproof.io" } });
    const assessment = await prisma.assessment.findFirst({
      where: { candidateId: candidate?.id, status: "completed", report: { isNot: null } },
      include: { report: true },
    });
    if (!assessment) return;
    const r = await get(`/api/report/${assessment.id}`, cookie);
    expect(r.status).toBe(200);
    const token = r.body?.shareToken ?? assessment.report?.shareToken;
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThanOrEqual(24); // 192-bit → ~32 chars base64url
    expect(token).not.toBe(assessment.id);
    // the token actually works for anonymous verification
    expect((await get(`/api/report/${assessment.id}?t=${token}`)).status).toBe(200);
  });
});

describe("submission history & explain authorization", () => {
  test("versions endpoint requires authentication", async () => {
    const submission = await prisma.submission.findFirst({ select: { id: true } });
    if (!submission) return;
    expect((await get(`/api/submissions/${submission.id}/versions`)).status).toBe(401);
  });

  test("explain endpoint requires authentication and ownership", async () => {
    const submission = await prisma.submission.findFirst({
      where: { explanationAnswers: { none: {} } },
      include: { assessmentQuestion: { include: { assessment: { include: { candidate: true } } } } },
    });
    if (!submission) return;
    // anonymous
    const anon = await post(`/api/assessment/${submission.assessmentQuestion.assessmentId}/explain`, {
      submissionId: submission.id,
      answers: [{ q: "why", answer: "because" }],
    });
    expect(anon.status).toBe(401);
    // a foreign candidate
    const { cookie: foreign } = await seedCandidateUser("Explain Foreign", "explain-foreign@skillproof-test.local", "password-for-tests-1");
    const foreignR = await post(
      `/api/assessment/${submission.assessmentQuestion.assessmentId}/explain`,
      { submissionId: submission.id, answers: [{ q: "why", answer: "because" }] },
      foreign
    );
    expect([403, 404]).toContain(foreignR.status);
    if (submission.assessmentQuestion.assessment.candidate.email !== "candidate@skillproof.io") {
      // owner path with the demo session is irrelevant here — skip
      return;
    }
    const ownerCookie = await demoSession();
    const owner = await post(
      `/api/assessment/${submission.assessmentQuestion.assessmentId}/explain`,
      { submissionId: submission.id, answers: [{ q: "why", answer: "because" }] },
      ownerCookie
    );
    expect([200, 409]).toContain(owner.status); // 409 if the run is not live
  });
});

describe("input validation gates", () => {
  test("oversized code is hard-rejected", async () => {
    const cookie = await demoSession();
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const first = await dealNext(assessmentId, cookie);
    const aqId = (first as any).aqId as string;
    expect(
      (await post("/api/run", { aqId, code: "x".repeat(60_001), language: "javascript" }, cookie)).status
    ).toBe(400);
  });

  test("malformed ids and payloads are rejected with 400", async () => {
    const cookie = await demoSession();
    expect(
      (await post("/api/run", { aqId: "bad id with spaces and ../", code: "x" }, cookie)).status
    ).toBe(400);
    expect(
      (await post("/api/run", { aqId: "cvalidlookingid123456", code: 42 }, cookie)).status
    ).toBe(400);
  });

  test("error responses never leak internals", async () => {
    const r = await post("/api/run", { aqId: "cnotarealidaaaaaaaaaaaaa", code: "x" }, await demoSession());
    const body = JSON.stringify(r.body).toLowerCase();
    for (const marker of ["stack", "prisma", "sqlite", "select ", "error:", "at /home"]) {
      expect(body.includes(marker)).toBe(false);
    }
  });
});

describe("upload hardening", () => {
  test("oversized resume uploads are rejected (413)", async () => {
    const cookie = await demoSession();
    const big = new FormData();
    big.append("file", new Blob([Buffer.alloc(5 * 1024 * 1024, "a")], { type: "text/plain" }), "big.txt");
    const r = await api("/api/resume/extract", { method: "POST", body: big }, cookie);
    expect(r.status).toBe(413);
  });

  test("fake PDFs are rejected by magic-byte sniffing (415)", async () => {
    const cookie = await demoSession();
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("NOT-A-PDF just text pretending")], { type: "application/pdf" }), "fake.pdf");
    const r = await api("/api/resume/extract", { method: "POST", body: form }, cookie);
    expect(r.status).toBe(415);
  });

  test("path-traversal filenames are sanitized server-side", async () => {
    const cookie = await demoSession();
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("John Doe\nSenior Backend Engineer\nFive years of Node.js")], { type: "text/plain" }), "../../etc/evil.txt");
    const r = await api("/api/resume/extract", { method: "POST", body: form }, cookie);
    if (r.status === 200) {
      const echoed = String(r.body?.fileName ?? "");
      expect(echoed.includes("/")).toBe(false);
      expect(echoed.includes("..")).toBe(false);
    } else {
      expect([400, 415]).toContain(r.status);
    }
  });
});

describe("timer authority regression", () => {
  test("deadline rewind finalizes the question server-side even for runs", async () => {
    const { cookie } = await seedCandidateUser("Timer Reg", "timer-reg@skillproof-test.local", "password-for-tests-1");
    const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const coding = await dealUntilCoding(assessmentId, cookie);

    // rewind deadline, then attempt a RUN (not a submit) — expired questions are done
    await prisma.assessmentQuestion.update({
      where: { id: coding.aqId },
      data: { deadlineAt: new Date(Date.now() - 30 * 60 * 1000) },
    });
    const r = await post(
      "/api/run",
      { aqId: coding.aqId, code: "function x(){ return 1; } function solution(){ return 1; }", language: "javascript" },
      cookie
    );
    // the run may execute (it is not a grading event) but the SUBMIT path is dead
    const s = await post(
      `/api/assessment/${assessmentId}/submit`,
      { aqId: coding.aqId, code: "function solution(){ return 1; }", language: "javascript" },
      cookie
    );
    expect(s.status).toBe(409);
    void r;
  }, 45_000);
});
