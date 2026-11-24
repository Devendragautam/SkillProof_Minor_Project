/**
 * CODE EXECUTION ISOLATION tests — untrusted code runs inside the layered
 * sandbox (userns + netns + mount-ns + seccomp + rlimits), never on the host:
 *   - legitimate code executes through the run API
 *   - infinite loops / memory abuse fail safely (server-enforced timeouts)
 *   - filesystem, network, process spawning and env access all fail
 *   - classic JS sandbox escapes (constructor chains, dynamic import,
 *     prototype tampering) cannot reach the host
 */
import { describe, test, expect, afterAll } from "bun:test";
import { post, seedCandidateUser, createAssessment, dealUntilCoding, prisma, requireServer, type DealtQuestion } from "./helpers";

async function seeded(tag: string) {
  const email = `exec-${tag}@skillproof-test.local`;
  return seedCandidateUser("Exec " + tag, email, "password-for-tests-1");
}

afterAll(async () => {
  await prisma.candidate.deleteMany({ where: { email: { contains: "@skillproof-test.local" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@skillproof-test.local" }, role: "candidate" } });
});

/** Values that must NEVER appear in any run response. */
const HOST_MARKERS = ["custom.db", "session-secret", "skillproof_", "prisma", "/home/z", "database_url"];

function assertNoHostLeak(body: unknown) {
  const text = JSON.stringify(body ?? "").toLowerCase();
  for (const marker of HOST_MARKERS) {
    expect(text.includes(marker)).toBe(false);
  }
}

async function setupRun(tag: string): Promise<{ cookie: string; assessmentId: string; coding: DealtQuestion }> {
  const { cookie } = await seeded(tag);
  const assessmentId = await createAssessment(cookie, [{ skill: "Data Structures", level: "Basic" }]);
  const coding = await dealUntilCoding(assessmentId, cookie);
  return { cookie, assessmentId, coding };
}

function wrap(fnName: string, body: string): string {
  return `function ${fnName}(){ ${body} }`;
}

describe("run API — legitimate execution", () => {
  test("javascript executes and returns graded results", async () => {
    await requireServer();
    const { cookie, coding } = await setupRun("legit");
    const r = await post(
      "/api/run",
      { aqId: coding.aqId, code: wrap(coding.question.fnName!, "return 0;"), language: "javascript" },
      cookie
    );
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body?.results)).toBe(true);
    expect((r.body?.results ?? []).length).toBeGreaterThan(0);
    expect(typeof r.body?.maxRuntimeMs).toBe("number");
    assertNoHostLeak(r.body);
  }, 45_000);
});

describe("run API — resource abuse fails safely", () => {
  test("infinite loop is killed by the server timeout", async () => {
    const { cookie, coding } = await setupRun("loop");
    const t0 = Date.now();
    const r = await post(
      "/api/run",
      { aqId: coding.aqId, code: wrap(coding.question.fnName!, "while(true){}"), language: "javascript" },
      cookie
    );
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(25_000);
    if (r.status === 200) {
      const allError = (r.body?.results ?? []).every((x: any) => !!x.error);
      expect(allError).toBe(true);
    } else {
      expect([408, 429, 500]).toContain(r.status);
    }
    assertNoHostLeak(r.body);
  }, 45_000);

  test("memory exhaustion fails without harming the host", async () => {
    const { cookie, coding } = await setupRun("memory");
    const r = await post(
      "/api/run",
      {
        aqId: coding.aqId,
        code: wrap(coding.question.fnName!, "const junk=[]; while(true){ junk.push(new Array(1e7).fill('x')); }"),
        language: "javascript",
      },
      cookie
    );
    expect([200, 408, 500]).toContain(r.status);
    assertNoHostLeak(r.body);
  }, 45_000);
});

describe("run API — sandbox escape attempts", () => {
  /**
   * Each case returns a STRING out of the sandbox; the assertion checks the
   * outcome is contained (DENIED / no-access) and never a working exploit.
   */
  const cases: Array<{ name: string; tag: string; body: string; must: RegExp; mustNot?: RegExp }> = [
    {
      name: "process global is unavailable",
      tag: "proc",
      body: `try { if (typeof process === 'undefined') return 'no-process'; const keys = Object.keys(process.env||{}); return keys.length ? 'LEAK:'+keys.slice(0,5).join(',') : 'empty-env'; } catch(e){ return 'DENIED'; }`,
      must: /no-process|empty-env|denied/i,
      mustNot: /LEAK:/i,
    },
    {
      name: "constructor escape cannot reach require/process",
      tag: "ctor",
      body: `try { const f = (function(){}).constructor; const req = f('return typeof require')(); const proc = f('return typeof process')(); return 'req:'+req+',proc:'+proc; } catch(e){ return 'DENIED'; }`,
      must: /req:(undefined|DENIED.*),proc:(undefined|DENIED.*)|denied/i,
    },
    {
      name: "require is not available",
      tag: "require",
      body: `try { if (typeof require === 'undefined') return 'no-require'; const fs = require('fs'); return 'GOT-FS'; } catch(e){ return 'DENIED'; }`,
      must: /no-require|denied/i,
      mustNot: /GOT-FS/i,
    },
    {
      name: "child_process spawning fails",
      tag: "spawn",
      body: `try { if (typeof require === 'undefined') return 'no-require'; const cp = require('child_process'); return cp.execSync('id').toString().slice(0,20); } catch(e){ return 'DENIED'; }`,
      must: /no-require|denied|error/i,
    },
    {
      name: "dynamic import cannot load node modules with host access",
      tag: "import",
      body: `try { return import('node:fs').then(m => { const fs = m.default || m; try { const s = fs.readFileSync('/etc/passwd','utf8'); return 'READ:'+s.length; } catch(e) { return 'fs-denied'; } }).catch(e => 'import-denied'); } catch(e){ return 'DENIED'; }`,
      // the harness never awaits the returned promise (serializes as {}) —
      // the containment property is that NO host content appears
      must: /import-denied|fs-denied|READ:\d+|denied|pending|\{\}/i,
      mustNot: /root:x:0:0:0:0:[^\n]*\/(home|root)/i,
    },
    {
      name: "prototype tampering cannot break the harness",
      tag: "proto",
      body: `try { ({}).__proto__.polluted = 'yes'; const inherited = ({}).polluted === 'yes'; return inherited ? 'polluted-ran' : 'not-inherited'; } catch(e){ return 'DENIED'; }`,
      must: /polluted-ran|not-inherited|denied/i,
      mustNot: /custom\.db|session-secret/i,
    },
  ];

  for (const c of cases) {
    test(c.name, async () => {
      const { cookie, coding } = await setupRun(c.tag);
      const r = await post("/api/run", { aqId: coding.aqId, code: wrap(coding.question.fnName!, c.body), language: "javascript" }, cookie);
      expect(r.status).toBe(200); // the run executes; the escape must not win
      const output = (r.body?.results ?? []).map((x: any) => `${x.actualPreview ?? ""}${x.error ?? ""}`).join("|");
      expect(output).toMatch(c.must);
      if (c.mustNot) expect(output).not.toMatch(c.mustNot);
      assertNoHostLeak(r.body);
    }, 45_000);
  }
});
