import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { helpersReady } from "./helpers";

/**
 * Isolated process execution for untrusted candidate code.
 *
 * Architecture: authenticated API → runIsolated() → sandboxed child tree →
 * captured result. Every candidate-language run (js/py/cpp/java/sql) goes
 * through this single choke point; no route spawns interpreters directly.
 *
 * Layers (best achievable without root/containers on this host):
 *  1. Linux user+network+mount namespaces via `unshare -r -n -m` — the child
 *     has NO network interfaces and the entire /home tree (application source,
 *     database, .env secrets) is hidden behind an empty tmpfs mount.
 *  2. Environment scrubbing — `env -i`: no DATABASE_URL, no SESSION_SECRET,
 *     no secrets of any kind reach the child.
 *  3. rlimits via `prlimit` — CPU seconds, address space, process count and
 *     max file size are hard-capped for the child and all its descendants.
 *  4. Wall-clock timeout — the whole process group receives SIGKILL.
 *  5. Output caps — stdout/stderr are truncated at a byte budget; oversize
 *     output kills the run (log-flood DoS guard).
 *  6. Private staging dir — per-run 192-bit random name, mode 0700, removed
 *     in `finally` (automatic cleanup).
 *  7. Non-root — the Next.js service itself runs unprivileged; the namespace
 *     root maps back to that same unprivileged uid.
 *
 * Regex/string filtering is NEVER used as a security boundary here — the
 * boundaries are OS-level (namespaces, rlimits, SIGKILL) and Node-level
 * (--permission for the JS runner, see lang-exec.ts).
 */

// ─── capability probe (cached once per process) ─────────────────────────────

let namespacesSupported: boolean | null = null;
let probeStarted = false;

function warnDegraded(): void {
  console.warn(
    "[exec-isolate] WARNING: user/network/mount namespaces unavailable — " +
      "falling back to rlimits-only isolation. Deploy with userns enabled for full isolation."
  );
}

/** Kick off the one-time async probe; harmless to call repeatedly. */
function ensureProbeStarted(): void {
  if (probeStarted) return;
  probeStarted = true;
  const child = spawn("/usr/bin/unshare", ["-r", "-n", "-m", "--fork", "/bin/true"], {
    stdio: "ignore",
    timeout: 5000,
    killSignal: "SIGKILL",
  });
  child.on("error", () => {
    namespacesSupported = false;
    warnDegraded();
  });
  child.on("close", (code) => {
    if (namespacesSupported !== null) return;
    namespacesSupported = code === 0;
    if (!namespacesSupported) warnDegraded();
  });
  setTimeout(() => {
    if (namespacesSupported === null) {
      namespacesSupported = false;
      warnDegraded();
    }
  }, 6000);
}

/**
 * Synchronous view of the capability probe. Returns true while the probe is
 * still warm-up in flight (assume full isolation; the probe completes within
 * the server's boot window, long before the first candidate run).
 */
function namespacesAvailable(): boolean {
  ensureProbeStarted();
  return namespacesSupported !== false;
}

// ─── options & result ────────────────────────────────────────────────────────

export interface IsolateLimits {
  /** CPU seconds (rlimit CPU) */
  cpuSec: number;
  /** address-space bytes (rlimit AS); omit for JVMs (they reserve huge VA) */
  asBytes?: number;
  /** max processes/threads for the child tree (rlimit NPROC) */
  nproc: number;
  /** max bytes a child may write to any file (rlimit FSIZE) */
  fsizeBytes: number;
}

export interface IsolatedRunOptions {
  /** binary to execute (absolute path preferred) */
  cmd: string;
  args: string[];
  /** per-run private staging directory (cwd of the child) */
  cwd: string;
  /** wall-clock timeout in ms — the whole process group is SIGKILLed */
  timeoutMs: number;
  /** max bytes captured from stdout before the run is killed */
  maxStdoutBytes: number;
  /** max bytes captured from stderr before the run is killed */
  maxStderrBytes: number;
  limits: IsolateLimits;
  /** extra env vars merged over the scrubbed minimal environment */
  env?: Record<string, string>;
  /** optional payload piped to the child's stdin (JS harness input) */
  stdin?: string;
}

export interface IsolatedRunResult {
  stdout: string;
  stderr: string;
  /** wall-clock timeout hit — everything was SIGKILLed */
  timedOut: boolean;
  /** output cap hit — the run was killed to stop log flooding */
  outputTruncated: boolean;
  /** non-zero exit, signal kill, or spawn error */
  failed: boolean;
  spawnError?: string;
}

const MINIMAL_PATH = "/usr/local/bin:/usr/bin:/bin";

function scrubbedEnv(extra: Record<string, string> | undefined, cwd: string): Record<string, string> {
  // env -i equivalent: ONLY the minimum needed to run the toolchain.
  // No DATABASE_URL, no SESSION_SECRET, no application secrets.
  return {
    PATH: MINIMAL_PATH,
    HOME: cwd,
    TMPDIR: cwd,
    LANG: "C.UTF-8",
    ...extra,
  };
}

/**
 * Create a private staging directory for one run.
 * 192-bit random suffix (unguessable), mode 0700, under the system tmpdir.
 */
export function makeStagingDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}${randomBytes(24).toString("hex")}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // best-effort hardening
  }
  return dir;
}

export function removeStagingDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // cleanup is best-effort; the OS reaps the tmpdir periodically
  }
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Build the argv chain that wraps the inner command:
 *   [unshare …] sh -c 'hide homes; exec sp-limit … env -i … <cmd> <args>'
 *
 * sp-limit (preferred) applies rlimits AND a seccomp deny-list (kill/ptrace/
 * mount/module/BPF family) before exec. Without the compiled helper we
 * degrade to prlimit rlimits + env scrubbing only.
 */
function buildWrappedArgv(
  opts: IsolatedRunOptions,
  helpers: { spLimitBin: string | null; jsHarnessPath: string | null }
): string[] {
  const { limits } = opts;
  const limiter = helpers.spLimitBin
    ? shellQuote(helpers.spLimitBin) +
      ` cpu=${limits.cpuSec}` +
      (limits.asBytes ? ` as=${limits.asBytes}` : "") +
      ` nproc=${limits.nproc} fsize=${limits.fsizeBytes} --`
    : [
        "prlimit",
        "--cpu=" + limits.cpuSec,
        ...(limits.asBytes ? ["--as=" + limits.asBytes] : []),
        "--nproc=" + limits.nproc,
        "--fsize=" + limits.fsizeBytes,
        "--",
      ].join(" ");

  const envPairs = Object.entries(scrubbedEnv(opts.env, opts.cwd))
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(" ");

  const innerCmd = [opts.cmd, ...opts.args].map(shellQuote).join(" ");
  const inner = `exec ${limiter} env -i ${envPairs} ${innerCmd}`;

  if (namespacesAvailable()) {
    // Hide every user-owned path: application source, database, .env, keys.
    // tmpfs mounts with 1 inode accept no files at all. /var/run hides host
    // sockets (docker.sock etc.). /tmp stays reachable ONLY via the private
    // unguessable staging dir (24-byte random suffix, mode 0700).
    const hideScript =
      "mount --make-rprivate / 2>/dev/null || true; " +
      "mount -t tmpfs -o size=4k,nr_inodes=1 none /home 2>/dev/null || true; " +
      "mount -t tmpfs -o size=4k,nr_inodes=1 none /root 2>/dev/null || true; " +
      "mount -t tmpfs -o size=4k,nr_inodes=1 none /var/run 2>/dev/null || true; " +
      inner;
    return [
      "/usr/bin/unshare",
      "-r", // map root inside the userns (maps back to the unprivileged uid)
      "-n", // network namespace: no interfaces, no sockets that reach anywhere
      "-m", // mount namespace: private /home, /root, /var/run
      "--fork",
      "--kill-child=SIGKILL",
      "/bin/sh",
      "-c",
      hideScript,
    ];
  }
  return ["/bin/sh", "-c", inner];
}

/**
 * Run a command inside the isolation wrapper. Resolves with captured output;
 * never rejects (spawn errors land in `spawnError`).
 */
export async function runIsolated(opts: IsolatedRunOptions): Promise<IsolatedRunResult> {
  const helpers = await helpersReady();
  return new Promise((resolve) => {
    const argv = buildWrappedArgv(opts, helpers);
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let spawnError: string | undefined;
    let settled = false;

    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: opts.cwd,
        // detached → own process group → we can SIGKILL the whole tree
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        // the scrubbed env for the WRAPPER itself (sh/unshare need nothing
        // else); the inner command gets its scrubbed env via `env -i`
        env: { ...scrubbedEnv(opts.env, opts.cwd) } as NodeJS.ProcessEnv,
      });
    } catch (err) {
      resolve({
        stdout: "",
        stderr: "",
        timedOut: false,
        outputTruncated: false,
        failed: true,
        spawnError: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, opts.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > opts.maxStdoutBytes) {
        truncated = true;
        killTree();
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > opts.maxStderrBytes) {
        truncated = true;
        killTree();
        return;
      }
      stderr += chunk.toString("utf8");
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        timedOut,
        outputTruncated: truncated,
        failed: timedOut || truncated || !!spawnError || (child.exitCode !== 0 && child.exitCode !== null),
        spawnError,
      });
    };

    child.on("close", finish);
    child.on("error", (err) => {
      spawnError = err.message;
      finish();
    });

    if (opts.stdin !== undefined) {
      child.stdin?.on("error", () => {
        /* harness died early — the close handler resolves */
      });
      child.stdin?.end(opts.stdin);
    } else {
      child.stdin?.end();
    }
  });
}

/** Convenience: staging dir + run + guaranteed cleanup around one async fn. */
export async function withStaging<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = makeStagingDir(prefix);
  try {
    return await fn(dir);
  } finally {
    removeStagingDir(dir);
  }
}
