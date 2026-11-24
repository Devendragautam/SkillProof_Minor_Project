"use client";

import { useEffect, useState } from "react";
import { GitBranch, FileCode2, Loader2 } from "lucide-react";
import type { BreakdownItem } from "@/lib/types";

interface EvolutionStep {
  t: number;
  label: string;
  lines: number;
  addedLines: number;
  removedLines: number;
  similarity: number;
  preview: string;
}

interface EvolutionData {
  submissionId: string;
  versions: EvolutionStep[];
  finalDelta: { addedLines: number; removedLines: number; similarity: number } | null;
  finalLines: number;
  totalEvents: number;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Solution Evolution timeline — how the code progressed from first snapshot to final */
export function CodeEvolution({ submissionId }: { submissionId: string }) {
  const [data, setData] = useState<EvolutionData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/submissions/${submissionId}/versions`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  if (error) return <p className="text-xs text-muted-foreground">Evolution data unavailable.</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading solution evolution…
      </p>
    );
  }

  if (data.versions.length === 0) {
    return <p className="text-xs text-muted-foreground">No intermediate snapshots were captured for this solution.</p>;
  }

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> Solution evolution
        <span className="ml-auto font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
          {data.versions.length} snapshot{data.versions.length === 1 ? "" : "s"} · final {data.finalLines} lines · {data.totalEvents} tracked events
        </span>
      </p>
      <div className="relative space-y-2.5 pl-4">
        <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-zinc-300 dark:bg-zinc-700" aria-hidden />
        {data.versions.map((v, i) => (
          <div key={i} className="relative sp-slide-in" style={{ animationDelay: `${i * 0.07}s` }}>
            <span className="absolute -left-4 top-2 h-2 w-2 rounded-full border border-emerald-600 dark:border-emerald-500 bg-background" aria-hidden />
            <div className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">v{i + 1}</span>
                <span className="text-zinc-500 dark:text-zinc-400">{fmtMs(v.t)} · {v.label}</span>
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">+{v.addedLines}</span>
                <span className="font-mono tabular-nums text-rose-700 dark:text-rose-400">−{v.removedLines}</span>
                <span className="text-zinc-500 dark:text-zinc-400">· {v.lines} lines</span>
                {i > 0 && (
                  <span className={v.similarity >= 85 ? "ml-auto tabular-nums text-amber-700 dark:text-amber-400" : "ml-auto tabular-nums text-emerald-700 dark:text-emerald-400"}>
                    {v.similarity}% similar to v{i}
                  </span>
                )}
              </div>
              <pre className="mt-1.5 overflow-hidden rounded bg-zinc-950 p-2 font-mono text-[10.5px] leading-snug text-zinc-100">
                {v.preview}
              </pre>
            </div>
          </div>
        ))}
        {data.finalDelta && (
          <div className="relative">
            <span className="absolute -left-4 top-2 h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-[11px]">
              <FileCode2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-800 dark:text-emerald-400">Final submission</span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">+{data.finalDelta.addedLines}</span>
              <span className="font-mono tabular-nums text-rose-700 dark:text-rose-400">−{data.finalDelta.removedLines}</span>
              <span className="text-zinc-500 dark:text-zinc-400">vs last snapshot · {data.finalDelta.similarity}% retained</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lazy wrapper — only loads when the parent accordion is open */
export function CodeEvolutionIfOpen({ open, b }: { open: boolean; b: BreakdownItem }) {
  if (!open || !b.submissionId || b.category === "mcq") return null;
  return <CodeEvolution submissionId={b.submissionId} />;
}
