"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  Compass,
  Gauge,
  RefreshCw,
  Download,
  Search,
  SearchX,
  Scale,
} from "lucide-react";

// ─── Types (GET /api/questions/stats payload) ───────────────────────────────

type FlagTone = "hot" | "brutal" | "balanced" | "nodata";

interface CalibRow {
  questionId: string;
  title: string;
  skill: string;
  category: string;
  difficulty: string;
  points: number;
  source: string;
  exposures: number;
  solved: number;
  failed: number;
  skipped: number;
  solveRate: number;
  avgScore: number | null;
  medianSec: number | null;
  avgSec: number | null;
  avgLimitSec: number | null;
  pace: number | null;
  avgAttempts: number | null;
  avgHints: number | null;
  flag: { label: string; tone: FlagTone };
}

interface CalibSummary {
  exercised: number;
  silent: number;
  totalQuestions: number;
  totalDeals: number;
  tooEasy: number;
  tooBrutal: number;
  balanced: number;
  medianSolveRate: number | null;
  medianPace: number | null;
}

// ─── Small visual atoms ─────────────────────────────────────────────────────

const FLAG_STYLE: Record<FlagTone, string> = {
  hot: "border-amber-600/40 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400",
  brutal: "border-rose-600/40 dark:border-rose-500/50 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400",
  balanced: "border-emerald-700/30 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400",
  nodata: "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400",
};

function FlagBadge({ tone, label }: { tone: FlagTone; label: string }) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em]",
        FLAG_STYLE[tone]
      )}
    >
      {label}
    </span>
  );
}

const CATEGORY_PILL: Record<string, string> = {
  coding: "border-zinc-950 dark:border-zinc-100 bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950",
  debugging: "border-amber-700/50 dark:border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400",
  mcq: "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-300",
};

const DIFFICULTY_PILL: Record<string, string> = {
  easy: "border-emerald-700/40 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-400",
  medium: "border-amber-700/50 dark:border-amber-500/50 text-amber-800 dark:text-amber-400",
  hard: "border-rose-600/50 dark:border-rose-500/60 text-rose-800 dark:text-rose-400",
};

function CategoryPill({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-block border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em]",
        CATEGORY_PILL[value] ?? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-300"
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
        "inline-block border px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em]",
        DIFFICULTY_PILL[value] ?? "border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
      )}
    >
      {value}
    </span>
  );
}

/** Solve-rate ink gauge — hairline track, ink fill, sage reading edge. */
function RateGauge({ rate }: { rate: number }) {
  const pct = Math.max(3, Math.min(100, Math.round(rate * 100)));
  return (
    <span className="relative inline-block h-[4px] w-16 shrink-0 bg-zinc-200 dark:bg-zinc-800 align-middle" aria-hidden>
      <span
        className={cn(
          "absolute inset-y-0 left-0",
          rate >= 0.9 ? "bg-amber-500" : rate <= 0.2 ? "bg-rose-500" : "bg-zinc-800 dark:bg-zinc-100"
        )}
        style={{ width: `${pct}%` }}
      />
      <span
        className="absolute inset-y-[-1px] w-[1.5px] bg-[#5c7250]"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
    </span>
  );
}

/** Pace bar — how much of the time limit candidates used on average.
 *  Scale caps at 1.25× limit; the hairline tick marks the 1.0× limit. */
function PaceBar({ pace }: { pace: number }) {
  const capped = Math.max(0.04, Math.min(1.25, pace));
  const width = (capped / 1.25) * 100;
  const over = pace > 1.0;
  return (
    <span className="relative inline-block h-[4px] w-16 shrink-0 bg-zinc-200 dark:bg-zinc-800 align-middle" aria-hidden>
      <span
        className={cn("absolute inset-y-0 left-0", over ? "bg-[#5c7250]" : "bg-zinc-700 dark:bg-zinc-400")}
        style={{ width: `${width}%` }}
      />
      <span className="absolute inset-y-[-2px] w-px bg-zinc-500/70 dark:bg-zinc-400/70" style={{ left: "80%" }} />
    </span>
  );
}

const fmtSec = (s: number | null): string =>
  s == null ? "—" : s < 60 ? `${s}s` : `${Math.round(s / 60)}m${s % 60 !== 0 ? ` ${s % 60}s` : ""}`;

const SORTS = [
  { id: "exposures", label: "Most exposed" },
  { id: "solveRate", label: "Solve rate" },
  { id: "pace", label: "Pace vs limit" },
  { id: "attempts", label: "Attempt pressure" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

// ─── The view ───────────────────────────────────────────────────────────────

/**
 * Calibration — the question bank weighed by real candidate outcomes.
 * Recruiter-facing psychometrics: which questions carry signal (balanced),
 * which burn time (too easy) and which crush everyone (too brutal).
 */
export function CalibrationView() {
  const [rows, setRows] = useState<CalibRow[] | null>(null);
  const [summary, setSummary] = useState<CalibSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const [query, setQuery] = useState("");
  const [flag, setFlag] = useState("all");
  const [sort, setSort] = useState<SortId>("exposures");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const res = await fetch("/api/questions/stats", { cache: "no-store" });
      if (res.status === 403) throw new Error("recruiter access required");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { rows: CalibRow[]; summary: CalibSummary };
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setStatus("ready");
    } catch (err) {
      if (mode === "refresh") {
        toast.error(`Could not refresh calibration data (${err instanceof Error ? err.message : "network error"})`);
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
    let list = rows ?? [];
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.skill.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }
    if (flag !== "all") list = list.filter((r) => r.flag.tone === flag);
    const key = (r: CalibRow): number => {
      switch (sort) {
        case "solveRate":
          return r.exposures >= 3 ? r.solveRate : -1; // thin-data rows sink
        case "pace":
          return r.pace ?? -1;
        case "attempts":
          return r.avgAttempts ?? -1;
        default:
          return r.exposures;
      }
    };
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, query, flag, sort]);

  if (status === "loading") {
    return (
      <div className="space-y-3" aria-label="Loading calibration data">
        <div className="h-3 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <SearchX className="h-8 w-8 text-zinc-400 dark:text-zinc-400" />
          <p className="text-sm text-muted-foreground">Calibration data could not be loaded.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStatus("loading");
              void load();
            }}
            className="mt-1 h-8 border-zinc-300 dark:border-zinc-700 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.exercised === 0) {
    return (
      <div className="space-y-4">
        {/* header */}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              <Scale className="h-4 w-4 text-[#5c7250] dark:text-[#a9c29b]" aria-hidden />
              Calibration
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              The bank weighed by real outcomes — spot questions everyone solves (low signal), everyone fails
              (high attrition), and the ones carrying real discrimination.
            </p>
          </div>
        </div>
        <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Compass className="h-8 w-8 text-zinc-400 dark:text-zinc-400" />
            <p className="text-sm text-muted-foreground">No calibration data yet.</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Run a few verifications — every dealt question lands here with its solve rate, pace and pressure.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            <Scale className="h-4 w-4 text-[#5c7250] dark:text-[#a9c29b]" aria-hidden />
            Calibration
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            The bank weighed by real outcomes — spot questions everyone solves (low signal), everyone fails
            (high attrition), and the ones carrying real discrimination.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => void load("refresh")}
            disabled={refreshing}
            aria-label="Refresh calibration data"
            title="Refresh calibration data"
            className="h-9 w-9 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          </Button>
          <a
            href="/api/questions/stats?format=csv"
            download
            aria-label="Export calibration sheet as CSV"
            title="Export the calibration sheet as a spreadsheet-friendly CSV"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-card px-3",
              "text-xs font-medium text-zinc-600 dark:text-zinc-300 transition-colors hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/30 dark:focus-visible:ring-zinc-100/20"
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
        </div>
      </div>

      {(
        <>
          {/* ── summary strip ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Questions exercised",
                value: `${summary.exercised}`,
                sub: `${summary.silent} of ${summary.totalQuestions} never dealt`,
              },
              {
                label: "Deals on record",
                value: `${summary.totalDeals}`,
                sub: "question × completed run",
              },
              {
                label: "Median solve rate",
                value:
                  summary.medianSolveRate != null ? `${Math.round(summary.medianSolveRate * 100)}%` : "—",
                sub: "questions with ≥2 exposures",
              },
              {
                label: "Median pace",
                value: summary.medianPace != null ? `${summary.medianPace}×` : "—",
                sub: "of limit · coding & debugging",
              },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card className="rounded-lg border-border bg-card shadow-none">
                  <CardContent className="p-3 sm:p-4">
                    <p className="truncate text-xs text-muted-foreground">{s.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{s.value}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ── flag legend + filters ──────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 dark:border-zinc-700 pb-3">
            <p className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              <Gauge className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" aria-hidden />
              Reading:
              <FlagBadge tone="hot" label={`too easy · ${summary.tooEasy}`} />
              <FlagBadge tone="balanced" label={`balanced · ${summary.balanced}`} />
              <FlagBadge tone="brutal" label={`too brutal · ${summary.tooBrutal}`} />
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <span className="text-zinc-400 dark:text-zinc-400">flags need ≥2 exposures</span>
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title or skill…"
                  aria-label="Search calibration rows"
                  className="h-9 w-[200px] border-zinc-300 dark:border-zinc-700 pl-8 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
              </div>
              <Select value={flag} onValueChange={setFlag}>
                <SelectTrigger
                  className={cn(
                    "h-9 w-[150px] border bg-card text-xs",
                    flag !== "all" ? "border-zinc-950 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                  )}
                  aria-label="Filter by calibration flag"
                >
                  <SelectValue placeholder="Flag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All flags</SelectItem>
                  <SelectItem value="hot">Too easy</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="brutal">Too brutal</SelectItem>
                  <SelectItem value="nodata">Thin data</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortId)}>
                <SelectTrigger
                  className="h-9 w-[170px] border border-zinc-300 dark:border-zinc-700 bg-card text-xs text-zinc-700 dark:text-zinc-300"
                  aria-label="Sort calibration rows"
                >
                  <span className="flex items-center gap-1.5">
                    <ArrowDownWideNarrow className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" />
                    <SelectValue placeholder="Sort" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── table ──────────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <SearchX className="h-8 w-8 text-zinc-400 dark:text-zinc-400" />
                <p className="text-sm text-muted-foreground">No questions match the current filters.</p>
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
                      <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Exposed
                      </TableHead>
                      <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Solve rate
                      </TableHead>
                      <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Median time
                      </TableHead>
                      <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Pace
                      </TableHead>
                      <TableHead className="px-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Pressure
                      </TableHead>
                      <TableHead className="px-2 pr-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Verdict
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r, i) => (
                      <motion.tr
                        key={r.questionId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.2), duration: 0.25 }}
                        className="border-b border-zinc-200 dark:border-zinc-700 transition-colors last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      >
                        <TableCell className="max-w-[280px] py-2.5 pl-3 pr-2">
                          <p className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100" title={r.title}>
                            {r.title}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                              {r.skill}
                            </span>
                            <CategoryPill value={r.category} />
                            <DifficultyPill value={r.difficulty} />
                          </p>
                        </TableCell>
                        <TableCell className="px-2">
                          <span className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-300">{r.exposures}</span>
                          <span className="ml-1 hidden font-mono text-[10px] text-zinc-400 dark:text-zinc-400 xl:inline">
                            {r.skipped > 0 ? `· ${r.skipped} skipped` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="px-2">
                          <span className="flex items-center gap-2">
                            <RateGauge rate={r.solveRate} />
                            <span className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-300">
                              {Math.round(r.solveRate * 100)}%
                            </span>
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">
                            {r.solved}/{r.exposures} solved{r.failed > 0 ? ` · ${r.failed} failed` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="px-2">
                          <span className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-300">{fmtSec(r.medianSec)}</span>
                          <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">
                            limit {fmtSec(r.avgLimitSec)}
                          </span>
                        </TableCell>
                        <TableCell className="px-2">
                          {r.pace != null ? (
                            <span className="flex items-center gap-2">
                              <PaceBar pace={r.pace} />
                              <span
                                className={cn(
                                  "font-mono text-xs tabular-nums",
                                  r.pace > 1 ? "text-[#5c7250] dark:text-[#a9c29b]" : "text-zinc-800 dark:text-zinc-300"
                                )}
                              >
                                {r.pace.toFixed(2)}×
                              </span>
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2">
                          <span className="font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-300">
                            {r.avgAttempts != null ? `${r.avgAttempts.toFixed(1)} runs` : "—"}
                          </span>
                          <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">
                            {r.avgHints != null ? `${r.avgHints.toFixed(1)} hints` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 pr-3">
                          <FlagBadge tone={r.flag.tone} label={r.flag.label} />
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
            Solved = all tests passed · pace = average time spent ÷ effective limit · pressure = test runs and
            hints per question
          </p>
          <p className="border-l-2 border-[#5c7250]/40 pl-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            Dealing is exposure-balanced: the dealer draws each new question from the least-dealt tier of its pool
            (random among ties), so wear spreads across the bank instead of pooling on a familiar few. Silent
            questions drain down as runs accumulate — and thin-data verdicts firm up with every exposure.
          </p>
        </>
      )}
    </div>
  );
}
