"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EvidenceBar, scoreColor } from "@/components/skillproof/shared";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { CandidateRow } from "@/components/skillproof/recruiter-dashboard";
import { PIPELINE_STAGES } from "@/components/skillproof/recruiter-dashboard";
import { pipelineMetaSummary, type PipelineMeta } from "@/lib/pipeline-meta";
import {
  Award,
  BarChart3,
  Crown,
  Download,
  Filter,
  Gauge,
  GitBranch,
  GraduationCap,
  LayoutGrid,
  Layers,
  LineChart,
  ShieldCheck,
  Timer,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

/**
 * Recruiter Insights — aggregate analytics over all candidates.
 * Purely client-side: computed from the candidates list payload.
 */

const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: "0–20", min: 0, max: 20 },
  { label: "21–40", min: 21, max: 40 },
  { label: "41–60", min: 41, max: 60 },
  { label: "61–80", min: 61, max: 80 },
  { label: "81–100", min: 81, max: 100 },
];

const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function InsightsPanel({ rows }: { rows: CandidateRow[] | null }) {
  const stats = useMemo(() => {
    const list = (rows ?? []).filter((r) => !r.archived);
    const verified = list.filter((r) => r.overall != null);
    const highConf = verified.filter((r) => r.confidence === "HIGH");
    const lowRisk = verified.filter((r) => (r.aiRisk ?? 100) <= 30);
    const avg = verified.length
      ? Math.round(verified.reduce((a, r) => a + (r.overall ?? 0), 0) / verified.length)
      : 0;

    const dist = BUCKETS.map((b) => ({
      ...b,
      count: verified.filter((r) => (r.overall ?? 0) >= b.min && (r.overall ?? 0) <= b.max).length,
    }));

    // per-skill benchmark across verified profiles
    const skillMap = new Map<string, { total: number; n: number; best: { name: string; score: number } | null }>();
    for (const r of verified) {
      for (const s of r.skills) {
        if (!s.assessed) continue;
        const cur = skillMap.get(s.skill) ?? { total: 0, n: 0, best: null };
        cur.total += s.score;
        cur.n += 1;
        if (!cur.best || s.score > cur.best.score) cur.best = { name: r.name, score: s.score };
        skillMap.set(s.skill, cur);
      }
    }
    const skills = Array.from(skillMap.entries())
      .map(([skill, v]) => ({ skill, avg: Math.round(v.total / v.n), n: v.n, best: v.best }))
      .sort((a, b) => b.avg - a.avg);

    const confMix = ["HIGH", "MEDIUM", "LOW"].map((c) => ({
      label: c,
      count: verified.filter((r) => r.confidence === c).length,
    }));

    const riskMix = [
      { label: "Low (≤30%)", min: 0, max: 30, color: "#059669" },
      { label: "Watch (31–45%)", min: 31, max: 45, color: "#d97706" },
      { label: "High (>45%)", min: 46, max: 100, color: "#e11d48" },
    ].map((b) => ({
      ...b,
      count: verified.filter((r) => r.aiRisk != null && r.aiRisk >= b.min && r.aiRisk <= b.max).length,
    }));

    // top performers leaderboard (top 5 verified by overall)
    const leaders = [...verified]
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())
      .slice(0, 5);

    // category benchmark — average per category across verified profiles
    const catKeys = [
      "problemSolving",
      "debugging",
      "efficiency",
      "codeQuality",
      "explanation",
      "timeManagement",
      "consistency",
    ] as const;
    const withCats = verified.filter((r) => r.categories);
    const categoryAvg = catKeys
      .map((k) => ({
        key: k,
        label: k.replace(/([A-Z])/g, " $1").trim(),
        avg: withCats.length ? Math.round(withCats.reduce((a, r) => a + (r.categories![k] ?? 0), 0) / withCats.length) : 0,
        n: withCats.length,
      }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.avg - a.avg);

    // difficulty performance — pooled per-difficulty question counts + avg scores
    const diffKeys = ["easy", "medium", "hard"] as const;
    const withMix = verified.filter((r) => r.difficultyMix);
    const difficulty = {
      profiles: withMix.length,
      total: 0 as number,
      rows: diffKeys.map((d) => {
        const n = withMix.reduce((a, r) => a + (r.difficultyMix![d]?.n ?? 0), 0);
        const scored = withMix.filter((r) => r.difficultyMix![d]?.score != null);
        const avgScore = scored.length
          ? Math.round(scored.reduce((a, r) => a + (r.difficultyMix![d]!.score ?? 0), 0) / scored.length)
          : null;
        return { key: d, n, avgScore };
      }),
    };
    difficulty.total = difficulty.rows.reduce((a, d) => a + d.n, 0);

    // score trend — every completed verification run across active profiles (oldest → newest)
    const trendRuns = list
      .flatMap((r) => r.completedRuns.map((run) => ({ ...run, name: r.name })))
      .sort((a, b) => a.date.localeCompare(b.date));
    const trendDelta =
      trendRuns.length >= 2 ? trendRuns[trendRuns.length - 1].overall - trendRuns[0].overall : null;

    return {
      total: list.length,
      verifiedCount: verified.length,
      highConfCount: highConf.length,
      lowRiskCount: lowRisk.length,
      avg,
      dist,
      skills,
      confMix,
      riskMix,
      leaders,
      categoryAvg,
      difficulty,
      trendRuns,
      trendDelta,
    };
  }, [rows]);

  if (!rows) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="rounded-lg border-border bg-card shadow-none">
            <CardContent className="p-6">
              <div className="sp-shimmer h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="sp-shimmer mt-4 h-24 rounded bg-zinc-100 dark:bg-zinc-800" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (stats.verifiedCount === 0) {
    return (
      <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <LineChart className="h-8 w-8 text-zinc-400 dark:text-zinc-400" />
          <p className="text-sm text-muted-foreground">
            Insights appear once candidates complete verifications. Run an assessment from the candidate flow.
          </p>
        </CardContent>
      </Card>
    );
  }

  const funnel = [
    { label: "Candidates", count: stats.total, icon: <Users className="h-3.5 w-3.5" />, color: "text-zinc-500 dark:text-zinc-400" },
    { label: "Verified profiles", count: stats.verifiedCount, icon: <ShieldCheck className="h-3.5 w-3.5" />, color: "text-emerald-700 dark:text-emerald-400" },
    { label: "High confidence", count: stats.highConfCount, icon: <GraduationCap className="h-3.5 w-3.5" />, color: "text-sky-700" },
    { label: "Low AI risk", count: stats.lowRiskCount, icon: <Gauge className="h-3.5 w-3.5" />, color: "text-amber-700 dark:text-amber-400" },
  ];

  const distMax = Math.max(1, ...stats.dist.map((d) => d.count));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* verification funnel */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="md:col-span-2">
        <Card className="rounded-lg border-border bg-card shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4 text-muted-foreground" /> Verification funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2.5 sm:grid-cols-4">
              {funnel.map((f, i) => {
                const pct = stats.total ? Math.round((f.count / stats.total) * 100) : 0;
                return (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07, duration: 0.35 }}
                    className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3"
                  >
                    <p className={cn("flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]", f.color)}>
                      {f.icon} {f.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">{f.count}</p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <motion.div
                        className="h-full rounded-full bg-emerald-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{pct}% of candidates</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* score trend over time (full width) */}
      {stats.trendRuns.length > 0 && (
        <motion.div {...fadeUp} transition={{ delay: 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="md:col-span-2">
          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <LineChart className="h-4 w-4 text-muted-foreground" /> Score trend
                <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">every completed verification run, oldest → newest</span>
                {stats.trendDelta != null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto gap-1 border text-xs",
                      stats.trendDelta > 0 && "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
                      stats.trendDelta < 0 && "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400",
                      stats.trendDelta === 0 && "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                    )}
                  >
                    {stats.trendDelta > 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : stats.trendDelta < 0 ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <LineChart className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(stats.trendDelta)} since first run
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreTrendChart runs={stats.trendRuns} avg={stats.avg} />
              <ActivityHeatmap runs={stats.trendRuns} />
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* pipeline health — stage distribution, decision velocity & recent activity (full width) */}
      {stats.total > 0 && <PipelineHealthCard rows={rows} />}

      {/* score distribution */}
      <motion.div {...fadeUp} transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="h-full rounded-lg border-border bg-card shadow-none transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" /> Score distribution
              </span>
              <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400">
                avg {stats.avg}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.dist.map((b, i) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="w-14 text-right font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{b.label}</span>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <motion.div
                    className="flex h-full items-center justify-end rounded-md pr-1.5"
                    style={{ backgroundColor: `${scoreColor((b.min + b.max) / 2)}33`, borderRight: `2px solid ${scoreColor((b.min + b.max) / 2)}` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(b.count ? 8 : 0, (b.count / distMax) * 100)}%` }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="font-mono text-[11px] font-semibold" style={{ color: scoreColor((b.min + b.max) / 2) }}>
                      {b.count || ""}
                    </span>
                  </motion.div>
                </div>
              </div>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">Overall verified scores across {stats.verifiedCount} profile{stats.verifiedCount === 1 ? "" : "s"}.</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* skill benchmark */}
      <motion.div {...fadeUp} transition={{ delay: 0.14, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="h-full rounded-lg border-border bg-card shadow-none transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4 text-muted-foreground" /> Skill benchmark
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.skills.length === 0 && (
              <p className="text-xs text-muted-foreground">No assessed skills yet.</p>
            )}
            {stats.skills.slice(0, 6).map((s, i) => (
              <div key={s.skill} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {s.skill} <span className="text-[10px] text-zinc-500 dark:text-zinc-400">· {s.n} candidate{s.n === 1 ? "" : "s"}</span>
                  </p>
                  <span className="font-mono text-xs font-semibold" style={{ color: scoreColor(s.avg) }}>
                    {s.avg}
                  </span>
                </div>
                <EvidenceBar score={s.avg} height="h-1.5" />
                {s.best && (
                  <p className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                    <Award className="h-3 w-3 text-amber-600 dark:text-amber-400" /> best: {s.best.name} ({s.best.score})
                  </p>
                )}
                {i === 0 && stats.skills.length > 1 && <div className="pt-1" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* difficulty performance */}
      <motion.div {...fadeUp} transition={{ delay: 0.17, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="h-full rounded-lg border-border bg-card shadow-none transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" /> Difficulty performance
              </span>
              {stats.difficulty.profiles > 0 && (
                <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {stats.difficulty.total} question{stats.difficulty.total === 1 ? "" : "s"} · {stats.difficulty.profiles} profile
                  {stats.difficulty.profiles === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* question mix stacked bar */}
            {stats.difficulty.total > 0 && (
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                {stats.difficulty.rows.map((d, i) => (
                  <motion.div
                    key={d.key}
                    className="h-full"
                    style={{
                      backgroundColor:
                        d.key === "easy" ? "#059669" : d.key === "medium" ? "#d97706" : "#e11d48",
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(d.n / Math.max(1, stats.difficulty.total)) * 100}%` }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  />
                ))}
              </div>
            )}
            {stats.difficulty.rows.map((d, i) => {
              const color = d.key === "easy" ? "#059669" : d.key === "medium" ? "#d97706" : "#e11d48";
              const share = stats.difficulty.total ? Math.round((d.n / stats.difficulty.total) * 100) : 0;
              return (
                <div key={d.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs capitalize text-zinc-900 dark:text-zinc-100">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      {d.key}
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        · {d.n} asked ({share}%)
                      </span>
                    </p>
                    <span className="font-mono text-xs font-semibold" style={{ color: d.avgScore != null ? scoreColor(d.avgScore) : "#71717a" }}>
                      {d.avgScore != null ? `avg ${d.avgScore}` : "—"}
                    </span>
                  </div>
                  {d.avgScore != null && <EvidenceBar score={d.avgScore} height="h-1.5" />}
                  {i === stats.difficulty.rows.length - 1 && stats.difficulty.total > 0 && (
                    <p className="pt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                      Average scores per difficulty — if hard-problem averages trail easy ones by a lot, assessments
                      may be front-loaded.
                    </p>
                  )}
                </div>
              );
            })}
            {stats.difficulty.total === 0 && (
              <p className="text-xs text-muted-foreground">Difficulty breakdown appears once candidates complete verifications.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* top performers leaderboard */}
      <motion.div {...fadeUp} transition={{ delay: 0.18, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="h-full rounded-lg border-border bg-card shadow-none transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-muted-foreground" /> Top performers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {stats.leaders.length === 0 && <p className="text-xs text-muted-foreground">No verified profiles yet.</p>}
            {stats.leaders.map((r, i) => {
              const medal =
                i === 0 ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700" :
                i === 1 ? "text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700" :
                i === 2 ? "text-orange-700 bg-orange-50 border-orange-300" :
                "text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200 dark:border-zinc-700";
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.22 + i * 0.05, duration: 0.3 }}
                  className={cn(
                    "flex items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2",
                    i < 3 ? "bg-zinc-50 dark:bg-zinc-800/40" : "bg-transparent"
                  )}
                >
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold", medal)}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                    <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                      {r.skills.filter((s) => s.assessed).slice(0, 3).map((s) => s.skill).join(" · ") || "—"}
                    </p>
                  </div>
                  {r.confidence === "HIGH" && (
                    <Badge variant="outline" className="hidden border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0 text-[9px] text-emerald-700 dark:text-emerald-400 sm:inline-flex">
                      HIGH conf
                    </Badge>
                  )}
                  <span className="shrink-0 font-mono text-sm font-bold" style={{ color: scoreColor(r.overall ?? 0) }}>
                    {r.overall}
                  </span>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* category benchmark */}
      <motion.div {...fadeUp} transition={{ delay: 0.24, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="h-full rounded-lg border-border bg-card shadow-none transition-colors">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-muted-foreground" /> Category benchmark
              </span>
              {stats.categoryAvg.length > 0 && (
                <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-[10px] text-zinc-500 dark:text-zinc-400">
                  {stats.categoryAvg[0].n} profile{stats.categoryAvg[0].n === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.categoryAvg.length === 0 && (
              <p className="text-xs text-muted-foreground">Category averages appear once verified profiles exist.</p>
            )}
            {stats.categoryAvg.map((c, i) => (
              <div key={c.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs capitalize text-zinc-700 dark:text-zinc-300">{c.label}</p>
                  <span className="font-mono text-xs font-semibold" style={{ color: scoreColor(c.avg) }}>
                    {c.avg}
                  </span>
                </div>
                <EvidenceBar score={c.avg} height="h-1.5" />
                {i === 0 && stats.categoryAvg.length > 1 && (
                  <p className="pt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                    strongest across all candidates — {c.label.toLowerCase()} is the pipeline's collective strength
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* confidence mix */}
      <motion.div {...fadeUp} transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="rounded-lg border-border bg-card shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evidence confidence mix</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfidenceMix mix={stats.confMix} />
          </CardContent>
        </Card>
      </motion.div>

      {/* AI risk profile */}
      <motion.div {...fadeUp} transition={{ delay: 0.26, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
        <Card className="rounded-lg border-border bg-card shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI-assistance risk profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {stats.riskMix.map((b, i) => {
              const pct = stats.verifiedCount ? (b.count / stats.verifiedCount) * 100 : 0;
              return (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-24 text-[11px] text-zinc-600 dark:text-zinc-300">{b.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: b.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(b.count ? 4 : 0, pct)}%` }}
                      transition={{ delay: 0.2 + i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="w-6 text-right font-mono text-[11px]" style={{ color: b.color }}>
                    {b.count}
                  </span>
                </div>
              );
            })}
            <p className="pt-1 text-[11px] italic text-zinc-500 dark:text-zinc-400">
              Risk is a signal, not a verdict — review evidence alongside it.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function ConfidenceMix({ mix }: { mix: Array<{ label: string; count: number }> }) {
  const total = Math.max(1, mix.reduce((a, m) => a + m.count, 0));
  const colors: Record<string, string> = {
    HIGH: "#059669",
    MEDIUM: "#d97706",
    LOW: "#e11d48",
  };
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        {mix.map((m, i) => (
          <motion.div
            key={m.label}
            className="h-full"
            style={{ backgroundColor: colors[m.label] }}
            initial={{ width: 0 }}
            animate={{ width: `${(m.count / total) * 100}%` }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {mix.map((m) => (
          <span key={m.label} className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[m.label] }} />
            {m.label} <span className="font-mono text-zinc-900 dark:text-zinc-100">{m.count}</span>
            <span className="text-zinc-600 dark:text-zinc-300">({Math.round((m.count / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

type TrendRun = { date: string; overall: number; confidence: string | null; name: string };

/** GitHub-style verification activity grid — runs per day over the last 8 weeks. */
function ActivityHeatmap({ runs }: { runs: TrendRun[] }) {
  const cells = useMemo(() => {
    const DAYS = 56; // 8 weeks × 7 days
    const counts = new Map<string, number>();
    const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (const r of runs) {
      const d = new Date(r.date);
      d.setHours(0, 0, 0, 0);
      const key = keyOf(d);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (DAYS - 1 - i));
      return { key: keyOf(d), count: counts.get(keyOf(d)) ?? 0, date: d };
    });
  }, [runs]);

  const activeDays = cells.filter((c) => c.count > 0).length;
  const shade = (n: number) =>
    n === 0 ? "bg-zinc-200/70 dark:bg-zinc-800/70" : n === 1 ? "bg-emerald-200" : n === 2 ? "bg-emerald-400" : "bg-emerald-600";
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="mt-4 rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <LayoutGrid className="h-3 w-3 text-muted-foreground" /> Verification activity — last 8 weeks
        </p>
        <p className="text-[10px] text-zinc-600 dark:text-zinc-300">
          {runs.length} run{runs.length === 1 ? "" : "s"} · {activeDays} active day{activeDays === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`Verification activity heatmap: ${runs.length} runs across ${activeDays} active days in the last 8 weeks`}>
        {cells.map((c) => (
          <div
            key={c.key}
            title={c.count > 0 ? `${c.count} verification run${c.count === 1 ? "" : "s"} — ${fmtDay(c.date)}` : `No runs — ${fmtDay(c.date)}`}
            className={cn("h-3 w-3 rounded-[3px] transition-transform hover:scale-125", shade(c.count))}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-zinc-600 dark:text-zinc-300">
        less
        <span className="h-2.5 w-2.5 rounded-[2px] bg-zinc-200/70 dark:bg-zinc-800/70" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-200" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-400" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-emerald-600" />
        more
      </div>
    </div>
  );
}

/** SVG line+area chart of verification scores over time (no chart lib — keeps bundle lean). */
function ScoreTrendChart({ runs, avg }: { runs: TrendRun[]; avg: number }) {
  const W = 640;
  const H = 190;
  const PAD = { l: 34, r: 18, t: 16, b: 26 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const y = (score: number) => PAD.t + (1 - score / 100) * innerH;
  const x = (i: number) => {
    if (runs.length <= 1) return PAD.l + innerW / 2;
    const t0 = new Date(runs[0].date).getTime();
    const t1 = new Date(runs[runs.length - 1].date).getTime();
    // same-day runs: spread evenly instead of stacking on one x
    if (t1 - t0 < 60_000) return PAD.l + (i / (runs.length - 1)) * innerW;
    const t = new Date(runs[i].date).getTime();
    return PAD.l + ((t - t0) / (t1 - t0)) * innerW;
  };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const linePath = runs.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(r.overall).toFixed(1)}`).join(" ");
  const areaPath = runs.length > 1 ? `${linePath} L${x(runs.length - 1).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z` : "";

  // x date labels — greedy, overlap-aware: "Sep 15" is ~32px at font-size 9,
  // so a candidate label is only kept if its pixel span doesn't intersect a
  // kept one (when runs cluster in time the old index-based labels collided).
  const LABEL_W = 32;
  const labelCandidates =
    runs.length > 2 ? [0, Math.floor((runs.length - 1) / 2), runs.length - 1] : runs.length === 2 ? [0, 1] : [0];
  const spanOf = (idx: number): [number, number] => {
    const px = x(idx);
    if (idx === 0) return [px, px + LABEL_W];
    if (idx === runs.length - 1 && runs.length > 1) return [px - LABEL_W, px];
    return [px - LABEL_W / 2, px + LABEL_W / 2];
  };
  const xLabels: Array<{ idx: number; anchor: "start" | "middle" | "end" }> = [];
  for (const idx of labelCandidates) {
    const [left, right] = spanOf(idx);
    const collides = xLabels.some((l) => {
      const [lLeft, lRight] = spanOf(l.idx);
      return left < lRight && lLeft < right;
    });
    if (!collides) xLabels.push({ idx, anchor: idx === 0 ? "start" : idx === runs.length - 1 && runs.length > 1 ? "end" : "middle" });
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Score trend across ${runs.length} completed verification runs`}>
        {/* horizontal grid + y labels */}
        {[25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} y1={y(g)} x2={W - PAD.r} y2={y(g)} stroke="var(--sp-grid-ink)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--sp-ink-soft)" fontFamily="ui-monospace, monospace">
              {g}
            </text>
          </g>
        ))}

        {/* collective average reference */}
        {runs.length > 1 && (
          <>
            <line x1={PAD.l} y1={y(avg)} x2={W - PAD.r} y2={y(avg)} stroke="#a1a1aa" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="4 5" />
            <text x={W - PAD.r} y={y(avg) - 5} textAnchor="end" fontSize="9" fill="var(--sp-ink-soft)" fontFamily="ui-monospace, monospace">
              avg {avg}
            </text>
          </>
        )}

        {/* area + line */}
        {areaPath && (
          <motion.path
            d={areaPath}
            fill="#059669"
            fillOpacity="0.06"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.6 }}
          />
        )}
        {runs.length > 1 && (
          <motion.path
            d={linePath}
            fill="none"
            stroke="#27221b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          />
        )}

        {/* run dots */}
        {runs.map((r, i) => (
          <motion.g
            key={`${r.name}-${r.date}-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 + Math.min(i * 0.06, 0.5), duration: 0.3 }}
          >
            <circle cx={x(i)} cy={y(r.overall)} r="4.5" fill={scoreColor(r.overall)} stroke="#ffffff" strokeWidth="1.5">
              <title>{`${r.name} — ${r.overall}/100 · ${fmt(r.date)}`}</title>
            </circle>
          </motion.g>
        ))}

        {/* x date labels (overlap-aware) */}
        {xLabels.map(({ idx, anchor }) => (
          <text
            key={idx}
            x={x(idx)}
            y={H - 8}
            textAnchor={anchor}
            fontSize="9"
            fill="var(--sp-ink-soft)"
            fontFamily="ui-monospace, monospace"
          >
            {fmt(runs[idx].date)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">
          {runs.length} completed run{runs.length === 1 ? "" : "s"} ·{" "}
          {new Set(runs.map((r) => r.name)).size} candidate{new Set(runs.map((r) => r.name)).size === 1 ? "" : "s"}
          {runs.length === 1 && " — trend appears after more verifications"}
        </p>
        <p className="text-[10px] text-zinc-600 dark:text-zinc-300">Hover a dot for candidate, score &amp; date.</p>
      </div>
    </div>
  );
}

// ─── Pipeline health — stage distribution, decision velocity, recent feed ──

type PipelineEventRow = {
  id: string;
  status: string;
  note: string | null;
  meta: PipelineMeta | null;
  createdAt: string;
  candidateId: string;
  candidateName: string;
};

/** Segment colors mirror the stage accents used across pills, funnel and stats. */
const PIPELINE_DIST: Array<{ key: "verified" | "shortlisted" | "interview" | "offer" | "rejected" | "none"; color: string }> = [
  { key: "verified", color: "#059669" },
  { key: "shortlisted", color: "#d97706" },
  { key: "interview", color: "#7c3aed" },
  { key: "offer", color: "#0d9488" },
  { key: "rejected", color: "#e11d48" },
  { key: "none", color: "#a1a1aa" },
];

const distLabel = (key: string) =>
  key === "verified" ? "Verified" : key === "none" ? "No decision" : PIPELINE_STAGES[key as keyof typeof PIPELINE_STAGES]?.label ?? key;

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function PipelineHealthCard({ rows }: { rows: CandidateRow[] | null }) {
  const [events, setEvents] = useState<PipelineEventRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/pipeline-events")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Pipeline events lookup failed"))))
      .then((d) => {
        if (alive) setEvents(d.events ?? []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // current-stage distribution over active candidates (from rows — always available)
  const dist = useMemo(() => {
    const list = (rows ?? []).filter((r) => !r.archived);
    const counts = new Map<string, number>(PIPELINE_DIST.map((d) => [d.key, 0]));
    for (const r of list) {
      // an explicit decision always wins; un-decided in-progress profiles fall to "none"
      const key = r.pipelineStatus ?? (r.overall == null ? "none" : "verified");
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
      else counts.set("none", (counts.get("none") ?? 0) + 1);
    }
    return { total: list.length, counts };
  }, [rows]);

  // decision velocity from the audit trail — avg days between stage transitions
  const velocity = useMemo(() => {
    if (!events) return null;
    const firsts = new Map<string, Map<string, number>>();
    for (const e of events) {
      const m = firsts.get(e.candidateId) ?? new Map<string, number>();
      const t = new Date(e.createdAt).getTime();
      if (!m.has(e.status)) m.set(e.status, t);
      firsts.set(e.candidateId, m);
    }
    const gaps = { toInterview: [] as number[], toOffer: [] as number[] };
    for (const m of firsts.values()) {
      const sl = m.get("shortlisted");
      const iv = m.get("interview");
      const of = m.get("offer");
      if (sl != null && iv != null && iv > sl) gaps.toInterview.push((iv - sl) / 86400000);
      if (iv != null && of != null && of > iv) gaps.toOffer.push((of - iv) / 86400000);
    }
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const fmt = (d: number | null) => (d == null ? "—" : d < 1 ? "<1d" : `${Math.round(d)}d`);
    return {
      toInterview: { label: fmt(avg(gaps.toInterview)), n: gaps.toInterview.length },
      toOffer: { label: fmt(avg(gaps.toOffer)), n: gaps.toOffer.length },
    };
  }, [events]);

  const recent = useMemo(() => (events ? [...events].reverse().slice(0, 6) : []), [events]);
  const totalEvents = events?.length ?? 0;
  const anyDecision = (rows ?? []).some((r) => r.pipelineStatus);

  /** Download the full decision audit trail as CSV (newest first, human-readable). */
  const exportDecisionsCsv = () => {
    if (!events || events.length === 0) return;
    const stageLabel = (s: string) =>
      s === "cleared" ? "Decision cleared" : (PIPELINE_STAGES[s as keyof typeof PIPELINE_STAGES]?.label ?? s);
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Candidate", "Stage", "Detail", "Note", "Logged At"];
    const lines = [...events]
      .reverse()
      .map((e) =>
        [
          esc(e.candidateName),
          esc(stageLabel(e.status)),
          esc(pipelineMetaSummary(e.meta)),
          esc(e.note ?? ""),
          esc(new Date(e.createdAt).toISOString()),
        ].join(",")
      );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillproof-pipeline-decisions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${events.length} decision${events.length === 1 ? "" : "s"} to CSV`);
  };

  return (
    <motion.div {...fadeUp} transition={{ delay: 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="md:col-span-2">
      <Card className="rounded-lg border-border bg-card shadow-none transition-colors">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <GitBranch className="h-4 w-4 text-muted-foreground" /> Pipeline health
            <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">where candidates stand &amp; how fast they move</span>
            <span className="ml-auto flex items-center gap-1.5">
              {totalEvents > 0 && (
                <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-xs text-zinc-500 dark:text-zinc-400">
                  {totalEvents} decision{totalEvents === 1 ? "" : "s"} logged
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={!events || events.length === 0}
                onClick={exportDecisionsCsv}
                title="Download every logged pipeline decision as CSV"
                className="h-7 gap-1.5 border-zinc-300 dark:border-zinc-700 bg-transparent px-2.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <Download className="h-3 w-3" /> Decisions CSV
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* stage distribution — segmented bar over active candidates */}
          <div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              {PIPELINE_DIST.map((d, i) => {
                const n = dist.counts.get(d.key) ?? 0;
                if (n === 0) return null;
                const pct = dist.total ? Math.round((n / dist.total) * 100) : 0;
                return (
                  <motion.div
                    key={d.key}
                    className="h-full border-r border-card last:border-r-0"
                    style={{ backgroundColor: d.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / Math.max(1, dist.total)) * 100}%` }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    title={`${distLabel(d.key)} — ${n} candidate${n === 1 ? "" : "s"} (${pct}%)`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {PIPELINE_DIST.map((d) => {
                const n = dist.counts.get(d.key) ?? 0;
                return (
                  <span key={d.key} className={cn("flex items-center gap-1.5 text-[11px]", n === 0 ? "text-zinc-400 dark:text-zinc-400" : "text-zinc-600 dark:text-zinc-300")}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {distLabel(d.key)} <span className="font-mono text-zinc-900 dark:text-zinc-100">{n}</span>
                    {dist.total > 0 && <span className="text-zinc-600 dark:text-zinc-300">({Math.round((n / dist.total) * 100)}%)</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* decision velocity — computed from the PipelineEvent audit trail */}
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { label: "Shortlist → Interview", v: velocity?.toInterview.label ?? "—", n: velocity?.toInterview.n ?? 0, tint: "text-violet-700 dark:text-violet-400", edge: "border-l-violet-500" },
              { label: "Interview → Offer", v: velocity?.toOffer.label ?? "—", n: velocity?.toOffer.n ?? 0, tint: "text-teal-700 dark:text-teal-400", edge: "border-l-teal-500" },
              { label: "Decisions logged", v: totalEvents > 0 ? String(totalEvents) : "—", n: totalEvents, tint: "text-emerald-700 dark:text-emerald-400", edge: "border-l-emerald-500" },
            ].map((c) => (
              <div key={c.label} className={cn("rounded-md border border-border border-l-2 bg-zinc-50 dark:bg-zinc-800/40 p-3", c.edge)}>
                <p className={cn("flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em]", c.tint)}>
                  <Timer className="h-3 w-3" /> {c.label}
                </p>
                <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{c.v}</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {c.label === "Decisions logged"
                    ? "every shortlist / interview / offer / rejection on record"
                    : c.n > 0
                      ? `avg across ${c.n} candidate${c.n === 1 ? "" : "s"} with both stages`
                      : "no transitions recorded yet"}
                </p>
              </div>
            ))}
          </div>

          {/* recent decisions feed */}
          <div>
            <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Recent decisions</p>
            {failed ? (
              <p className="text-xs text-rose-700 dark:text-rose-400">Decision feed unavailable — try refreshing.</p>
            ) : events === null ? (
              <div className="grid gap-1.5 md:grid-cols-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="sp-shimmer h-9 w-full bg-zinc-200/70 dark:bg-zinc-800/70" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {anyDecision
                  ? "No decision history recorded — new decisions will appear here."
                  : "No pipeline decisions yet — shortlist, interview or reject candidates from the table."}
              </p>
            ) : (
              <div className="grid gap-1.5 md:grid-cols-2">
                {recent.map((e, i) => {
                  const stage = PIPELINE_STAGES[e.status as keyof typeof PIPELINE_STAGES] ?? PIPELINE_STAGES.cleared;
                  return (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.05, duration: 0.3 }}
                      className="flex items-center gap-2.5 overflow-hidden rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 px-2.5 py-2"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card",
                          stage.iconClass
                        )}
                      >
                        {stage.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{e.candidateName}</span>
                          {e.status === "cleared" ? " — decision cleared" : ` — ${stage.label.toLowerCase()}`}
                          {e.meta?.scheduledAt && (
                            <span className="font-mono text-[10px] text-violet-700 dark:text-violet-400">
                              {" · "}
                              {new Date(`${e.meta.scheduledAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {e.meta?.startDate && (
                            <span className="font-mono text-[10px] text-teal-700 dark:text-teal-400">
                              {" · starts "}
                              {new Date(`${e.meta.startDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          )}
                          {e.note && (
                            <span className="text-zinc-500 dark:text-zinc-400" title={e.note}>
                              {" "}
                              “{e.note.length > 34 ? `${e.note.slice(0, 34)}…` : e.note}”
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-zinc-600 dark:text-zinc-300">{timeAgo(e.createdAt)}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
