"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalibrationView } from "@/components/skillproof/question-calibration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
  Bug,
  Check,
  Code2,
  Database,
  ExternalLink,
  EyeOff,
  FileUp,
  Globe,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  Play,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  SearchX,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ExtractedMcq } from "@/lib/types";

/**
 * Recruiter Question Bank — every assessment question recruiters can draw from.
 * Self-contained: fetches GET /api/questions once, filters client-side, can add
 * questions via POST /api/questions (with link import via /api/questions/import).
 */

// ─── Types (GET /api/questions payload) ─────────────────────────────────────

interface QuestionRow {
  id: string;
  externalId: string;
  skill: string;
  category: string;
  topic: string;
  difficulty: string;
  title: string;
  fnName: string | null;
  points: number;
  timeLimitSec: number;
  source: string;
  sourceUrl: string | null;
  createdAt: string;
  testsCount: number;
  hiddenCount: number;
  visibleTests: Array<{ args: unknown[]; expected: unknown; setup?: string; unordered?: boolean }>;
  hint: boolean;
  starterCode: string | null;
  languages: string[];
  /** SQL question — schemaSql is present; candidates answer with a single SQLite SELECT. */
  isSql: boolean;
  schemaSql: string | null;
  seedSql: string | null;
  solutionSql: string | null;
  /** Not part of the current GET payload — rendered in the detail dialog when present. */
  description?: string | null;
}

interface BankStats {
  total: number;
  coding: number;
  debugging: number;
  mcq: number;
  custom: number;
  sql: number;
}

interface BankPayload {
  questions: QuestionRow[];
  stats: BankStats;
  skills: string[];
  canonicalSkills: string[];
}

interface ImportDraft {
  title?: string;
  description?: string;
  skill?: string;
  topic?: string;
  difficulty?: string;
  fnName?: string;
  starterCode?: string;
  tests?: Array<{ args?: unknown; expected?: unknown; hidden?: boolean }>;
  timeLimitSec?: number;
  points?: number;
  hint?: string;
  sourceUrl?: string;
  source?: string;
}

interface ImportResponse {
  imported?: boolean;
  platform?: string;
  slug?: string;
  sourceUrl?: string;
  draft?: ImportDraft;
  reason?: string;
  error?: string;
}

// ─── Add-question form model ────────────────────────────────────────────────

interface TestDraft {
  args: string;
  expected: string;
  hidden: boolean;
  /** SQL mode only — optional SQL executed before this test's SELECT. */
  setup: string;
  /** SQL mode only — compare the result rows ignoring row order. */
  unordered: boolean;
}

interface QuestionForm {
  title: string;
  description: string;
  fnName: string;
  skill: string;
  topic: string;
  difficulty: string;
  points: string;
  timeLimitSec: string;
  hint: string;
  starterCode: string;
  /** "code" = JS-exec function question · "sql" = single-SELECT SQLite question. */
  kind: "code" | "sql";
  schemaSql: string;
  seedSql: string;
  solutionSql: string;
  tests: TestDraft[];
}

const EMPTY_TEST: TestDraft = { args: "", expected: "", hidden: false, setup: "", unordered: false };

/** Blank editor row per question type — SQL tests pre-seed `[]` (an empty result). */
const emptyTestFor = (kind: "code" | "sql"): TestDraft =>
  kind === "sql" ? { ...EMPTY_TEST, expected: "[]" } : { ...EMPTY_TEST };

const emptyForm = (): QuestionForm => ({
  title: "",
  description: "",
  fnName: "",
  skill: "",
  topic: "",
  difficulty: "medium",
  points: "10",
  timeLimitSec: "1800",
  hint: "",
  starterCode: "",
  kind: "code",
  schemaSql: "",
  seedSql: "",
  solutionSql: "",
  tests: [emptyTestFor("code")],
});

// ─── Constants & small helpers ──────────────────────────────────────────────

const FN_RE = /^[A-Za-z_$][\w$]*$/;

const CREATE_TABLE_RE = /\bcreate\s+table\b/i;

/** Result of the authoring "Run solution" probe against /api/questions/validate-sql. */
type SqlRun =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; columns: string[]; rows: unknown[][]; rowCount: number }
  | { status: "error"; error: string };

const LANG_LABEL: Record<string, string> = {
  javascript: "JS",
  python: "PY",
  cpp: "C++",
  java: "JAVA",
};

const CATEGORY_PILL: Record<string, string> = {
  coding: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  debugging: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  mcq: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
};

const DIFFICULTY_PILL: Record<string, string> = {
  easy: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  medium: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  hard: "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400",
};

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  builtin: { label: "Built-in", className: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300" },
  imported: { label: "Imported", className: "border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400" },
  custom: { label: "Custom", className: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" },
};

const TIME_LIMIT_OPTIONS = [
  { value: "600", label: "10 min" },
  { value: "900", label: "15 min" },
  { value: "1800", label: "30 min" },
  { value: "2700", label: "45 min" },
  { value: "3600", label: "60 min" },
];

const IMPORT_BANNER: Record<string, string> = {
  success: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400",
  warn: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400",
  error: "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400",
};

/** "2d ago" style — short relative time, falls back to a short date past a week. */
function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "1.2 MB" style file size for the PDF import preview. */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const fmtTimeLimit = (sec: number) => (Number.isFinite(sec) && sec % 60 === 0 ? `${sec / 60} min` : `${sec}s`);

type JsonParse = { ok: true; value: unknown } | { ok: false; error: string };

function parseJsonField(text: string): JsonParse {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

/** Convert import-draft tests into editor rows — skips malformed entries. */
function normalizeDraftTests(tests: ImportDraft["tests"]): TestDraft[] {
  if (!Array.isArray(tests)) return [];
  const rows: TestDraft[] = [];
  for (const t of tests) {
    if (!t || !Array.isArray(t.args) || t.args.length === 0 || t.expected === undefined) continue;
    try {
      rows.push({ args: JSON.stringify(t.args), expected: JSON.stringify(t.expected), hidden: !!t.hidden, setup: "", unordered: false });
    } catch {
      // non-serializable entry — skip it
    }
  }
  return rows.slice(0, 10);
}

// ─── Tiny shared pills ──────────────────────────────────────────────────────

function CategoryPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
        CATEGORY_PILL[value] ?? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      )}
    >
      {value}
    </span>
  );
}

function DifficultyPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
        DIFFICULTY_PILL[value] ?? "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
      )}
    >
      {value}
    </span>
  );
}

function SourceBadge({ value }: { value: string }) {
  const meta = SOURCE_BADGE[value] ?? { label: value, className: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300" };
  return <Badge variant="outline" className={cn("shrink-0 px-2 py-0 text-[10px]", meta.className)}>{meta.label}</Badge>;
}

// ─── SQL authoring bits (shared by the run preview and the detail dialog) ───

/** Dark mono SQL block for the detail dialog (schema / seed / solution). */
function SqlCodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
        {code}
      </pre>
    </div>
  );
}

/** Compact hairline table of SQL result rows — scrolls internally, preview capped. */
function SqlRowsTable({ columns, rows, maxRows = 8 }: { columns?: string[]; rows: unknown[][]; maxRows?: number }) {
  const shown = rows.slice(0, maxRows);
  return (
    <div className="min-w-0">
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-card">
        <table className="w-full border-collapse font-mono text-[11px]">
          {columns && columns.length > 0 && (
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40">
                <th className="px-2 py-1 text-left font-medium text-zinc-400 dark:text-zinc-400">#</th>
                {columns.map((c, i) => (
                  <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium text-zinc-600 dark:text-zinc-300">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td className="px-2 py-1.5 text-zinc-500 dark:text-zinc-400" colSpan={(columns?.length ?? 0) + 1}>
                  (empty result — 0 rows)
                </td>
              </tr>
            ) : (
              shown.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                  <td className="border-r border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 tabular-nums text-zinc-400 dark:text-zinc-400">{ri}</td>
                  {(Array.isArray(row) ? row : []).map((cell, ci) => (
                    <td key={ci} className="whitespace-nowrap px-2 py-1 text-zinc-700 dark:text-zinc-300">
                      {cell === undefined ? "—" : JSON.stringify(cell)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > maxRows && (
        <p className="mt-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
          showing first {maxRows} of {rows.length} rows
        </p>
      )}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function QuestionBankPanel() {
  const [data, setData] = useState<BankPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  // filters — applied client-side over the fetched payload (no refetch on keystroke)
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [skill, setSkill] = useState("all");

  const [detail, setDetail] = useState<QuestionRow | null>(null);

  // panel view — the bank listing, or the outcome-weighted calibration sheet
  const [view, setView] = useState<"bank" | "calibration">("bank");

  // add-question dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<QuestionForm>(emptyForm);
  const [source, setSource] = useState<"custom" | "imported">("custom");
  const [sourceUrl, setSourceUrl] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: "success" | "warn" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // SQL authoring — "Run solution" probe + which test row feeds its setup / receives derived rows
  const [sqlRun, setSqlRun] = useState<SqlRun>({ status: "idle" });
  const [sqlRunTest, setSqlRunTest] = useState(0);
  const runTestIdx = form.tests.length > 0 ? Math.min(sqlRunTest, form.tests.length - 1) : 0;
  const runSetup = form.tests[runTestIdx]?.setup.trim() ?? "";

  // PDF → MCQ import dialog state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfStage, setPdfStage] = useState<"upload" | "extracting" | "preview">("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [pdfSkill, setPdfSkill] = useState("General");
  const [pdfElapsed, setPdfElapsed] = useState(0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{ questions: ExtractedMcq[]; source: "ai" | "heuristic"; fileName: string } | null>(null);
  const [pdfSelected, setPdfSelected] = useState<Set<number>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false); // extracting or importing
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // live elapsed-seconds counter while the AI extraction pass runs (can take ~25s)
  useEffect(() => {
    if (pdfStage !== "extracting") return;
    setPdfElapsed(0);
    const t = setInterval(() => setPdfElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [pdfStage]);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await fetch("/api/questions", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as BankPayload;
      setData({
        questions: json.questions ?? [],
        stats: json.stats ?? { total: 0, coding: 0, debugging: 0, mcq: 0, custom: 0, sql: 0 },
        skills: json.skills ?? [],
        canonicalSkills: json.canonicalSkills ?? [],
      });
      setStatus("ready");
    } catch (err) {
      if (mode === "refresh") {
        toast.error(`Could not refresh the question bank (${err instanceof Error ? err.message : "network error"})`);
      } else {
        setStatus("error");
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = data?.questions ?? [];
    const q = query.trim().toLowerCase();
    if (!q && category === "all" && difficulty === "all" && skill === "all") return list;
    return list.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (difficulty !== "all" && item.difficulty !== difficulty) return false;
      if (skill !== "all" && item.skill !== skill) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.topic.toLowerCase().includes(q) &&
        !item.skill.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [data, query, category, difficulty, skill]);

  const clearFilters = () => {
    setQuery("");
    setCategory("all");
    setDifficulty("all");
    setSkill("all");
  };

  function setField<K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) {
    setForm((cur) => ({ ...cur, [key]: value }));
  }

  const updateTest = (i: number, patch: Partial<TestDraft>) =>
    setForm((cur) => ({ ...cur, tests: cur.tests.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));

  const addTest = () =>
    setForm((cur) =>
      cur.tests.length >= 10 ? cur : { ...cur, tests: [...cur.tests, emptyTestFor(cur.kind)] }
    );

  const removeTest = (i: number) =>
    setForm((cur) => ({ ...cur, tests: cur.tests.filter((_, idx) => idx !== i) }));

  /** Switch question type — shared fields persist; a single untouched blank test re-seeds for the new shape. */
  const setKind = (kind: "code" | "sql") => {
    setSqlRun({ status: "idle" });
    setForm((cur) => {
      const blank =
        cur.tests.length === 1 &&
        !cur.tests[0].args.trim() &&
        (cur.tests[0].expected.trim() === "" || cur.tests[0].expected.trim() === "[]");
      return { ...cur, kind, tests: blank ? [emptyTestFor(kind)] : cur.tests };
    });
  };

  const openAdd = () => {
    setForm(emptyForm());
    setSource("custom");
    setSourceUrl("");
    setImportUrl("");
    setImportMsg(null);
    setServerError(null);
    setSqlRun({ status: "idle" });
    setSqlRunTest(0);
    setAddOpen(true);
  };

  // live JSON parse per test field (drives red rings + inline errors + save gating)
  const testParse = useMemo(
    () =>
      form.tests.map((t) => {
        const args = parseJsonField(t.args);
        const expected = parseJsonField(t.expected);
        const setupError =
          form.kind === "sql" && t.setup.trim().length > 4000
            ? "Setup SQL must be at most 4000 characters"
            : null;
        if (form.kind === "sql") {
          // expected must be an array of result rows (array of arrays) — mirrors the POST validator
          let expectedError: string | null = null;
          if (!t.expected.trim()) expectedError = "Required";
          else if (!expected.ok) expectedError = "Invalid JSON";
          else if (!Array.isArray(expected.value)) expectedError = "Must be an array of result rows";
          else if ((expected.value as unknown[]).some((row) => !Array.isArray(row)))
            expectedError = "Every row must be an array of column values";
          else if ((expected.value as unknown[]).length > 5000) expectedError = "Max 5000 rows";
          const rows =
            expected.ok &&
            Array.isArray(expected.value) &&
            (expected.value as unknown[]).every((row) => Array.isArray(row))
              ? (expected.value as unknown[][])
              : null;
          return { args, expected, argsError: null, expectedError, setupError, rows };
        }
        let argsError: string | null = null;
        if (!t.args.trim()) argsError = "Required";
        else if (!args.ok) argsError = "Invalid JSON";
        else if (!Array.isArray(args.value)) argsError = "Must be a JSON array";
        else if ((args.value as unknown[]).length === 0) argsError = "Needs at least 1 argument";
        const expectedError = !t.expected.trim() ? "Required" : expected.ok ? null : "Invalid JSON";
        return { args, expected, argsError, expectedError, setupError, rows: null };
      }),
    [form.tests, form.kind]
  );

  const validation = useMemo(() => {
    const canonical = data?.canonicalSkills ?? [];
    const isSql = form.kind === "sql";
    const title = form.title.trim();
    const description = form.description.trim();
    const topic = form.topic.trim();
    const points = Number(form.points);
    const schemaSql = form.schemaSql.trim();
    const seedSql = form.seedSql.trim();
    const solutionSql = form.solutionSql.trim();

    const fields = {
      title: title.length < 5 || title.length > 160,
      description: description.length < 20 || description.length > 8000,
      fnName: !isSql && !FN_RE.test(form.fnName.trim()),
      skill: !canonical.includes(form.skill),
      topic: topic.length === 1,
      points: !Number.isFinite(points) || points < 5 || points > 100,
      schemaSql: isSql && (schemaSql.length < 5 || schemaSql.length > 20000 || !CREATE_TABLE_RE.test(schemaSql)),
      seedSql: isSql && seedSql.length > 20000,
      solutionSql: isSql && (solutionSql.length < 5 || solutionSql.length > 10000),
    };

    const problems: string[] = [];
    if (form.tests.length === 0) problems.push("Add at least one test case (1–10).");
    else if (testParse.some((p) => p.argsError || p.expectedError || p.setupError))
      problems.push(
        isSql
          ? "Fix the highlighted test fields — expected must be a JSON array of result rows (array of arrays)."
          : "Fix the highlighted test case fields — args must be a JSON array, expected a JSON value."
      );
    if (fields.title) problems.push("Title must be 5–160 characters.");
    if (fields.description) problems.push("Description must be 20–8000 characters.");
    if (fields.fnName) problems.push("Function name must be a valid identifier, e.g. twoSum.");
    if (fields.skill) problems.push("Pick a skill from the list.");
    if (fields.topic) problems.push("Topic needs at least 2 characters, or leave it blank to default to the skill.");
    if (fields.points) problems.push("Points must be between 5 and 100.");
    if (fields.schemaSql)
      problems.push("Schema SQL must be 5–20000 characters and include at least one CREATE TABLE statement.");
    if (fields.seedSql) problems.push("Seed SQL must be at most 20000 characters.");
    if (fields.solutionSql) problems.push("Reference solution SQL must be 5–10000 characters.");

    return { fields, valid: problems.length === 0, summary: problems[0] ?? null };
  }, [form, testParse, data]);

  /** Apply an import draft into the form — deep-copies primitives, missing fields stay as-is. */
  const applyDraft = (draft: ImportDraft, fallbackUrl: string) => {
    setForm((cur) => {
      const next: QuestionForm = { ...cur };
      if (typeof draft.title === "string" && draft.title.trim()) next.title = draft.title;
      if (typeof draft.description === "string") next.description = draft.description;
      if (typeof draft.skill === "string" && draft.skill.trim()) next.skill = draft.skill;
      if (typeof draft.topic === "string") next.topic = draft.topic;
      if (draft.difficulty === "easy" || draft.difficulty === "medium" || draft.difficulty === "hard")
        next.difficulty = draft.difficulty;
      if (typeof draft.fnName === "string") next.fnName = draft.fnName;
      if (typeof draft.starterCode === "string") next.starterCode = draft.starterCode;
      if (typeof draft.hint === "string" && draft.hint.trim()) next.hint = draft.hint;
      if (draft.points != null && Number.isFinite(Number(draft.points))) next.points = String(draft.points);
      if (draft.timeLimitSec != null && Number.isFinite(Number(draft.timeLimitSec)))
        next.timeLimitSec = String(draft.timeLimitSec);
      const tests = normalizeDraftTests(draft.tests);
      if (tests.length > 0) next.tests = tests;
      return next;
    });
    setSourceUrl(typeof draft.sourceUrl === "string" && draft.sourceUrl.trim() ? draft.sourceUrl : fallbackUrl);
  };

  const runImport = async () => {
    const url = importUrl.trim();
    if (!url) {
      setImportMsg({ kind: "error", text: "Paste a problem URL first." });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as ImportResponse;
      if (!res.ok) {
        setImportMsg({ kind: "error", text: json.error ?? "Import failed — check the link and try again." });
        return;
      }
      applyDraft(json.draft ?? {}, url);
      if (json.imported) {
        setSource("imported");
        setImportMsg({
          kind: "success",
          text: `Imported from ${json.platform ?? "the source"} — review the details below, then save.`,
        });
      } else {
        setImportMsg({
          kind: "warn",
          text: json.reason ?? "Could not import automatically — complete the form manually.",
        });
      }
    } catch {
      setImportMsg({ kind: "error", text: "Import failed — check the link and try again." });
    } finally {
      setImporting(false);
    }
  };

  /** Run the reference solution against a fresh in-memory SQLite DB (authoring probe). */
  const runSolution = async () => {
    if (sqlRun.status === "running") return;
    const schemaSql = form.schemaSql.trim();
    const sql = form.solutionSql.trim();
    if (!schemaSql || !sql) {
      setSqlRun({ status: "error", error: "Schema SQL and reference solution are required to run." });
      return;
    }
    setSqlRun({ status: "running" });
    try {
      const res = await fetch("/api/questions/validate-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaSql,
          seedSql: form.seedSql.trim(),
          sql,
          ...(runSetup ? { setup: runSetup } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        columns?: string[];
        rows?: unknown[][];
        rowCount?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setSqlRun({ status: "error", error: json.error ?? `Run failed (status ${res.status}).` });
        return;
      }
      setSqlRun({
        status: "ok",
        columns: json.columns ?? [],
        rows: Array.isArray(json.rows) ? json.rows : [],
        rowCount: json.rowCount ?? (Array.isArray(json.rows) ? json.rows.length : 0),
      });
    } catch {
      setSqlRun({ status: "error", error: "Network error — could not run the solution." });
    }
  };

  /** Write the derived result rows into the currently selected test's expected field. */
  const deriveExpected = () => {
    if (sqlRun.status !== "ok" || !form.tests[runTestIdx]) return;
    updateTest(runTestIdx, { expected: JSON.stringify(sqlRun.rows) });
    toast.success(`Derived expected rows → test ${runTestIdx + 1}`);
  };

  const save = async () => {
    if (!validation.valid || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          form.kind === "sql"
            ? {
                mode: "sql",
                title: form.title.trim(),
                description: form.description.trim(),
                skill: form.skill,
                topic: form.topic.trim(),
                difficulty: form.difficulty,
                points: Number(form.points),
                timeLimitSec: Number(form.timeLimitSec),
                schemaSql: form.schemaSql.trim(),
                solutionSql: form.solutionSql.trim(),
                tests: form.tests.map((t, i) => {
                  const p = testParse[i];
                  return {
                    args: [],
                    expected: p.rows ?? [],
                    hidden: t.hidden,
                    ...(t.setup.trim() ? { setup: t.setup.trim() } : {}),
                    ...(t.unordered ? { unordered: true } : {}),
                  };
                }),
                ...(form.hint.trim() ? { hint: form.hint.trim() } : {}),
                ...(form.seedSql.trim() ? { seedSql: form.seedSql.trim() } : {}),
                ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
                source,
              }
            : {
                title: form.title.trim(),
                description: form.description.trim(),
                skill: form.skill,
                topic: form.topic.trim(),
                difficulty: form.difficulty,
                fnName: form.fnName.trim(),
                starterCode: form.starterCode,
                tests: form.tests.map((t, i) => {
                  const p = testParse[i];
                  return {
                    args: p.args.ok ? p.args.value : [],
                    expected: p.expected.ok ? p.expected.value : null,
                    hidden: t.hidden,
                  };
                }),
                timeLimitSec: Number(form.timeLimitSec),
                points: Number(form.points),
                ...(form.hint.trim() ? { hint: form.hint.trim() } : {}),
                ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
                source,
              }
        ),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setServerError(json.error ?? `Could not save the question (status ${res.status}).`);
        return;
      }
      toast.success(form.kind === "sql" ? "SQL question added to the bank" : "Question added to the bank");
      setAddOpen(false);
      await load("refresh");
    } catch {
      setServerError("Network error — could not save the question.");
    } finally {
      setSaving(false);
    }
  };

  // ── PDF → MCQ import ──

  const resetPdfImport = () => {
    setPdfStage("upload");
    setPdfFile(null);
    setPdfDragOver(false);
    setPdfSkill("General");
    setPdfElapsed(0);
    setPdfError(null);
    setPdfResult(null);
    setPdfSelected(new Set());
    setPdfBusy(false);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  const openPdfImport = () => {
    resetPdfImport();
    setPdfOpen(true);
  };

  const acceptPdfFile = (file: File | undefined | null) => {
    if (!file) return;
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    if (!isPdf) {
      setPdfError("Only PDF files are supported — upload a text-based question paper.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPdfError("PDF is larger than 8 MB — split or compress the question paper.");
      return;
    }
    setPdfError(null);
    setPdfFile(file);
  };

  const runPdfExtract = async () => {
    if (!pdfFile || pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    setPdfStage("extracting");
    try {
      const fd = new FormData();
      fd.append("file", pdfFile);
      const res = await fetch("/api/questions/import-pdf", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        questions?: ExtractedMcq[];
        source?: "ai" | "heuristic";
        fileName?: string;
        error?: string;
      };
      if (!res.ok) {
        const msg = json.error ?? `Extraction failed (status ${res.status}).`;
        if (res.status === 401 || res.status === 403) toast.error(msg);
        else setPdfError(msg);
        setPdfStage("upload");
        return;
      }
      const questions = Array.isArray(json.questions) ? json.questions : [];
      setPdfResult({
        questions,
        source: json.source === "heuristic" ? "heuristic" : "ai",
        fileName: json.fileName ?? pdfFile.name,
      });
      setPdfSelected(new Set(questions.map((_, i) => i)));
      setPdfStage("preview");
    } catch {
      setPdfError("Network error — could not upload the PDF.");
      setPdfStage("upload");
    } finally {
      setPdfBusy(false);
    }
  };

  const runPdfImport = async () => {
    if (!pdfResult || pdfSelected.size === 0 || pdfBusy) return;
    const questions = pdfResult.questions.filter((_, i) => pdfSelected.has(i));
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/questions/import-mcq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, skill: pdfSkill }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        created?: number;
        skipped?: number;
        invalid?: number;
        error?: string;
      };
      if (!res.ok) {
        const msg = json.error ?? `Import failed (status ${res.status}).`;
        if (res.status === 401 || res.status === 403) toast.error(msg);
        else setPdfError(msg);
        return;
      }
      const created = json.created ?? 0;
      const skipped = json.skipped ?? 0;
      const invalid = json.invalid ?? 0;
      const extras = [
        skipped > 0 ? `${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : null,
        invalid > 0 ? `${invalid} invalid dropped` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      toast.success(`Imported ${created} MCQ question${created === 1 ? "" : "s"} from PDF${extras ? ` — ${extras}` : ""}`);
      setPdfOpen(false);
      await load("refresh");
    } catch {
      setPdfError("Network error — could not import the questions.");
    } finally {
      setPdfBusy(false);
    }
  };

  const togglePdfSelected = (i: number) =>
    setPdfSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // ── loading skeleton ──
  if (status === "loading") {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Skeleton className="sp-shimmer h-6 w-44 bg-zinc-200/70 dark:bg-zinc-800/70" />
          <Skeleton className="sp-shimmer h-4 w-full max-w-md bg-zinc-200/50 dark:bg-zinc-800/50" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="sp-shimmer h-[86px] rounded-lg bg-zinc-200/50 dark:bg-zinc-800/50" />
          ))}
        </div>
        <Skeleton className="sp-shimmer h-[72px] rounded-lg bg-zinc-200/40 dark:bg-zinc-800/40" />
        <Skeleton className="sp-shimmer h-[320px] rounded-lg bg-zinc-200/40 dark:bg-zinc-800/40" />
      </div>
    );
  }

  // ── error state ──
  if (status === "error") {
    return (
      <Card className="rounded-lg border-rose-200 dark:border-rose-800/60 bg-card shadow-none">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <TriangleAlert className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Could not load the question bank</p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">The request to /api/questions failed — check the server and retry.</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStatus("loading");
              void load();
            }}
            className="border-zinc-300 dark:border-zinc-700 text-xs hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = data?.stats;
  const skills = data?.skills ?? [];
  const canonicalSkills = data?.canonicalSkills ?? [];
  const pdfSkillOptions = Array.from(new Set(["General", ...(canonicalSkills.length ? canonicalSkills : skills)]));

  const statDefs: Array<{ label: string; value: number; Icon: LucideIcon; sub?: string }> = [
    { label: "Total questions", value: stats?.total ?? 0, Icon: Layers, sub: `${skills.length} skills covered` },
    { label: "Coding", value: stats?.coding ?? 0, Icon: Code2 },
    { label: "SQL", value: stats?.sql ?? 0, Icon: Database },
    { label: "Debugging", value: stats?.debugging ?? 0, Icon: Bug },
    { label: "MCQ", value: stats?.mcq ?? 0, Icon: ListChecks },
    { label: "Custom added", value: stats?.custom ?? 0, Icon: PlusCircle, sub: "imported + custom" },
  ];

  return (
    <div className="space-y-4">
      {/* header row — with the bank / calibration view switch */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Question bank</h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            All assessment questions recruiters can draw from — search, inspect, and add your own from a link.
          </p>
        </div>
        {/* view switch — mono folio tabs, active side gets the ink block */}
        <div
          role="tablist"
          aria-label="Question bank views"
          className="flex shrink-0 border border-zinc-300 dark:border-zinc-700 bg-background"
        >
          {(
            [
              { id: "bank", label: "Bank" },
              { id: "calibration", label: "Calibration" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={view === t.id}
              onClick={() => setView(t.id)}
              className={cn(
                "px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors",
                view === t.id
                  ? "bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950"
                  : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {view === "bank" && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => void load("refresh")}
            disabled={refreshing}
            aria-label="Refresh question bank"
            title="Refresh the question bank"
            className="h-9 w-9 shrink-0 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
        )}
      </div>

      {view === "calibration" && <CalibrationView />}

      {view === "bank" && (<>

      {/* stat chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {statDefs.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <Card className="min-w-0 rounded-lg border-border bg-card shadow-none">
              <CardContent className="min-w-0 p-3 sm:p-4">
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 text-zinc-400 dark:text-zinc-400">
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate" title={s.label}>
                    {s.label}
                  </span>
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{s.value}</p>
                {s.sub && <p className="truncate text-[11px] text-muted-foreground">{s.sub}</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* toolbar */}
      <Card className="rounded-lg border-border bg-card shadow-none">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, topic or skill…"
              aria-label="Search title, topic or skill"
              className="h-9 border-zinc-300 dark:border-zinc-700 pl-8 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[150px] border bg-card text-xs",
                  category !== "all" ? "border-zinc-950 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by category"
              >
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="coding">Coding</SelectItem>
                <SelectItem value="debugging">Debugging</SelectItem>
                <SelectItem value="mcq">MCQ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[150px] border bg-card text-xs",
                  difficulty !== "all" ? "border-zinc-950 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by difficulty"
              >
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any difficulty</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
            <Select value={skill} onValueChange={setSkill}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[150px] border bg-card text-xs",
                  skill !== "all" ? "border-zinc-950 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by skill"
              >
                <SelectValue placeholder="Skill" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All skills</SelectItem>
                {skills.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={openPdfImport}
              className="ml-auto h-9 gap-1.5 border-zinc-300 dark:border-zinc-700 px-3 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <FileUp className="h-3.5 w-3.5" /> Import PDF
            </Button>
            <Button
              size="sm"
              onClick={openAdd}
              className="h-9 gap-1.5 px-3 text-xs font-semibold sp-press"
            >
              <Plus className="h-3.5 w-3.5" /> Add question
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* table / empty state */}
      {filtered.length === 0 ? (
        <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX className="h-8 w-8 text-zinc-400 dark:text-zinc-400" />
            <p className="text-sm text-muted-foreground">No questions match the current filters.</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Try a different search term or clear the filters.</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-10 pl-3 pr-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Question
                  </TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Skill</TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Category
                  </TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Difficulty
                  </TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Languages
                  </TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Tests</TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Points</TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Source</TableHead>
                  <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Added</TableHead>
                  <TableHead className="px-2 pr-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((q) => (
                  <TableRow
                    key={q.id}
                    tabIndex={0}
                    aria-label={`View details for ${q.title}`}
                    onClick={() => setDetail(q)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetail(q);
                      }
                    }}
                    className="cursor-pointer border-border/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-950/30 dark:focus-visible:ring-zinc-100/20"
                  >
                    <TableCell className="min-w-0 max-w-[260px] pl-3 pr-2">
                      <p className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={q.title}>
                          {q.title}
                        </span>
                        {q.isSql && <Database className="h-3 w-3 shrink-0 text-zinc-400 dark:text-zinc-400" aria-label="SQL question" />}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={q.topic}>
                        {q.topic}
                      </p>
                    </TableCell>
                    <TableCell className="px-2">
                      <Badge
                        variant="outline"
                        className="max-w-[110px] border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-normal text-zinc-600 dark:text-zinc-300"
                      >
                        <span className="truncate">{q.skill}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2">
                      <CategoryPill value={q.category} />
                    </TableCell>
                    <TableCell className="px-2">
                      <DifficultyPill value={q.difficulty} />
                    </TableCell>
                    <TableCell className="px-2">
                      {q.isSql ? (
                        <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1 py-px font-mono text-[9px] font-medium text-zinc-700 dark:text-zinc-300">
                          SQL
                        </span>
                      ) : q.category === "coding" ? (
                        <div className="flex flex-wrap gap-1">
                          {(q.languages ?? []).slice(0, 4).map((l) => (
                            <span
                              key={l}
                              className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1 py-px font-mono text-[9px] font-medium text-zinc-700 dark:text-zinc-300"
                            >
                              {LANG_LABEL[l] ?? l.slice(0, 4).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2">
                      <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {q.testsCount}
                        {q.hiddenCount > 0 ? ` · ${q.hiddenCount} hid` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="px-2">
                      <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{q.points}</span>
                    </TableCell>
                    <TableCell className="px-2">
                      <SourceBadge value={q.source} />
                    </TableCell>
                    <TableCell className="px-2">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400" title={new Date(q.createdAt).toLocaleString()}>
                        {timeAgo(q.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 pr-3">
                      {q.sourceUrl ? (
                        <a
                          href={q.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open source for ${q.title}`}
                          title="Open source"
                          className="inline-flex text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      </>)}

      {/* detail dialog */}
      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-base leading-snug text-zinc-900 dark:text-zinc-100">{detail.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-1.5 pt-1">
                  <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-300">
                    {detail.skill}
                  </Badge>
                  <CategoryPill value={detail.category} />
                  <DifficultyPill value={detail.difficulty} />
                  <SourceBadge value={detail.source} />
                </DialogDescription>
              </DialogHeader>

              <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {detail.topic} · {detail.points} pts · {fmtTimeLimit(detail.timeLimitSec)}
                {!detail.isSql && detail.fnName && (
                  <>
                    {" · fn "}
                    <span className="text-zinc-900 dark:text-zinc-100">{detail.fnName}</span>
                  </>
                )}
              </p>

              <div>
                <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Description</p>
                {detail.description ? (
                  <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {detail.description}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Full prompt description is not included in the bank listing — candidates see it at assessment time.
                    {detail.sourceUrl ? " Open the source link below to read the original problem." : ""}
                  </p>
                )}
              </div>

              {detail.isSql && (
                <>
                  {detail.schemaSql && <SqlCodeBlock label="Schema" code={detail.schemaSql} />}
                  {detail.seedSql && <SqlCodeBlock label="Seed data" code={detail.seedSql} />}
                  {detail.solutionSql && <SqlCodeBlock label="Solution" code={detail.solutionSql} />}
                </>
              )}

              <div>
                <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Visible tests</p>
                {(detail.visibleTests ?? []).length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">No visible tests — all test cases are hidden for this question.</p>
                ) : detail.isSql ? (
                  <div className="space-y-2">
                    {(detail.visibleTests ?? []).map((t, i) => {
                      const rows = Array.isArray(t.expected) ? (t.expected as unknown[][]) : [];
                      return (
                        <div key={i} className="min-w-0 space-y-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 p-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-400">{String(i + 1).padStart(2, "0")}</span>
                            {t.unordered && (
                              <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-px font-mono text-[9px] text-zinc-600 dark:text-zinc-300">
                                row order ignored
                              </span>
                            )}
                          </div>
                          {t.setup ? (
                            <div className="min-w-0">
                              <p className="mb-1 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                setup
                              </p>
                              <pre className="overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-100">
                                {t.setup}
                              </pre>
                            </div>
                          ) : null}
                          <SqlRowsTable rows={rows} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(detail.visibleTests ?? []).map((t, i) => (
                      <div
                        key={i}
                        className="break-all rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 font-mono text-[11px] text-zinc-100"
                      >
                        <span className="text-zinc-600 dark:text-zinc-300">{String(i + 1).padStart(2, "0")} </span>
                        {JSON.stringify(t.args)} <span className="text-emerald-400/80">→</span> {JSON.stringify(t.expected)}
                      </div>
                    ))}
                  </div>
                )}
                {detail.hiddenCount > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    <EyeOff className="h-3 w-3 shrink-0" />
                    {detail.hiddenCount} hidden test{detail.hiddenCount === 1 ? "" : "s"} withheld from candidates
                  </p>
                )}
              </div>

              {!detail.isSql && (
                <div>
                  <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Starter code</p>
                  {detail.starterCode ? (
                    <pre className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                      {detail.starterCode}
                    </pre>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">No starter code for this question.</p>
                  )}
                </div>
              )}

              {detail.sourceUrl && (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open source
                </a>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* add-question dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setServerError(null);
            setImportMsg(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl gap-4 overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base text-zinc-900 dark:text-zinc-100">Add a question</DialogTitle>
            <DialogDescription>
              Paste a problem link to import a draft, or fill in the form to add a custom question to the bank.
            </DialogDescription>
          </DialogHeader>

          {/* import from a link — code drafts only; hidden while authoring a SQL question */}
          {form.kind === "code" && (
            <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <Link2 className="h-3 w-3" /> Import from a link
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://leetcode.com/problems/two-sum/…"
                  aria-label="Problem URL to import"
                  className="h-9 min-w-0 flex-1 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
                <Button
                  size="sm"
                  onClick={() => void runImport()}
                  disabled={importing || !importUrl.trim()}
                  className="h-9 gap-1.5 px-4 text-xs font-semibold"
                >
                  {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  Fetch
                </Button>
              </div>
              {importMsg && (
                <p className={cn("mt-2 rounded-lg border px-3 py-2 text-xs", IMPORT_BANNER[importMsg.kind])} role="status">
                  {importMsg.text}
                </p>
              )}
            </div>
          )}

          {/* form grid */}
          <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Question type</p>
              <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setKind("code")}
                  aria-pressed={form.kind === "code"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
                    form.kind === "code" ? "bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950" : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  <Code2 className="h-3.5 w-3.5" /> Coding
                </button>
                <button
                  type="button"
                  onClick={() => setKind("sql")}
                  aria-pressed={form.kind === "sql"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors",
                    form.kind === "sql" ? "bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950" : "text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  <Database className="h-3.5 w-3.5" /> SQL (SQLite)
                </button>
              </div>
              {form.kind === "sql" && (
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Candidates write a single SELECT (SQLite) that runs against the schema and seed below — the question stays in the coding category.
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="qb-add-title" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Title
                </Label>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{form.title.trim().length}/160 · min 5</span>
              </div>
              <Input
                id="qb-add-title"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="1. Two Sum"
                aria-invalid={validation.fields.title || undefined}
                className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-sm"
              />
            </div>

            {form.kind === "sql" ? (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Function name</span>
                <p className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Runs as a single SELECT against SQLite — fnName is managed internally.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="qb-add-fn" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Function name
                </Label>
                <Input
                  id="qb-add-fn"
                  value={form.fnName}
                  onChange={(e) => setField("fnName", e.target.value)}
                  placeholder="twoSum"
                  aria-invalid={validation.fields.fnName || undefined}
                  className="h-9 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-xs"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-700 dark:text-zinc-300" htmlFor="qb-add-skill">
                Skill
              </Label>
              <Select value={form.skill || ""} onValueChange={(v) => setField("skill", v)}>
                <SelectTrigger
                  id="qb-add-skill"
                  aria-invalid={validation.fields.skill || undefined}
                  className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-xs"
                >
                  <SelectValue placeholder="Select skill" />
                </SelectTrigger>
                <SelectContent>
                  {canonicalSkills.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qb-add-topic" className="text-xs text-zinc-700 dark:text-zinc-300">
                Topic
              </Label>
              <Input
                id="qb-add-topic"
                value={form.topic}
                onChange={(e) => setField("topic", e.target.value)}
                placeholder="Array"
                aria-invalid={validation.fields.topic || undefined}
                className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qb-add-difficulty" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Difficulty
                </Label>
                <Select value={form.difficulty} onValueChange={(v) => setField("difficulty", v)}>
                  <SelectTrigger id="qb-add-difficulty" className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-xs">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qb-add-points" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Points
                </Label>
                <Input
                  id="qb-add-points"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={100}
                  value={form.points}
                  onChange={(e) => setField("points", e.target.value)}
                  aria-invalid={validation.fields.points || undefined}
                  className="h-9 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qb-add-time" className="text-xs text-zinc-700 dark:text-zinc-300">
                Time limit
              </Label>
              <Select value={form.timeLimitSec} onValueChange={(v) => setField("timeLimitSec", v)}>
                <SelectTrigger id="qb-add-time" className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-xs">
                  <SelectValue placeholder="Time limit" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_LIMIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qb-add-hint" className="text-xs text-zinc-700 dark:text-zinc-300">
                Hint <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
              </Label>
              <Input
                id="qb-add-hint"
                value={form.hint}
                onChange={(e) => setField("hint", e.target.value)}
                placeholder="Shown if candidates get stuck"
                className="h-9 border-zinc-300 dark:border-zinc-700 bg-card text-xs"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="qb-add-description" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Description
                </Label>
                <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{form.description.trim().length}/8000 · min 20</span>
              </div>
              <Textarea
                id="qb-add-description"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder="Full problem statement, constraints and examples…"
                aria-invalid={validation.fields.description || undefined}
                className="min-h-36 border-zinc-300 dark:border-zinc-700 bg-card text-sm"
              />
            </div>

            {form.kind === "sql" ? (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="qb-add-schema" className="text-xs text-zinc-700 dark:text-zinc-300">
                      Schema <span className="font-normal text-zinc-500 dark:text-zinc-400">(CREATE TABLE)</span>
                    </Label>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{form.schemaSql.trim().length}/20000 · min 5</span>
                  </div>
                  <Textarea
                    id="qb-add-schema"
                    value={form.schemaSql}
                    onChange={(e) => setField("schemaSql", e.target.value)}
                    placeholder="CREATE TABLE dept (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"
                    aria-invalid={validation.fields.schemaSql || undefined}
                    className="min-h-32 border-zinc-800 bg-zinc-950 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="qb-add-seed" className="text-xs text-zinc-700 dark:text-zinc-300">
                      Seed data <span className="font-normal text-zinc-500 dark:text-zinc-400">(INSERT, optional)</span>
                    </Label>
                    <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{form.seedSql.trim().length}/20000</span>
                  </div>
                  <Textarea
                    id="qb-add-seed"
                    value={form.seedSql}
                    onChange={(e) => setField("seedSql", e.target.value)}
                    placeholder="INSERT INTO dept (name) VALUES ('Eng'), ('Sales');"
                    aria-invalid={validation.fields.seedSql || undefined}
                    className="min-h-32 border-zinc-800 bg-zinc-950 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="qb-add-solution" className="text-xs text-zinc-700 dark:text-zinc-300">
                      Reference solution <span className="font-normal text-zinc-500 dark:text-zinc-400">(SELECT)</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">{form.solutionSql.trim().length}/10000</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runSolution()}
                        disabled={sqlRun.status === "running" || !form.schemaSql.trim() || !form.solutionSql.trim()}
                        title={
                          form.schemaSql.trim() && form.solutionSql.trim()
                            ? "Run against a fresh in-memory SQLite database"
                            : "Schema and reference solution are required to run"
                        }
                        className="h-7 gap-1.5 border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        {sqlRun.status === "running" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Run solution
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="qb-add-solution"
                    value={form.solutionSql}
                    onChange={(e) => setField("solutionSql", e.target.value)}
                    placeholder="SELECT d.name, COUNT(*) AS headcount FROM emp e JOIN dept d ON d.id = e.dept_id GROUP BY d.name;"
                    aria-invalid={validation.fields.solutionSql || undefined}
                    className="min-h-32 border-zinc-800 bg-zinc-950 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Runs against a fresh in-memory SQLite database built from the schema
                    {runSetup ? `, seed and test ${runTestIdx + 1} setup` : " and seed"} — "Derive expected from result"
                    writes the rows into test {runTestIdx + 1}.
                  </p>

                  {sqlRun.status === "error" && (
                    <p className="rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-400" role="alert">
                      {sqlRun.error}
                    </p>
                  )}
                  {sqlRun.status === "ok" && (
                    <div className="space-y-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          Run result
                        </p>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          Derived
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">{sqlRun.rowCount} rows</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={deriveExpected}
                          disabled={!form.tests[runTestIdx]}
                          title={`Writes the derived rows into test ${runTestIdx + 1}`}
                          className="ml-auto h-7 gap-1.5 border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                          Derive expected from result
                        </Button>
                      </div>
                      <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        columns: {sqlRun.columns.length > 0 ? sqlRun.columns.join(" · ") : "—"}
                      </p>
                      <SqlRowsTable columns={sqlRun.columns} rows={sqlRun.rows} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="qb-add-starter" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Starter code <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                </Label>
                <Textarea
                  id="qb-add-starter"
                  value={form.starterCode}
                  onChange={(e) => setField("starterCode", e.target.value)}
                  placeholder="var twoSum = function(nums, target) {…}"
                  className="min-h-28 border-zinc-800 bg-zinc-950 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
                />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Optional — generated automatically from the function name and first test when left blank.
                </p>
              </div>
            )}
          </div>

          {/* tests editor */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Test cases (1–10)</p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {form.kind === "sql"
                  ? "expected is the result rows (an array of row arrays) the solution must return; setup SQL runs before the test. JSON only."
                  : "args is the argument array passed to your function; expected is the return value. JSON only."}
              </p>
            </div>
            {form.tests.map((t, i) => {
              const p = testParse[i];
              return (
                <div key={i} className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-2.5" onFocus={() => setSqlRunTest(i)}>
                  {form.kind === "sql" ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Textarea
                          value={t.expected}
                          onChange={(e) => updateTest(i, { expected: e.target.value })}
                          placeholder='[["Eng", 120], ["Sales", 70]]'
                          aria-label={`Test ${i + 1} expected result rows (JSON array of row arrays)`}
                          aria-invalid={p.expectedError ? true : undefined}
                          className="min-h-16 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-[11px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        {p.expectedError && <p className="text-[10px] text-rose-600 dark:text-rose-400">expected: {p.expectedError}</p>}
                      </div>
                      <div className="space-y-1">
                        <Input
                          value={t.setup}
                          onChange={(e) => updateTest(i, { setup: e.target.value })}
                          placeholder="Setup SQL — runs before this test (optional)"
                          aria-label={`Test ${i + 1} setup SQL (optional)`}
                          aria-invalid={p.setupError ? true : undefined}
                          className="h-8 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-[11px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        {p.setupError && <p className="text-[10px] text-rose-600 dark:text-rose-400">setup: {p.setupError}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                            <Switch
                              checked={t.unordered}
                              onCheckedChange={(v) => updateTest(i, { unordered: v })}
                              aria-label={`Ignore row order for test ${i + 1}`}
                            />
                            ignore row order
                          </span>
                          <span className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                            <Switch
                              checked={t.hidden}
                              onCheckedChange={(v) => updateTest(i, { hidden: v })}
                              aria-label={`Hide test ${i + 1} from candidates`}
                            />
                            hidden
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTest(i)}
                          aria-label={`Remove test ${i + 1}`}
                          className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          value={t.args}
                          onChange={(e) => updateTest(i, { args: e.target.value })}
                          placeholder="[[2,7,11,15], 9]"
                          aria-label={`Test ${i + 1} arguments (JSON array)`}
                          aria-invalid={p.argsError ? true : undefined}
                          className="h-8 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-[11px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        {p.argsError && <p className="text-[10px] text-rose-600 dark:text-rose-400">args: {p.argsError}</p>}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          value={t.expected}
                          onChange={(e) => updateTest(i, { expected: e.target.value })}
                          placeholder="[0,1]"
                          aria-label={`Test ${i + 1} expected return value (JSON)`}
                          aria-invalid={p.expectedError ? true : undefined}
                          className="h-8 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-[11px] placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                        />
                        {p.expectedError && <p className="text-[10px] text-rose-600 dark:text-rose-400">expected: {p.expectedError}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <span className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
                          <Switch
                            checked={t.hidden}
                            onCheckedChange={(v) => updateTest(i, { hidden: v })}
                            aria-label={`Hide test ${i + 1} from candidates`}
                          />
                          hidden
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTest(i)}
                          aria-label={`Remove test ${i + 1}`}
                          className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTest}
              disabled={form.tests.length >= 10}
              className="h-8 gap-1.5 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <Plus className="h-3 w-3" /> Add test
            </Button>
          </div>

          {/* save row — inline errors above the button */}
          <div className="space-y-2 border-t border-border pt-4">
            {(serverError || validation.summary) && (
              <p className="text-xs text-rose-700 dark:text-rose-400" role="alert">
                {serverError ?? validation.summary}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(false)}
                disabled={saving}
                className="border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={!validation.valid || saving}
                className="sp-press gap-1.5 px-4 text-xs font-semibold"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save question"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* import-from-pdf dialog */}
      <Dialog
        open={pdfOpen}
        onOpenChange={(open) => {
          setPdfOpen(open);
          if (!open) resetPdfImport();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base text-zinc-900 dark:text-zinc-100">Import MCQs from a PDF</DialogTitle>
            <DialogDescription>
              Upload a question paper PDF — the text is scanned for multiple-choice questions, then you pick what to save into the bank.
            </DialogDescription>
          </DialogHeader>

          {pdfStage === "extracting" ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400 dark:text-zinc-400" />
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Extracting multiple-choice questions…
              </p>
              <p className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-400">
                {pdfElapsed}s elapsed · the AI pass can take up to ~30s
              </p>
            </div>
          ) : pdfStage === "preview" && pdfResult ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {pdfResult.questions.length} questions found · source:{" "}
                  {pdfResult.source === "ai" ? "AI extraction" : "text patterns"} ·{" "}
                  <span className="normal-case tracking-normal">{pdfResult.fileName}</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPdfSelected(
                      pdfSelected.size === pdfResult.questions.length
                        ? new Set<number>()
                        : new Set(pdfResult.questions.map((_, i) => i))
                    )
                  }
                  className="h-7 shrink-0 border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {pdfSelected.size === pdfResult.questions.length ? "Clear all" : "Select all"}
                </Button>
              </div>

              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {pdfResult.questions.map((q, i) => {
                  const checked = pdfSelected.has(i);
                  return (
                    <div
                      key={i}
                      onClick={() => togglePdfSelected(i)}
                      className={cn(
                        "cursor-pointer rounded-md border p-2.5 transition-colors",
                        checked ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40" : "border-zinc-200 dark:border-zinc-700 bg-card hover:border-zinc-300 dark:hover:border-zinc-600"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePdfSelected(i)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Include question ${i + 1}`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">{q.title}</p>
                          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
                            {q.options.map((opt, oi) => {
                              const correct = oi === q.answerIndex;
                              return (
                                <p
                                  key={oi}
                                  className={cn(
                                    "flex min-w-0 items-start gap-1.5 text-xs",
                                    correct ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400"
                                  )}
                                >
                                  <span className="mt-px shrink-0 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1 font-mono text-[9px] leading-4 text-zinc-600 dark:text-zinc-300">
                                    {String.fromCharCode(65 + oi)}
                                  </span>
                                  <span className="min-w-0 break-words">{opt}</span>
                                  {correct && <Check className="mt-px h-3 w-3 shrink-0" aria-label="Correct answer" />}
                                </p>
                              );
                            })}
                          </div>
                          <p className="flex flex-wrap items-center gap-1">
                            <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-px font-mono text-[9px] text-zinc-600 dark:text-zinc-300">
                              {q.topic}
                            </span>
                            <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-px font-mono text-[9px] text-zinc-600 dark:text-zinc-300">
                              {q.difficulty}
                            </span>
                            {q.explanation && (
                              <span className="w-full text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">{q.explanation}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {pdfError && (
                  <p className="text-xs text-rose-700 dark:text-rose-400" role="alert">
                    {pdfError}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPdfResult(null);
                      setPdfSelected(new Set());
                      setPdfStage("upload");
                    }}
                    disabled={pdfBusy}
                    className="text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Discard
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void runPdfImport()}
                    disabled={pdfSelected.size === 0 || pdfBusy}
                    className="sp-press gap-1.5 px-4 text-xs font-semibold"
                  >
                    {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                    Import {pdfSelected.size} of {pdfResult.questions.length} questions
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* drop zone */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => pdfInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pdfInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setPdfDragOver(true);
                }}
                onDragLeave={() => setPdfDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPdfDragOver(false);
                  acceptPdfFile(e.dataTransfer.files?.[0]);
                }}
                aria-label="Upload a question paper PDF"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
                  pdfDragOver ? "border-[#5c7250] bg-[#5c7250]/5 dark:bg-[#5c7250]/15" : "border-zinc-300 dark:border-zinc-700 hover:border-[#5c7250]/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                )}
              >
                <FileUp className={cn("h-5 w-5", pdfDragOver ? "text-[#5c7250] dark:text-[#a9c29b]" : "text-zinc-400 dark:text-zinc-400")} />
                {pdfFile ? (
                  <div className="min-w-0 space-y-0.5">
                    <p className="max-w-full truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={pdfFile.name}>
                      {pdfFile.name}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      {fmtBytes(pdfFile.size)} · click to choose another file
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Drop a question paper PDF here, or <span className="font-medium text-[#5c7250] dark:text-[#a9c29b]">browse</span>
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                      text-based pdf · max 8 mb
                    </p>
                  </>
                )}
              </div>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => acceptPdfFile(e.target.files?.[0])}
              />

              <div className="space-y-1.5">
                <Label htmlFor="qb-pdf-skill" className="text-xs text-zinc-700 dark:text-zinc-300">
                  Skill for imported questions
                </Label>
                <Select value={pdfSkill} onValueChange={setPdfSkill}>
                  <SelectTrigger id="qb-pdf-skill" className="h-9 w-full border-zinc-300 dark:border-zinc-700 bg-card text-xs sm:w-[240px]">
                    <SelectValue placeholder="Skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {pdfSkillOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  Applied to the whole import — each question keeps its own topic and difficulty.
                </p>
              </div>

              {pdfError && (
                <p className="rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-400" role="alert">
                  {pdfError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPdfOpen(false)}
                  disabled={pdfBusy}
                  className="border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void runPdfExtract()}
                  disabled={!pdfFile || pdfBusy}
                  className="sp-press gap-1.5 px-4 text-xs font-semibold"
                >
                  {pdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}
                  Extract questions
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
