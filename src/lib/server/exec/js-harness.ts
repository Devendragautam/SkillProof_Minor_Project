/**
 * Source of the JavaScript execution harness.
 *
 * The harness is written into a per-run staging directory by the parent and
 * executed as the ENTRY SCRIPT of a freshly spawned child:
 *
 *   node --permission --max-old-space-size=256 js-harness.cjs
 *
 * `--permission` (Node's permission model) denies the child filesystem
 * access, child_process, worker_threads and native addons at the V8/runtime
 * level — no blacklist regex involved. Combined with the isolation wrapper
 * (user/network/mount namespaces, seccomp deny-list, rlimits, scrubbed env,
 * SIGKILL timeout) this is a process-boundary sandbox: there are no host
 * objects reachable from the candidate code, so the classic vm-escape
 * techniques (constructor chains, prototype pollution) land inside an
 * already-locked-down child and gain nothing.
 *
 * This replaces the former blacklist-regex + vm.createContext sandbox,
 * which trusted static string filtering as a security boundary.
 *
 * Protocol (stdout, one JSON object per line — mirrors the py/cpp/java
 * harnesses so the server-side parser stays shared):
 *   {"i":<index>,"ok":true,"actual":<json>,"ms":<float>}
 *   {"i":<index>,"ok":false,"err":"…","ms":<float>}
 *   {"logs":[…]}                       (once, at the end)
 *   {"fn_missing":true}                (once, when the entry function is absent)
 *   {"fatal":"…"}                      (harness-level failure, e.g. syntax error)
 */

export const JS_HARNESS_SOURCE = String.raw`'use strict';
const vm = require('node:vm');

// Defense-in-depth on top of the seccomp filter: defuse signal-based DoS
// from inside the child even if candidate code escapes the VM context.
try { process.kill = function spDisabledKill() { throw new Error('process.kill is disabled in the execution sandbox'); }; } catch (e) {}
try { process.abort = function spDisabledAbort() { throw new Error('process.abort is disabled in the execution sandbox'); }; } catch (e) {}

function fail(msg) {
  process.stdout.write(JSON.stringify({ fatal: String(msg).slice(0, 300) }) + '\n');
  process.exit(0);
}

// The per-test context init script: every intrinsic (Object, Function, …)
// is created FRESH inside the VM context — no host object crosses the
// boundary. The console shim writes to a context-internal array.
const INIT = [
  'var __logs = [];',
  'function __fmt(v) {',
  '  if (typeof v === "string") return v;',
  '  try { var s = JSON.stringify(v); return s === undefined ? String(v) : s; }',
  '  catch (e) { return String(v); }',
  '}',
  'var console = {',
  '  log: function () { if (__logs.length < 40) __logs.push(Array.prototype.map.call(arguments, __fmt).join(" ")); },',
  '  error: function () { if (__logs.length < 40) __logs.push("ERROR: " + Array.prototype.map.call(arguments, __fmt).join(" ")); },',
  '  warn: function () {}, info: function () {}, debug: function () {}',
  '};',
  'var __spFn = "";',
  'function __spMissing() { throw new ReferenceError("Function \'" + __spFn + "\' was not found. Define it exactly as specified."); }'
].join('\n');

function makeContext() {
  const ctx = vm.createContext(Object.create(null));
  vm.runInContext(INIT, ctx, { timeout: 500 });
  return ctx;
}

function run(payload) {
  const code = typeof payload.code === 'string' ? payload.code : '';
  const fnName = typeof payload.fnName === 'string' ? payload.fnName : '';
  const tests = Array.isArray(payload.tests) ? payload.tests : [];

  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(fnName)) {
    return fail('Invalid function name');
  }

  // compile once so syntax errors surface as a single clear compileError
  try {
    new vm.Script('"use strict";\n' + code, { filename: 'solution.js' });
  } catch (e) {
    return fail('SyntaxError: ' + (e && e.message ? e.message : String(e)));
  }

  let fnMissing = false;
  const allLogs = [];

  for (let k = 0; k < tests.length; k++) {
    const argsJson = JSON.stringify(Array.isArray(tests[k] && tests[k].args) ? tests[k].args : []);
    const ctx = makeContext();
    const script = [
      '"use strict";',
      code,
      ';var __spVal = (typeof ' + fnName + ' === "function" ? ' + fnName + '.apply(null, ' + argsJson + ') : __spMissing());',
      'var __spJson = (function (v) { try { var s = JSON.stringify(v); return s === undefined ? "__SP_UNSERIALIZABLE__" : s; } catch (e) { return "__SP_UNSERIALIZABLE__"; } })(__spVal);'
    ].join('\n');

    const t0 = Date.now();
    let ok = true;
    let actual = null;
    let err = null;
    try {
      vm.runInContext('var __spFn = ' + JSON.stringify(fnName) + ';', ctx, { timeout: 500 });
      vm.runInContext(script, ctx, { timeout: 2000 });
      // var declarations have no completion value — read the result explicitly
      const json = vm.runInContext('__spJson', ctx, { timeout: 250 });
      if (json === '__SP_UNSERIALIZABLE__') {
        ok = false;
        err = 'result is not JSON-serializable';
      } else {
        actual = JSON.parse(json);
      }
    } catch (e) {
      ok = false;
      const msg = e && e.message ? e.message : String(e);
      err = msg.indexOf('Script execution timed out') !== -1
        ? 'Execution timed out after 2000ms (possible infinite loop)'
        : msg.slice(0, 300);
      if (err.indexOf('was not found') !== -1) fnMissing = true;
    }
    const ms = Date.now() - t0;

    try {
      const logs = JSON.parse(vm.runInContext('JSON.stringify(__logs)', ctx, { timeout: 250 }));
      if (Array.isArray(logs)) for (const l of logs) if (allLogs.length < 40) allLogs.push(String(l).slice(0, 120));
    } catch (e) { /* log collection is best-effort */ }

    const line = { i: k, ok: ok, ms: ms };
    if (ok) line.actual = actual; else line.err = err;
    process.stdout.write(JSON.stringify(line) + '\n');
  }

  if (fnMissing) process.stdout.write(JSON.stringify({ fn_missing: true }) + '\n');
  process.stdout.write(JSON.stringify({ logs: allLogs }) + '\n');
  process.exit(0);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; if (raw.length > 2 * 1024 * 1024) fail('payload too large'); });
process.stdin.on('error', () => fail('stdin error'));
process.stdin.on('end', () => {
  try { run(JSON.parse(raw)); } catch (e) { fail(e && e.message ? e.message : 'harness error'); }
});
`;
