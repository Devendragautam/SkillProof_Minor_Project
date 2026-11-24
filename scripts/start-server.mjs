/**
 * Production server launcher used by `npm run start`.
 *
 * Why not `bun .next/standalone/server.js` directly: the old start script
 * hard-required bun and piped through `tee`. Deploy containers without bun
 * (or where HOSTNAME is set to the container id, which makes the standalone
 * server bind to an unreachable address) never started the server, and the
 * deploy was marked failed. This runner:
 *   - prefers bun, falls back to node automatically
 *   - forces HOSTNAME=0.0.0.0 unless the operator set it explicitly
 *   - passes PORT through untouched (standalone honors it)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = (() => {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
})();

const server = path.join(root, ".next", "standalone", "server.js");
if (!fs.existsSync(server)) {
  console.error(
    `[start] ${server} not found — run \`npm run build\` first (output: "standalone").`
  );
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: process.env.HOSTNAME?.trim() || "0.0.0.0",
};

// Prefer bun (matches the local toolchain), fall back to node on ENOENT.
const r = spawnSync("bun", [server], { stdio: "inherit", env });
if (r.error && r.error.code === "ENOENT") {
  console.log("[start] bun not available — starting with node instead.");
  spawnSync(process.execPath, [server], { stdio: "inherit", env });
}
