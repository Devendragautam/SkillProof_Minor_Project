import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JS_HARNESS_SOURCE } from "./js-harness";
import { SP_LIMIT_C_SOURCE } from "./sp-limit-source";

/**
 * One-time build of the sandbox helpers:
 *  - sp-limit: unprivileged C launcher that applies rlimits + a seccomp
 *    deny-list (kill/ptrace/mount/module/BPF family) and execs the target.
 *  - js-harness.cjs: the JS runner executed under `node --permission`.
 *
 * Both are written to a private 0700 directory in the system tmpdir and
 * reused across runs (content-hashed so a source change rebuilds). If the
 * C compiler is unavailable the module degrades gracefully: seccomp
 * hardening is dropped but namespaces, rlimits, env scrubbing and timeouts
 * still apply (prlimit path).
 */

export interface SandboxHelpers {
  spLimitBin: string | null;
  jsHarnessPath: string | null;
}

let cached: SandboxHelpers | null = null;
let building: Promise<SandboxHelpers> | null = null;

function contentHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function buildHelpers(): SandboxHelpers {
  const base = path.join(os.tmpdir(), `sp-sandbox-${process.getuid?.() ?? 0}`);
  try {
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    fs.chmodSync(base, 0o700);
  } catch {
    return { spLimitBin: null, jsHarnessPath: null };
  }

  // ── sp-limit (seccomp + rlimits launcher) ─────────────────────────────────
  let spLimitBin: string | null = null;
  try {
    const tag = contentHash(SP_LIMIT_C_SOURCE);
    const bin = path.join(base, `sp-limit-${tag}`);
    if (!fs.existsSync(bin)) {
      const srcPath = path.join(base, `sp-limit-${tag}.c`);
      fs.writeFileSync(srcPath, SP_LIMIT_C_SOURCE, { encoding: "utf8", mode: 0o600 });
      try {
        const cc = ["/usr/bin/cc", "/usr/bin/gcc", "/usr/bin/clang"].find((c) => fs.existsSync(c));
        if (cc) {
          execFileSync(cc, ["-O2", "-o", bin, srcPath], { timeout: 30000, stdio: "ignore" });
          fs.chmodSync(bin, 0o700);
        }
      } finally {
        try {
          fs.rmSync(srcPath, { force: true });
        } catch {
          // best-effort
        }
      }
    }
    // the binary must exist and be executable to be trusted
    if (fs.existsSync(bin)) {
      fs.accessSync(bin, fs.constants.X_OK);
      spLimitBin = bin;
    }
  } catch (err) {
    console.warn(
      "[exec-isolate] seccomp helper unavailable (" +
        (err instanceof Error ? err.message.split("\n")[0] : "compile failed") +
        ") — continuing with prlimit-only limits."
    );
    spLimitBin = null;
  }

  // ── js-harness.cjs (runs under node --permission) ─────────────────────────
  let jsHarnessPath: string | null = null;
  try {
    const tag = contentHash(JS_HARNESS_SOURCE);
    const harness = path.join(base, `js-harness-${tag}.cjs`);
    if (!fs.existsSync(harness)) {
      fs.writeFileSync(harness, JS_HARNESS_SOURCE, { encoding: "utf8", mode: 0o600 });
      fs.chmodSync(harness, 0o600);
    }
    jsHarnessPath = harness;
  } catch {
    jsHarnessPath = null;
  }

  return { spLimitBin, jsHarnessPath };
}

/**
 * Fire-and-forget warm-up so the helpers exist before the first candidate
 * run (called at module load of the exec layer).
 */
export function warmSandboxHelpers(): void {
  if (cached || building) return;
  building = Promise.resolve()
    .then(buildHelpers)
    .then((v) => {
      cached = v;
      return v;
    });
}

/** Await-able accessor used by the exec paths. Never throws. */
export async function helpersReady(): Promise<SandboxHelpers> {
  warmSandboxHelpers();
  if (cached) return cached;
  if (!building) {
    building = Promise.resolve()
      .then(buildHelpers)
      .then((v) => {
        cached = v;
        return v;
      });
  }
  return building;
}

warmSandboxHelpers();
