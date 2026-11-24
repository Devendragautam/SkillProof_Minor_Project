"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Flame } from "lucide-react";

// ─── Count-up hook (animated number entrances) ─────────────────────────────

/**
 * Animates from 0 to `target` with an ease-out curve. Respects
 * prefers-reduced-motion (jumps straight to the target).
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (from === target) return; // already there — nothing to animate
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    // jump straight to the target (reduced motion) — still async, via a frame
    if (reduced) {
      rafRef.current = requestAnimationFrame(() => {
        fromRef.current = target;
        setValue(target);
      });
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const next = Math.round(from + (target - from) * eased);
      fromRef.current = next;
      setValue(next);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

// ─── Score ring ─────────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 80) return "#059669"; // emerald-600
  if (score >= 60) return "#d97706"; // amber-600
  if (score >= 40) return "#ea580c"; // orange-600
  return "#e11d48"; // rose-600
}

export function ScoreRing({
  score,
  size = 120,
  stroke = 10,
  label,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = c * (1 - clamped / 100);
  const color = scoreColor(clamped);
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sp-grid-ink)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ fontSize: size * 0.26, color }}>
          {Math.round(clamped)}
        </span>
        {label && <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

// ─── Cohort standing (aggregate percentile vs completed runs) ───────────────

interface CohortData {
  size: number;
  median: number | null;
  best: number | null;
  rank: number | null;
  topPct: number | null;
}

/**
 * "TOP 12.5% · rank #2 of 12 verified runs" — fetched aggregate-only from
 * /api/cohort (no PII). Renders nothing until there is a meaningful cohort
 * (≥2 completed, reported runs). The percentage counts half of the ties at
 * the holder's score, so it never flatters via ties; cohorts under 5 runs
 * carry an explicit small-cohort disclaimer.
 */
export function CohortStanding({ score, className }: { score: number; className?: string }) {
  const [cohort, setCohort] = useState<CohortData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/cohort?score=${Number(score)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cohort unavailable"))))
      .then((d: CohortData) => {
        if (alive) setCohort(d);
      })
      .catch(() => {
        if (alive) setCohort(null);
      });
    return () => {
      alive = false;
    };
  }, [score]);

  if (!cohort || cohort.size < 2 || cohort.topPct == null || cohort.rank == null) return null;

  const topPct = cohort.topPct;
  const fmt = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
  // standing tone: strong stands get ink-green, middling stay quiet, weak ink-rose
  const tone = topPct <= 25 ? "#047857" : topPct >= 60 ? "#e11d48" : "#78716c";

  return (
    <div
      className={cn("rounded-[4px] border border-zinc-300 dark:border-zinc-700 bg-[#faf7f0] px-2.5 py-2 text-center", className)}
      aria-label={`Cohort standing: top ${fmt(topPct)} percent, rank ${cohort.rank} of ${cohort.size} verified runs`}
    >
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Cohort standing
      </p>
      <p className="mt-0.5 font-display text-lg font-bold leading-none tabular-nums" style={{ color: tone }}>
        top {fmt(topPct)}%
      </p>
      <p className="mt-1 text-[10px] leading-tight text-zinc-500">
        rank #{cohort.rank} of {cohort.size} verified runs
        {cohort.median != null && <> · median {Math.round(cohort.median)}</>}
        {cohort.size < 5 && <> · small cohort</>}
      </p>
    </div>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

export function ConfidenceBadge({ level, className }: { level: string | null; className?: string }) {
  if (!level || level === "NOT_ASSESSED") {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400", className)}>
        <ShieldQuestion className="h-3 w-3" /> Not assessed
      </span>
    );
  }
  const style =
    level === "HIGH"
      ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : level === "MEDIUM"
        ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", style, className)}>
      {level === "HIGH" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
      {level} confidence
    </span>
  );
}

export function RiskBadge({ risk, className }: { risk: number; className?: string }) {
  const level = risk >= 60 ? "Elevated" : risk >= 30 ? "Watch" : "Low";
  const style =
    risk >= 60
      ? "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
      : risk >= 30
        ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", style, className)}>
      <Flame className="h-3 w-3" /> AI-assist risk {Math.round(risk)}% · {level}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const style =
    difficulty === "easy"
      ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
      : difficulty === "medium"
        ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
        : "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400";
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", style)}>{difficulty}</span>
  );
}

// ─── Evidence bar ───────────────────────────────────────────────────────────

export function EvidenceBar({ score, height = "h-2" }: { score: number; height?: string }) {
  return (
    <div className={cn("w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden", height)}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.max(2, Math.min(100, score))}%`, backgroundColor: scoreColor(score) }}
      />
    </div>
  );
}

// ─── Radar chart (category scores) ──────────────────────────────────────────

export interface RadarSeries {
  label: string;
  color: string;
  values: Array<{ label: string; score: number }>;
}

export function RadarChart({
  values,
  series,
  size = 240,
}: {
  values?: Array<{ label: string; score: number }>;
  series?: RadarSeries[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const axes = values ?? series?.[0]?.values ?? [];
  const n = Math.max(axes.length, 3);
  const angleFor = (i: number) => (2 * Math.PI * i) / n - Math.PI / 2;
  const pointFor = (i: number, frac: number) => ({
    x: cx + r * frac * Math.cos(angleFor(i)),
    y: cy + r * frac * Math.sin(angleFor(i)),
  });
  const fracOf = (score: number) => Math.max(0.04, Math.min(1, score / 100));

  const polygonFor = (vals: Array<{ label: string; score: number }>) =>
    vals
      .map((v, i) => {
        const p = pointFor(i, fracOf(v.score));
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");

  const rings = [0.33, 0.66, 1];
  const palette = ["#059669", "#d97706", "#e11d48", "#7c3aed"];
  const activeSeries: RadarSeries[] = series ?? [{ label: "", color: "", values: axes }];

  return (
    <div>
      <svg
        viewBox={`-52 -14 ${size + 104} ${size + 28}`}
        className="mx-auto h-auto w-full max-w-60"
        role="img"
        aria-label="Category score radar"
      >
        {rings.map((frac) => (
          <polygon
            key={frac}
            points={axes
              .map((_, i) => {
                const p = pointFor(i, frac);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--sp-grid-ink-faint)"
            strokeWidth="1"
          />
        ))}
        {axes.map((v, i) => {
          const p = pointFor(i, 1);
          const lp = pointFor(i, 1.22);
          return (
            <g key={v.label}>
              <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--sp-grid-ink-faint)" strokeWidth="1" />
              <text
                x={lp.x}
                y={lp.y}
                textAnchor={Math.abs(lp.x - cx) < 12 ? "middle" : lp.x > cx ? "start" : "end"}
                dominantBaseline="middle"
                fontSize="8.5"
                fill="var(--sp-ink-soft)"
              >
                {v.label.length > 14 ? v.label.slice(0, 13) + "\u2026" : v.label}
              </text>
            </g>
          );
        })}
        {activeSeries.map((s, si) => {
          const color = series ? s.color || palette[si % palette.length] : "#059669";
          return (
            <g key={s.label || `s${si}`}>
              <polygon
                points={polygonFor(s.values)}
                fill={color}
                fillOpacity={series ? 0.14 : 0.18}
                stroke={color}
                strokeWidth="1.6"
              />
              {s.values.map((v, i) => {
                const p = pointFor(i, fracOf(v.score));
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="2.6"
                    fill={series ? color : scoreColor(v.score)}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {series && series.length > 1 && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color || palette[i % palette.length] }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Proof graph ────────────────────────────────────────────────────────────

export function ProofGraph({
  skill,
  score,
  evidence,
}: {
  skill: string;
  score: number;
  evidence: string[];
}) {
  const nodes = evidence.slice(0, 5);
  const size = 100;
  const cx = 50;
  const cy = 50;
  const radius = 43;
  // explicit, overlap-free layouts for small graphs — the center card occupies
  // roughly x 33–67% / y 31–69%, so side nodes must stay outside that box
  const LAYOUTS: Record<number, Array<{ x: number; y: number }>> = {
    1: [{ x: 50, y: 12 }],
    2: [
      { x: 50, y: 11 },
      { x: 50, y: 88 },
    ],
    3: [
      { x: 50, y: 11 },
      { x: 84, y: 76 },
      { x: 16, y: 76 },
    ],
  };
  const yScale = nodes.length <= 2 ? 0.62 : 0.86;
  const angleFor = (i: number) => (2 * Math.PI * i) / Math.max(nodes.length, 1) - Math.PI / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const pos = nodes.map((_, i) => {
    const fixed = LAYOUTS[nodes.length]?.[i];
    if (fixed) return fixed;
    return {
      x: clamp(cx + radius * Math.cos(angleFor(i)), 17, 83),
      y: clamp(cy + radius * Math.sin(angleFor(i)) * yScale, 11, 89),
    };
  });

  return (
    <div className="relative w-full" style={{ aspectRatio: "1.55", minHeight: 300 }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {pos.map((p, i) => (
          <path
            key={i}
            d={`M ${cx} ${cy} Q ${(cx + p.x) / 2 + (p.y - cy) * 0.12} ${(cy + p.y) / 2} ${p.x} ${p.y}`}
            fill="none"
            stroke="oklch(0.596 0.145 163 / 35%)"
            strokeWidth="0.5"
            className="sp-flow-line"
          />
        ))}
      </svg>
      {/* center node */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div className="flex flex-col items-center rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5">
          <ScoreRing score={score} size={70} stroke={7} />
          <span className="mt-1 max-w-28 truncate text-xs font-semibold text-emerald-800 dark:text-emerald-400">{skill}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">verified</span>
        </div>
      </div>
      {/* evidence nodes */}
      {nodes.map((e, i) => (
        <div
          key={i}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
        >
          <div className="flex max-w-32 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 transition-colors hover:border-emerald-300 dark:hover:border-emerald-500/60">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: scoreColor(score) }} />
            <span className="line-clamp-2 leading-tight">{e}</span>
          </div>
        </div>
      ))}
      {nodes.length === 0 && (
        <p className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">No evidence recorded</p>
      )}
    </div>
  );
}
