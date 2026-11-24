/**
 * AUTHORIZATION boundary tests — candidates cannot reach each other's
 * resources, IDs cannot cross resource boundaries, invalid IDs stay contained.
 */
import { describe, test, expect, afterAll } from "bun:test";
import {
  get,
  post,
  demoSession,
  seedCandidateUser,
  createAssessment,
  dealUntilCoding,
  dealNext,
  prisma,
  requireServer,
  recruiterSession,
} from "./helpers";

async function seeded(tag: string) {
  const email = `authz-${tag}@skillproof-test.local`;
  const { userId, cookie } = await seedCandidateUser("Authz " + tag, email, "password-for-tests-1");
  return { email, userId, cookie };
}

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
});

describe("cross-candidate boundaries", () => {
  test("candidate B cannot reach candidate A's assessment, submissions or report", async () => {
    await requireServer();
    const a = await seeded("a");
    const b = await seeded("b");

    // A builds a real run with a coding question and a submission
    const assessmentA = await createAssessment(a.cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const coding = await dealUntilCoding(assessmentA, a.cookie);
    const submit = await post(
      `/api/assessment/${assessmentA}/submit`,
      { aqId: coding.aqId, code: "function solution(a,b){ return a; }", language: "javascript" },
      a.cookie
    );
    expect(submit.status).toBe(200);
    const submissionId = (await prisma.submission.findFirst({ where: { assessmentQuestionId: coding.aqId } }))?.id;

    // finalize A's run so a real report exists for the report probe
    expect((await post(`/api/assessment/${assessmentA}/complete`, {}, a.cookie)).status).toBe(200);

    // B probes A's resources
    expect((await get(`/api/assessment/${assessmentA}`, b.cookie)).status).toBe(403);
    expect((await post(`/api/assessment/${assessmentA}/next`, {}, b.cookie)).status).toBe(403);
    expect(
      (await post(`/api/assessment/${assessmentA}/submit`, { aqId: coding.aqId, code: "x" }, b.cookie)).status
    ).toBe(403);
    expect((await post(`/api/assessment/${assessmentA}/hint`, { aqId: coding.aqId }, b.cookie)).status).toBe(403);
    expect((await post(`/api/assessment/${assessmentA}/goto`, { aqId: coding.aqId }, b.cookie)).status).toBe(403);
    expect((await post(`/api/assessment/${assessmentA}/skip`, { aqId: coding.aqId }, b.cookie)).status).toBe(403);
    expect((await post(`/api/assessment/${assessmentA}/complete`, {}, b.cookie)).status).toBe(403);
    expect((await get(`/api/report/${assessmentA}`, b.cookie)).status).toBe(403);
    if (submissionId) {
      expect((await get(`/api/submissions/${submissionId}/versions`, b.cookie)).status).toBe(403);
      const explain = await post(
        `/api/assessment/${assessmentA}/explain`,
        { submissionId, answers: [{ q: "why?", answer: "because" }] },
        b.cookie
      );
      expect([403, 404]).toContain(explain.status);
    }
    // run API with A's aqId but B's session → 403/404 (ownership derived from the aq)
    expect((await post(`/api/run`, { aqId: coding.aqId, code: "x", language: "javascript" }, b.cookie)).status).toBe(403);

    // the recruiter CAN see A's run (legitimate oversight)
    const rec = await recruiterSession();
    expect((await get(`/api/assessment/${assessmentA}`, rec)).status).toBe(200);

    // A still sees everything fine
    expect((await get(`/api/assessment/${assessmentA}`, a.cookie)).status).toBe(200);
  });

  test("IDs cannot cross resource boundaries (aqId from another assessment)", async () => {
    const owner = await seeded("owner");
    const other = await seeded("other");

    const assessmentOwner = await createAssessment(owner.cookie, [{ skill: "Data Structures", level: "Basic" }]);
    const first = await dealNext(assessmentOwner, owner.cookie);
    const ownerAqId = (first as any).aqId!;

    const assessmentOther = await createAssessment(other.cookie, [{ skill: "Data Structures", level: "Basic" }]);
    await dealNext(assessmentOther, other.cookie);

    // other tries to act on owner's aqId within their OWN assessment id —
    // mismatched aqIds are 404 (existence not disclosed) or 403
    expect(
      (await post(`/api/assessment/${assessmentOther}/submit`, { aqId: ownerAqId, code: "x" }, other.cookie)).status
    ).toBe(404);
    expect(
      (await post(`/api/assessment/${assessmentOther}/skip`, { aqId: ownerAqId }, other.cookie)).status
    ).toBe(404);
    // and the run API derives the assessment from the aq — mismatched session → 403
    expect(
      (await post(`/api/run`, { aqId: ownerAqId, code: "x", language: "javascript" }, other.cookie)).status
    ).toBe(403);
  });

  test("invalid ids are contained (404/400, never cross to real data)", async () => {
    const cookie = (await demoSession());
    expect((await get(`/api/assessment/nonexistent-assessment-id`, cookie)).status).toBe(404);
    expect((await get(`/api/report/nonexistent-report-id`, cookie)).status).toBe(404);
    expect((await get(`/api/submissions/nonexistent-submission/versions`, cookie)).status).toBe(404);
    // malformed ids are rejected by validation
    // fetch normalizes the traversal to /etc/passwd — either way it must NOT
    // resolve into application data (400/404 containment)
    expect([400, 404]).toContain((await get(`/api/assessment/../../etc/passwd`, cookie)).status);
    expect(
      (await post(`/api/assessment/x/submit`, { aqId: "short", code: "x" }, cookie)).status
    ).toBe(400);
  });
});
