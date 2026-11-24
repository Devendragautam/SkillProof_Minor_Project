import fs from "node:fs";
import path from "node:path";
import { inferSignature } from "@/lib/server/starters";
import { helpersReady } from "@/lib/server/exec/helpers";
import { runIsolated, withStaging } from "@/lib/server/exec/isolate";
import type { ClientTestResult, TestCase } from "@/lib/types";

/**
 * Multi-language test execution — every language runs inside the isolated
 * execution worker (see lib/server/exec/isolate.ts):
 *
 *   authenticated API → runIsolated() → [unshare -r -n -m (no network, /home
 *   hidden)] → sp-limit (rlimits + seccomp deny-list) → env -i (no secrets)
 *   → interpreter/harness in a private 0700 staging dir → SIGKILL timeout.
 *
 * - javascript: node --permission child (fs/child_process/worker/addons
 *               denied at runtime level) running js-harness.cjs — per-test
 *               fresh VM contexts, NO host objects shared, no blacklist.
 * - python    : /usr/bin/python3 -I harness.py (stdlib JSON harness).
 * - cpp       : g++ -O2 -std=c++20 compile + isolated run.
 * - java      : single-file source launcher `java Main.java` (heap capped
 *               via -Xmx since JVMs reserve huge virtual address space).
 * - sql       : see sql-exec.ts (bun harness, same isolation wrapper).
 *
 * The harnesses never receive expected values — the server compares harness
 * output against tests with a canonical JSON comparison (float tolerant).
 * Regex/string filtering is never used as a security boundary.
 */

const TIMEOUT = { python: 8000, cppCompile: 30000, cppRun: 10000, java: 20000 } as const;

// ─── canonical JSON comparison (float tolerant) ─────────────────────────────

export function jsonEquivalent(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEquivalent(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    const ka = Object.keys(oa).sort();
    const kb = Object.keys(ob).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) => k === kb[i] && jsonEquivalent(oa[k], ob[kb[i]]));
  }
  return false;
}

// ─── preview helper (mirrors sandbox.ts) ────────────────────────────────────

function preview(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 120 ? s.slice(0, 117) + "..." : s;
  } catch {
    return String(v);
  }
}

// ─── isolated exec helper ───────────────────────────────────────────────────

// Output caps: protocol lines are tiny — generous headroom, hard flood stop.
const MAX_STDOUT = 512 * 1024;
const MAX_STDERR = 256 * 1024;
const FSIZE_CAP = 1024 * 1024; // files the child may write (staging only)

interface ExecOutcome {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  failed: boolean;
}

async function execIsolated(
  bin: string,
  args: string[],
  opts: { cwd: string; timeout: number; cpuSec: number; asBytes?: number; nproc?: number; fsizeBytes?: number }
): Promise<ExecOutcome> {
  const res = await runIsolated({
    cmd: bin,
    args,
    cwd: opts.cwd,
    timeoutMs: opts.timeout,
    maxStdoutBytes: MAX_STDOUT,
    maxStderrBytes: MAX_STDERR,
    limits: {
      cpuSec: opts.cpuSec,
      asBytes: opts.asBytes,
      nproc: opts.nproc ?? 64,
      fsizeBytes: opts.fsizeBytes ?? FSIZE_CAP,
    },
  });
  return {
    stdout: res.stdout,
    stderr: res.stderr,
    timedOut: res.timedOut || res.outputTruncated,
    failed: res.failed,
  };
}

// ─── harness protocol types ─────────────────────────────────────────────────

interface RawLine {
  i?: number;
  ok?: boolean;
  actual?: unknown;
  err?: string;
  ms?: number;
  log?: string;
  logs?: string[];
  fn_missing?: boolean;
  fatal?: string;
}

function parseLines(stdout: string): { results: Map<number, RawLine>; logs: string[]; fnMissing: boolean; fatal?: string } {
  const results = new Map<number, RawLine>();
  const logs: string[] = [];
  let fnMissing = false;
  let fatal: string | undefined;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t || !t.startsWith("{")) continue;
    try {
      const o = JSON.parse(t) as RawLine;
      if (o.fn_missing) fnMissing = true;
      if (o.fatal) fatal = o.fatal;
      if (typeof o.i === "number") results.set(o.i, o);
      if (typeof o.log === "string" && logs.length < 40) logs.push(o.log);
      if (Array.isArray(o.logs)) logs.push(...o.logs.slice(0, Math.max(0, 40 - logs.length)));
    } catch {
      // ignore non-protocol output
    }
  }
  return { results, logs, fnMissing, fatal };
}

// ─── result assembly ────────────────────────────────────────────────────────

function assemble(
  tests: TestCase[],
  raw: Map<number, RawLine>,
  logs: string[],
  extra: { compileError?: string; runError?: string; timedOut?: boolean }
) {
  const results: ClientTestResult[] = [];
  let maxMs = 0;
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const r = raw.get(i);
    let pass = false;
    let error: string | undefined;
    let actualPreview = "—";
    let ms = 0;
    if (extra.compileError) {
      error = extra.compileError;
    } else if (extra.timedOut) {
      error = "Execution timed out (possible infinite loop)";
    } else if (!r) {
      error = extra.runError ?? "Runtime process ended before this test could run";
    } else {
      ms = r.ms ?? 0;
      maxMs = Math.max(maxMs, ms);
      if (r.ok) {
        pass = jsonEquivalent(r.actual, t.expected);
        actualPreview = preview(r.actual);
      } else {
        error = r.err ?? "Runtime error";
      }
    }
    results.push({
      index: i,
      hidden: t.hidden,
      pass,
      error,
      ms: Math.round(ms),
      inputPreview: t.args.map((a) => preview(a)).join(", ").slice(0, 100),
      expectedPreview: preview(t.expected),
      actualPreview,
    });
  }
  const passedCount = results.filter((r) => r.pass).length;
  return { results, passedCount, total: tests.length, compileError: extra.compileError, logs: logs.slice(0, 40), maxMs };
}

// ─── PYTHON ─────────────────────────────────────────────────────────────────

const PY_HARNESS = String.raw`
import json, sys, os, time, io, contextlib

def main():
    tests_path, fn_name = sys.argv[1], sys.argv[2]
    with open(tests_path) as f:
        tests = json.load(f)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import solution as mod
    except Exception as e:
        print(json.dumps({"fatal": "%s: %s" % (type(e).__name__, e)}))
        return
    fn = getattr(mod, fn_name, None)
    if fn is None or not callable(fn):
        print(json.dumps({"fn_missing": True}))
        return
    logs = []
    for k, t in enumerate(tests):
        args = t["args"]
        buf = io.StringIO()
        t0 = time.perf_counter()
        ok, actual, err = True, None, None
        try:
            with contextlib.redirect_stdout(buf):
                actual = fn(*args)
        except Exception as e:
            ok, actual, err = False, None, "%s: %s" % (type(e).__name__, e)
        ms = (time.perf_counter() - t0) * 1000.0
        line = {"i": k, "ok": ok, "ms": round(ms, 2)}
        if ok:
            line["actual"] = actual
            try:
                out = json.dumps(line)
            except (TypeError, ValueError):
                out = json.dumps({"i": k, "ok": False, "err": "result is not JSON-serializable", "ms": round(ms, 2)})
            print(out)
        else:
            line["err"] = err
            print(json.dumps(line))
        out_text = buf.getvalue()
        for ln in out_text.splitlines():
            if len(logs) < 40:
                logs.append(ln)
    print(json.dumps({"logs": logs}))

main()
`;

async function runPython(code: string, fnName: string, tests: TestCase[]) {
  return withStaging("sp-py-", async (dir) => {
    fs.writeFileSync(path.join(dir, "solution.py"), code, "utf8");
    fs.writeFileSync(path.join(dir, "harness.py"), PY_HARNESS, "utf8");
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify(tests.map((t) => ({ args: t.args }))), "utf8");
    const res = await execIsolated("/usr/bin/python3", ["-I", "harness.py", "tests.json", fnName], {
      cwd: dir,
      timeout: TIMEOUT.python,
      cpuSec: 8,
      asBytes: 768 * 1024 * 1024,
      nproc: 256,
    });
    const parsed = parseLines(res.stdout);
    const compileError =
      parsed.fatal ?? (parsed.fnMissing ? `Function '${fnName}' was not found in the submitted code.` : undefined);
    return assemble(tests, parsed.results, parsed.logs, {
      compileError,
      runError: res.timedOut ? undefined : res.failed && !res.stdout ? (res.stderr || "python3 exited with an error").slice(0, 300) : undefined,
      timedOut: res.timedOut,
    });
  });
}

// ─── C++ ────────────────────────────────────────────────────────────────────

const CPP_PRELUDE = String.raw`
#include <bits/stdc++.h>
using namespace std;

// ---- minimal JSON value + parser (harness-internal) ----
struct JV {
    int t = 0; // 0 null, 1 bool, 2 num, 3 str, 4 arr, 5 obj
    bool b = false;
    double n = 0;
    string s;
    vector<JV> a;
    vector<pair<string, JV>> o;
};
struct JParser {
    const string& src; size_t i = 0;
    explicit JParser(const string& s) : src(s) {}
    [[noreturn]] void fail() { throw runtime_error("bad json"); }
    void ws() { while (i < src.size() && (src[i]==' '||src[i]=='\t'||src[i]=='\n'||src[i]=='\r')) i++; }
    char peek() { if (i >= src.size()) fail(); return src[i]; }
    string parseStr() {
        i++; string out;
        while (true) {
            if (i >= src.size()) fail();
            char c = src[i++];
            if (c == '"') break;
            if (c == '\\') {
                if (i >= src.size()) fail();
                char e = src[i++];
                switch (e) {
                    case '"': out += '"'; break; case '\\': out += '\\'; break; case '/': out += '/'; break;
                    case 'b': out += '\b'; break; case 'f': out += '\f'; break; case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break; case 't': out += '\t'; break;
                    case 'u': { if (i + 4 > src.size()) fail(); string h = src.substr(i, 4); i += 4;
                        int cp = stoi(h, nullptr, 16);
                        if (cp < 0x80) out += (char)cp;
                        else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
                        else { out += (char)(0xE0 | (cp >> 12)); out += (char)(0x80 | ((cp >> 6) & 0x3F)); out += (char)(0x80 | (cp & 0x3F)); }
                        break; }
                    default: fail();
                }
                continue;
            }
            out += c;
        }
        return out;
    }
    JV parse() {
        ws(); char c = peek(); JV v;
        if (c == '{') { v.t = 5; i++; ws(); if (peek() == '}') { i++; return v; }
            while (true) { ws(); if (peek() != '"') fail(); string k = parseStr(); ws();
                if (peek() != ':') fail(); i++; v.o.push_back({k, parse()}); ws();
                if (peek() == ',') { i++; continue; }
                if (peek() == '}') { i++; break; } fail(); }
            return v; }
        if (c == '[') { v.t = 4; i++; ws(); if (peek() == ']') { i++; return v; }
            while (true) { v.a.push_back(parse()); ws();
                if (peek() == ',') { i++; continue; }
                if (peek() == ']') { i++; break; } fail(); }
            return v; }
        if (c == '"') { v.t = 3; v.s = parseStr(); return v; }
        if (src.compare(i, 4, "true") == 0) { i += 4; v.t = 1; v.b = true; return v; }
        if (src.compare(i, 5, "false") == 0) { i += 5; v.t = 1; v.b = false; return v; }
        if (src.compare(i, 4, "null") == 0) { i += 4; v.t = 0; return v; }
        { size_t st = i; if (peek() == '-' || peek() == '+') i++;
          while (i < src.size() && (isdigit((unsigned char)src[i]) || src[i]=='.' || src[i]=='e' || src[i]=='E' || src[i]=='+' || src[i]=='-')) i++;
          if (i == st) fail(); v.t = 2; v.n = stod(src.substr(st, i - st)); return v; }
    }
};
static string jesc(const string& x) {
    string out;
    for (char c : x) {
        switch (c) { case '"': out += "\\\""; break; case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break; case '\r': out += "\\r"; break; case '\t': out += "\\t"; break;
            default: out += c; }
    }
    return out;
}
static string jnum(double v) {
    if (v == (long long)v && fabs(v) < 1e15) return to_string((long long)v);
    ostringstream o; o << setprecision(15) << v; return o.str();
}
// ---- typed conversions ----
static long long to_int(const JV& v) { if (v.t != 2) throw runtime_error("expected a number argument"); return (long long)v.n; }
static double to_double(const JV& v) { if (v.t != 2) throw runtime_error("expected a number argument"); return v.n; }
static bool to_bool(const JV& v) { if (v.t != 1) throw runtime_error("expected a boolean argument"); return v.b; }
static string to_str(const JV& v) { if (v.t != 3) throw runtime_error("expected a string argument"); return v.s; }
static vector<int> to_vec_int(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<int> r; for (auto& x : v.a) r.push_back((int)to_int(x)); return r; }
static vector<long long> to_vec_ll(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<long long> r; for (auto& x : v.a) r.push_back(to_int(x)); return r; }
static vector<double> to_vec_d(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<double> r; for (auto& x : v.a) r.push_back(to_double(x)); return r; }
static vector<bool> to_vec_b(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<bool> r; for (auto& x : v.a) r.push_back(to_bool(x)); return r; }
static vector<string> to_vec_str(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<string> r; for (auto& x : v.a) r.push_back(to_str(x)); return r; }
static vector<vector<int>> to_vec2_int(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<vector<int>> r; for (auto& x : v.a) r.push_back(to_vec_int(x)); return r; }
static vector<vector<long long>> to_vec2_ll(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<vector<long long>> r; for (auto& x : v.a) r.push_back(to_vec_ll(x)); return r; }
static vector<vector<double>> to_vec2_d(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<vector<double>> r; for (auto& x : v.a) r.push_back(to_vec_d(x)); return r; }
static vector<vector<string>> to_vec2_str(const JV& v) { if (v.t != 4) throw runtime_error("expected an array argument"); vector<vector<string>> r; for (auto& x : v.a) r.push_back(to_vec_str(x)); return r; }
// ---- result serializers ----
static string ser(long long v) { return to_string(v); }
static string ser(int v) { return to_string((long long)v); }
static string ser(double v) { return jnum(v); }
static string ser(bool v) { return v ? "true" : "false"; }
static string ser(const string& v) { return "\"" + jesc(v) + "\""; }
static string ser(const vector<int>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<long long>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<double>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<bool>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser((bool)v[k]); } return o + "]"; }
static string ser(const vector<string>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<vector<int>>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<vector<long long>>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<vector<double>>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static string ser(const vector<vector<string>>& v) { string o = "["; for (size_t k = 0; k < v.size(); k++) { if (k) o += ","; o += ser(v[k]); } return o + "]"; }
static double now_ms() { return chrono::duration<double, milli>(chrono::steady_clock::now().time_since_epoch()).count(); }
`;

function cppRunOne(fnName: string, cppTypes: string[], retCpp: string): string {
  const conv = cppTypes
    .map((t, i) => {
      const map: Record<string, string> = {
        int: "to_int",
        "long long": "to_int",
        double: "to_double",
        bool: "to_bool",
        string: "to_str",
        "vector<int>": "to_vec_int",
        "vector<long long>": "to_vec_ll",
        "vector<double>": "to_vec_d",
        "vector<bool>": "to_vec_b",
        "vector<string>": "to_vec_str",
        "vector<vector<int>>": "to_vec2_int",
        "vector<vector<long long>>": "to_vec2_ll",
        "vector<vector<double>>": "to_vec2_d",
        "vector<vector<string>>": "to_vec2_str",
      };
      return `    auto a${i} = ${map[t]}(args.a[${i}]);`;
    })
    .join("\n");
  const callArgs = cppTypes.map((_, i) => `a${i}`).join(", ");
  void retCpp;
  return `
static string runOne(const JV& args) {
${conv}
    Solution sol;
    auto r = sol.${fnName}(${callArgs});
    return ser(r);
}
`;
}

const CPP_MAIN = String.raw`
int main(int argc, char** argv) {
    if (argc < 2) { cout << "{\"fatal\":\"missing tests file\"}"; return 1; }
    ifstream f(argv[1]); stringstream ss; ss << f.rdbuf();
    string src = ss.str(); // keep alive — JParser holds a reference
    JV root;
    try { JParser p(src); root = p.parse(); }
    catch (...) { cout << "{\"fatal\":\"bad tests json\"}"; return 1; }
    int n = (int)root.a.size();
    for (int k = 0; k < n; k++) {
        const JV* args = nullptr;
        for (auto& kv : root.a[k].o) if (kv.first == "args") args = &kv.second;
        if (!args) { cout << "{\"fatal\":\"test missing args\"}"; return 1; }
        double t0 = now_ms();
        ostringstream captured;
        streambuf* old = cout.rdbuf(captured.rdbuf());
        string out; bool ok = true; string err;
        try { out = runOne(*args); }
        catch (const exception& e) { ok = false; err = e.what(); }
        catch (...) { ok = false; err = "unknown runtime error"; }
        cout.rdbuf(old);
        double ms = now_ms() - t0;
        cout << "{\"i\":" << k << ",\"ok\":" << (ok ? "true" : "false");
        if (ok) cout << ",\"actual\":" << out;
        else cout << ",\"err\":\"" << jesc(err) << "\"";
        cout << ",\"ms\":" << ms << "}\n";
        string cap = captured.str();
        int lines = 0;
        size_t st = 0;
        while (st < cap.size() && lines < 10) {
            size_t nl = cap.find('\n', st);
            string ln = cap.substr(st, nl == string::npos ? string::npos : nl - st);
            if (!ln.empty()) cout << "{\"log\":\"" << jesc(ln) << "\"}\n";
            lines++;
            if (nl == string::npos) break;
            st = nl + 1;
        }
    }
    return 0;
}
`;

async function runCpp(code: string, fnName: string, tests: TestCase[], cppTypes: string[], retCpp: string) {
  return withStaging("sp-cpp-", async (dir) => {
    const src = `${CPP_PRELUDE}\n// ---- candidate solution ----\n${code}\n// ---- generated runner ----\n${cppRunOne(fnName, cppTypes, retCpp)}\n${CPP_MAIN}\n`;
    fs.writeFileSync(path.join(dir, "sol.cpp"), src, "utf8");
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify(tests.map((t) => ({ args: t.args }))), "utf8");
    const compiled = await execIsolated("/usr/bin/g++", ["-O2", "-std=c++20", "-o", "sol", "sol.cpp"], {
      cwd: dir,
      timeout: TIMEOUT.cppCompile,
      cpuSec: 30,
      asBytes: 2 * 1024 * 1024 * 1024,
      nproc: 512,
      fsizeBytes: 8 * 1024 * 1024,
    });
    if (compiled.failed) {
      const msg = (compiled.stderr || "compilation failed").slice(0, 2000);
      return assemble(tests, new Map(), [], { compileError: compiled.timedOut ? "Compilation timed out" : msg });
    }
    const res = await execIsolated(path.join(dir, "sol"), ["tests.json"], {
      cwd: dir,
      timeout: TIMEOUT.cppRun,
      cpuSec: 10,
      asBytes: 512 * 1024 * 1024,
      nproc: 256,
    });
    const parsed = parseLines(res.stdout);
    return assemble(tests, parsed.results, parsed.logs, { timedOut: res.timedOut });
  });
}

// ─── JAVA ───────────────────────────────────────────────────────────────────

const JAVA_PRELUDE = String.raw`
import java.util.*;
import java.io.*;
import java.nio.file.*;

public class Main {
    // ---- minimal JSON value + parser (harness-internal) ----
    static class JV {
        int t = 0; // 0 null, 1 bool, 2 num, 3 str, 4 arr, 5 obj
        boolean b = false;
        double n = 0;
        String s = "";
        List<JV> a = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        List<JV> vals = new ArrayList<>();
    }
    static class JParser {
        final String src; int i = 0;
        JParser(String s) { src = s; }
        void fail() { throw new RuntimeException("bad json"); }
        char peek() { if (i >= src.length()) fail(); return src.charAt(i); }
        void ws() { while (i < src.length() && Character.isWhitespace(src.charAt(i))) i++; }
        JV parse() {
            ws(); char c = peek(); JV v = new JV();
            if (c == '{') { v.t = 5; i++; ws(); if (peek() == '}') { i++; return v; }
                while (true) { ws(); if (peek() != '"') fail(); String k = parseStr(); ws();
                    if (peek() != ':') fail(); i++; v.keys.add(k); v.vals.add(parse()); ws();
                    if (peek() == ',') { i++; continue; }
                    if (peek() == '}') { i++; break; } fail(); }
                return v; }
            if (c == '[') { v.t = 4; i++; ws(); if (peek() == ']') { i++; return v; }
                while (true) { v.a.add(parse()); ws();
                    if (peek() == ',') { i++; continue; }
                    if (peek() == ']') { i++; break; } fail(); }
                return v; }
            if (c == '"') { v.t = 3; v.s = parseStr(); return v; }
            if (src.startsWith("true", i)) { i += 4; v.t = 1; v.b = true; return v; }
            if (src.startsWith("false", i)) { i += 5; v.t = 1; v.b = false; return v; }
            if (src.startsWith("null", i)) { i += 4; v.t = 0; return v; }
            int st = i;
            while (i < src.length() && "+-.eE0123456789".indexOf(src.charAt(i)) >= 0) i++;
            if (i == st) fail();
            v.t = 2; v.n = Double.parseDouble(src.substring(st, i)); return v;
        }
        String parseStr() {
            i++; StringBuilder out = new StringBuilder();
            while (true) {
                if (i >= src.length()) fail();
                char c = src.charAt(i++);
                if (c == '"') break;
                if (c == '\\') {
                    if (i >= src.length()) fail();
                    char e = src.charAt(i++);
                    switch (e) {
                        case '"': out.append('"'); break; case '\\': out.append('\\'); break; case '/': out.append('/'); break;
                        case 'b': out.append('\b'); break; case 'f': out.append('\f'); break; case 'n': out.append('\n'); break;
                        case 'r': out.append('\r'); break; case 't': out.append('\t'); break;
                        case 'u': if (i + 4 > src.length()) fail();
                            out.append((char) Integer.parseInt(src.substring(i, i + 4), 16)); i += 4; break;
                        default: fail();
                    }
                    continue;
                }
                out.append(c);
            }
            return out.toString();
        }
    }
    // ---- helpers ----
    static String esc(String x) {
        StringBuilder out = new StringBuilder();
        for (int k = 0; k < x.length(); k++) {
            char c = x.charAt(k);
            switch (c) {
                case '"': out.append("\\\""); break; case '\\': out.append("\\\\"); break;
                case '\n': out.append("\\n"); break; case '\r': out.append("\\r"); break; case '\t': out.append("\\t"); break;
                default: out.append(c);
            }
        }
        return out.toString();
    }
    static String num(double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) return "null";
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        return Double.toString(d);
    }
    // ---- typed conversions ----
    static int toInt(JV v) { if (v.t != 2) throw new RuntimeException("expected a number argument"); return (int) v.n; }
    static long toLong(JV v) { if (v.t != 2) throw new RuntimeException("expected a number argument"); return (long) v.n; }
    static double toDouble(JV v) { if (v.t != 2) throw new RuntimeException("expected a number argument"); return v.n; }
    static boolean toBool(JV v) { if (v.t != 1) throw new RuntimeException("expected a boolean argument"); return v.b; }
    static String toStr(JV v) { if (v.t != 3) throw new RuntimeException("expected a string argument"); return v.s; }
    static int[] toIntArray(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); int[] r = new int[v.a.size()]; for (int k = 0; k < v.a.size(); k++) r[k] = toInt(v.a.get(k)); return r; }
    static long[] toLongArray(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); long[] r = new long[v.a.size()]; for (int k = 0; k < v.a.size(); k++) r[k] = toLong(v.a.get(k)); return r; }
    static double[] toDoubleArray(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); double[] r = new double[v.a.size()]; for (int k = 0; k < v.a.size(); k++) r[k] = toDouble(v.a.get(k)); return r; }
    static boolean[] toBoolArray(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); boolean[] r = new boolean[v.a.size()]; for (int k = 0; k < v.a.size(); k++) r[k] = toBool(v.a.get(k)); return r; }
    static String[] toStrArray(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); String[] r = new String[v.a.size()]; for (int k = 0; k < v.a.size(); k++) r[k] = toStr(v.a.get(k)); return r; }
    static List<Integer> toListInt(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<Integer> r = new ArrayList<>(); for (JV x : v.a) r.add(toInt(x)); return r; }
    static List<Long> toListLong(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<Long> r = new ArrayList<>(); for (JV x : v.a) r.add(toLong(x)); return r; }
    static List<Double> toListDouble(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<Double> r = new ArrayList<>(); for (JV x : v.a) r.add(toDouble(x)); return r; }
    static List<List<Integer>> toList2Int(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<List<Integer>> r = new ArrayList<>(); for (JV x : v.a) r.add(toListInt(x)); return r; }
    static List<List<String>> toList2Str(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<List<String>> r = new ArrayList<>(); for (JV x : v.a) r.add(toListStr(x)); return r; }
    static List<String> toListStr(JV v) { if (v.t != 4) throw new RuntimeException("expected an array argument"); List<String> r = new ArrayList<>(); for (JV x : v.a) r.add(toStr(x)); return r; }
    // ---- result serializers ----
    static String ser(int v) { return Integer.toString(v); }
    static String ser(long v) { return Long.toString(v); }
    static String ser(double v) { return num(v); }
    static String ser(boolean v) { return Boolean.toString(v); }
    static String ser(String v) { return "\"" + esc(v) + "\""; }
    static String ser(int[] v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(","); o.append(ser(v[k])); } return o + "]"; }
    static String ser(long[] v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(","); o.append(ser(v[k])); } return o + "]"; }
    static String ser(double[] v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(","); o.append(num(v[k])); } return o + "]"; }
    static String ser(boolean[] v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(","); o.append(ser(v[k])); } return o + "]"; }
    static String ser(String[] v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.length; k++) { if (k > 0) o.append(","); o.append(ser(v[k])); } return o + "]"; }
    static String serListInt(List<Integer> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(ser(v.get(k).intValue())); } return o + "]"; }
    static String serListLong(List<Long> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(ser(v.get(k).longValue())); } return o + "]"; }
    static String serListDouble(List<Double> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(num(v.get(k))); } return o + "]"; }
    static String serList2Int(List<List<Integer>> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(serListInt(v.get(k))); } return o + "]"; }
    static String serList2Str(List<List<String>> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(serListStr(v.get(k))); } return o + "]"; }
    static String serListStr(List<String> v) { StringBuilder o = new StringBuilder("["); for (int k = 0; k < v.size(); k++) { if (k > 0) o.append(","); o.append(ser(v.get(k))); } return o + "]"; }
`;

function javaRunOne(fnName: string, javaTypes: string[], retJava: string): string {
  const map: Record<string, string> = {
    int: "toInt",
    long: "toLong",
    double: "toDouble",
    boolean: "toBool",
    String: "toStr",
    "int[]": "toIntArray",
    "long[]": "toLongArray",
    "double[]": "toDoubleArray",
    "boolean[]": "toBoolArray",
    "String[]": "toStrArray",
    "List<Integer>": "toListInt",
    "List<Long>": "toListLong",
    "List<Double>": "toListDouble",
    "List<List<Integer>>": "toList2Int",
    "List<List<String>>": "toList2Str",
  };
  const conv = javaTypes.map((t, i) => `        ${t} a${i} = ${map[t]}(args.a.get(${i}));`).join("\n");
  const callArgs = javaTypes.map((_, i) => `a${i}`).join(", ");
  const serFn =
    retJava === "List<Integer>" ? "serListInt"
    : retJava === "List<Long>" ? "serListLong"
    : retJava === "List<Double>" ? "serListDouble"
    : retJava === "List<List<Integer>>" ? "serList2Int"
    : retJava === "List<List<String>>" ? "serList2Str"
    : "ser";
  return `
    static String runOne(JV args) {
${conv}
        ${retJava} r = new Solution().${fnName}(${callArgs});
        return ${serFn}(r);
    }
`;
}

const JAVA_MAIN = String.raw`
    public static void main(String[] argv) throws Exception {
        if (argv.length < 1) { System.out.println("{\"fatal\":\"missing tests file\"}"); return; }
        String src = new String(Files.readAllBytes(Paths.get(argv[0])), "UTF-8");
        JV root;
        try { root = new JParser(src).parse(); }
        catch (Throwable e) { System.out.println("{\"fatal\":\"bad tests json\"}"); return; }
        PrintStream orig = System.out;
        for (int k = 0; k < root.a.size(); k++) {
            JV args = null;
            for (int x = 0; x < root.a.get(k).keys.size(); x++)
                if (root.a.get(k).keys.get(x).equals("args")) args = root.a.get(k).vals.get(x);
            if (args == null) { System.out.println("{\"fatal\":\"test missing args\"}"); return; }
            long t0 = System.nanoTime();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            String out = null; String err = null;
            try {
                System.setOut(new PrintStream(buf, true, "UTF-8"));
                out = runOne(args);
            } catch (Throwable e) {
                err = e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
            } finally {
                System.setOut(orig);
            }
            double ms = (System.nanoTime() - t0) / 1e6;
            StringBuilder sb = new StringBuilder("{\"i\":").append(k).append(",\"ok\":").append(out != null);
            if (out != null) sb.append(",\"actual\":").append(out);
            else sb.append(",\"err\":\"").append(esc(err == null ? "runtime error" : err)).append("\"");
            sb.append(",\"ms\":").append(String.format(java.util.Locale.ROOT, "%.2f", ms)).append("}");
            orig.println(sb.toString());
            try {
                String cap = buf.toString("UTF-8");
                String[] lines = cap.split("\n");
                for (int L = 0; L < lines.length && L < 10; L++)
                    if (!lines[L].isEmpty()) orig.println("{\"log\":\"" + esc(lines[L]) + "\"}");
            } catch (Throwable ignore) { }
        }
    }
`; // NOTE: the Main class is closed by runJava after candidate-code placement

async function runJava(code: string, fnName: string, tests: TestCase[], javaTypes: string[], retJava: string) {
  return withStaging("sp-java-", async (dir) => {
    const src = `${JAVA_PRELUDE}\n${javaRunOne(fnName, javaTypes, retJava)}\n${JAVA_MAIN}\n}\n\n// ---- candidate solution ----\n${code}\n`;
    fs.writeFileSync(path.join(dir, "Main.java"), src, "utf8");
    fs.writeFileSync(path.join(dir, "tests.json"), JSON.stringify(tests.map((t) => ({ args: t.args }))), "utf8");
    // JVMs reserve huge virtual address space — cap the HEAP via -Xmx (not
    // RLIMIT_AS) plus metaspace/code-cache; the rest is rlimit/seccomp bound
    const res = await execIsolated("/usr/bin/java", [
      "-Xss64m", "-Xmx256m", "-Xms32m",
      "-XX:MaxMetaspaceSize=96m", "-XX:ReservedCodeCacheSize=32m",
      "-XX:-UsePerfData", // no /tmp/hsperfdata side channel
      "Main.java", "tests.json",
    ], {
      cwd: dir,
      timeout: TIMEOUT.java,
      cpuSec: 20,
      nproc: 512,
      fsizeBytes: 8 * 1024 * 1024,
    });
    const parsed = parseLines(res.stdout);
    const looksCompileError = /error:/i.test(res.stderr) && parsed.results.size === 0 && !res.timedOut;
    return assemble(tests, parsed.results, parsed.logs, {
      compileError: looksCompileError ? res.stderr.slice(0, 2000) : undefined,
      runError: !looksCompileError && !res.timedOut && parsed.results.size === 0 ? (res.stderr || "java exited with an error").slice(0, 300) : undefined,
      timedOut: res.timedOut,
    });
  });
}

// ─── JAVASCRIPT (isolated node --permission child) ──────────────────────────

export interface SandboxRunResult {
  results: ClientTestResult[];
  passedCount: number;
  total: number;
  compileError?: string;
  logs: string[];
  maxMs: number;
}

/**
 * Execute candidate JavaScript inside the isolated execution worker.
 *
 * The child is spawned as `node --permission --max-old-space-size=256 …` —
 * the runtime itself denies filesystem access, child_process, worker_threads
 * and native addons — wrapped in the namespace/seccomp/rlimit/environ
 * isolation used by every language. Inside the child, each test runs in a
 * FRESH VM context whose intrinsics are created from scratch (no host object
 * ever crosses the boundary), so constructor-chain escapes, prototype
 * pollution and dynamic-import tricks all land inside an already-locked-down
 * process and gain nothing. There is NO blacklist regex — string filtering
 * is not treated as a security boundary.
 */
export async function runJsTests(code: string, fnName: string, tests: TestCase[]): Promise<SandboxRunResult> {
  const helpers = await helpersReady();
  if (!helpers.jsHarnessPath) {
    return {
      results: tests.map((t, i) => ({
        index: i,
        hidden: t.hidden,
        pass: false,
        error: "JavaScript execution is temporarily unavailable",
        ms: 0,
        inputPreview: t.args.map((a) => preview(a)).join(", ").slice(0, 100),
        expectedPreview: preview(t.expected),
        actualPreview: "—",
      })),
      passedCount: 0,
      total: tests.length,
      compileError: "JavaScript execution is temporarily unavailable — please retry.",
      logs: [],
      maxMs: 0,
    };
  }
  return withStaging("sp-js-", async (dir) => {
    const res = await runIsolated({
      cmd: "/usr/bin/node",
      args: ["--permission", "--max-old-space-size=256", helpers.jsHarnessPath as string],
      cwd: dir,
      timeoutMs: 10_000,
      maxStdoutBytes: 512 * 1024,
      maxStderrBytes: 256 * 1024,
      limits: { cpuSec: 8, asBytes: 4 * 1024 * 1024 * 1024, nproc: 2048, fsizeBytes: 1024 * 1024 },
      stdin: JSON.stringify({ code, fnName, tests: tests.map((t) => ({ args: t.args })) }),
    });
    const parsed = parseLines(res.stdout);
    const compileError = parsed.fatal ?? (parsed.fnMissing ? `Function '${fnName}' was not found in the submitted code.` : undefined);
    return assemble(tests, parsed.results, parsed.logs, { compileError, timedOut: res.timedOut });
  });
}

// ─── dispatcher ─────────────────────────────────────────────────────────────

export interface MultiLangRunResult {
  results: ClientTestResult[];
  passedCount: number;
  total: number;
  compileError?: string;
  logs: string[];
  maxMs: number;
}

export async function runTestsInLanguage(
  code: string,
  fnName: string,
  tests: TestCase[],
  language: string
): Promise<MultiLangRunResult> {
  if (language !== "python" && language !== "cpp" && language !== "java") {
    return runJsTests(code, fnName, tests);
  }
  const sig = inferSignature(fnName, tests);
  if (!sig) {
    return {
      results: tests.map((t, i) => ({
        index: i,
        hidden: t.hidden,
        pass: false,
        error: `${language} execution is not configured for this question`,
        ms: 0,
        inputPreview: t.args.map((a) => preview(a)).join(", ").slice(0, 100),
        expectedPreview: preview(t.expected),
        actualPreview: "—",
      })),
      passedCount: 0,
      total: tests.length,
      compileError: `${language} execution is not configured for this question`,
      logs: [],
      maxMs: 0,
    };
  }
  if (language === "python") return runPython(code, fnName, tests);
  if (language === "cpp") return runCpp(code, fnName, tests, sig.paramCpp, sig.retCpp as string);
  return runJava(code, fnName, tests, sig.paramJava, sig.retJava as string);
}
