"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { PipelineMeta } from "@/lib/pipeline-meta";
import {
  CalendarClock,
  CircleSlash,
  Handshake,
  Hourglass,
  RefreshCw,
  Star,
  XCircle,
} from "lucide-react";

/**
 * Candidate-facing hiring status panel (own results only, never on shared
 * report links). Shows the recruiter's pipeline decision — shortlisted /
 * interview schedule / offer details / not moving forward — plus the public
 * stage history. Notes and internal scoring are deliberately not exposed.
 * Polls lightly (30s) so a decision made while the candidate is viewing the
 * report shows up without a manual reload.
 */

interface StageEvent {
  id: string;
  status: string;
  meta: PipelineMeta | null;
  createdAt: string;
}

interface PipelineStatus {
  status: string | null;
  meta: PipelineMeta | null;
  updatedAt: string | null;
  events: StageEvent[];
}

const STAGE: Record<
  string,
  { label: string; blurb: string; icon: React.ComponentType<{ className?: string }>; tint: string; glow: string; chip: string; dot: string }
> = {
  shortlisted: {
    label: "Shortlisted",
    blurb: "Your verified evidence stood out — the team is moving forward with your profile.",
    icon: Star,
    tint: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40",
    glow: "",
    chip: "border-amber-200 dark:border-amber-800/60 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  interview: {
    label: "Interview scheduled",
    blurb: "You have an interview round coming up — good luck. Details below.",
    icon: CalendarClock,
    tint: "border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40",
    glow: "",
    chip: "border-violet-200 dark:border-violet-800/60 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-400",
    dot: "bg-violet-500",
  },
  offer: {
    label: "Offer extended",
    blurb: "Congratulations — an offer is on the table. Details below.",
    icon: Handshake,
    tint: "border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40",
    glow: "",
    chip: "border-teal-200 dark:border-teal-800/60 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  rejected: {
    label: "Not moving forward",
    blurb: "This role isn't a match right now. Your verified profile stays yours — share it anywhere.",
    icon: XCircle,
    tint: "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40",
    glow: "",
    chip: "border-rose-200 dark:border-rose-800/60 bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  cleared: {
    label: "Decision cleared",
    blurb: "The previous decision was withdrawn — your profile is back in review.",
    icon: CircleSlash,
    tint: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800",
    glow: "",
    chip: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
};

const dayFmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** "in 6 days" / "tomorrow" / "today" / "3 days ago" for a YYYY-MM-DD date. */
function daysUntil(dateStr: string): string | null {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff > 1) return `in ${diff} days`;
  if (diff === -1) return "yesterday";
  return `${-diff} days ago`;
}

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** One-line human summary of stage meta — mirrors pipelineMetaSummary. */
function metaChips(status: string, meta: PipelineMeta | null): Array<{ key: string; text: string; title?: string }> {
  if (!meta) return [];
  const chips: Array<{ key: string; text: string; title?: string }> = [];
  if (status === "interview") {
    if (meta.scheduledAt) {
      const rel = daysUntil(meta.scheduledAt);
      chips.push({
        key: "when",
        text: rel ? `${dayFmt(meta.scheduledAt)} · ${rel}` : dayFmt(meta.scheduledAt),
        title: "Interview date",
      });
    }
    if (meta.panel) chips.push({ key: "panel", text: `Panel: ${meta.panel}`, title: "Interview panel" });
  }
  if (status === "offer") {
    if (meta.comp) chips.push({ key: "comp", text: meta.comp, title: "Compensation" });
    if (meta.startDate) {
      const rel = daysUntil(meta.startDate);
      chips.push({
        key: "start",
        text: `Starts ${dayFmt(meta.startDate)}${rel ? ` · ${rel}` : ""}`,
        title: "Start date",
      });
    }
  }
  return chips;
}

export function HiringStatusPanel({ candidateId, className }: { candidateId: string; className?: string }) {
  const [data, setData] = useState<PipelineStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await fetch(`/api/candidates/${candidateId}/pipeline-status`, { cache: "no-store" });
        const json = await res.json();
        if (!mounted.current) return;
        if (!res.ok) throw new Error(json.error);
        setData(json as PipelineStatus);
        setFailed(false);
      } catch {
        if (mounted.current) setFailed(true);
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [candidateId]
  );

  useEffect(() => {
    mounted.current = true;
    void load(true);
    const iv = setInterval(() => void load(true), 30_000);
    return () => {
      mounted.current = false;
      clearInterval(iv);
    };
  }, [load]);

  const stage = data?.status ? STAGE[data.status] : undefined;
  const chips = data ? metaChips(data.status ?? "", data.meta) : [];
  const history = (data?.events ?? []).slice(0, 4);
  // dedupe consecutive same-stage events so a re-save doesn't look like noise
  const shownHistory = history.filter((e, i) => i === 0 || e.status !== history[i - 1].status);

  return (
    <Card
      className={cn(
        "overflow-hidden border-border bg-card transition-shadow",
        stage?.glow,
        className
      )}
      aria-live="polite"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex min-w-0 items-center gap-2">
            <Hourglass className={cn("h-4.5 w-4.5 shrink-0", stage ? "text-zinc-700 dark:text-zinc-300" : "text-emerald-700 dark:text-emerald-400")} />
            Hiring status
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            onClick={() => void load()}
            disabled={refreshing}
            aria-label="Refresh hiring status"
            title="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data === null && !failed ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-36 bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-9 w-full bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ) : failed ? (
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Couldn&apos;t load your hiring status —{" "}
            <button className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={() => void load()}>
              retry
            </button>
          </p>
        ) : !stage ? (
          <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">No decision recorded yet</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Recruiters see your latest completed run. Keep your profile fresh — every verified attempt stays in your
              history.
            </p>
          </div>
        ) : (
          <motion.div
            key={data?.status + (data?.updatedAt ?? "")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className={cn("rounded-md border p-3.5", stage.tint)}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <stage.icon className={cn("h-4 w-4", stage.chip.split(" ").find((c) => c.startsWith("text-")))} />
              {stage.label}
              {data?.updatedAt && (
                <span className="ml-auto font-mono text-[10px] font-normal text-zinc-500 dark:text-zinc-400">{timeAgo(data.updatedAt)}</span>
              )}
            </p>
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((c) => (
                  <span
                    key={c.key}
                    title={c.title}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
                      stage.chip
                    )}
                  >
                    {c.text}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">{stage.blurb}</p>
          </motion.div>
        )}

        {shownHistory.length > 1 && (
          <div className="space-y-1.5 border-t border-border pt-2.5" role="list" aria-label="Decision history">
            {shownHistory.map((e) => {
              const s = STAGE[e.status] ?? STAGE.cleared;
              const eChips = metaChips(e.status, e.meta);
              return (
                <div key={e.id} role="listitem" className="flex min-w-0 items-center gap-2 text-[11px]">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} aria-hidden />
                  <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">{s.label}</span>
                  {eChips.length > 0 && (
                    <span className="truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400" title={eChips.map((c) => c.text).join(" · ")}>
                      {eChips.map((c) => c.text).join(" · ")}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">{timeAgo(e.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}

        {stage && stage === STAGE.rejected && (
          <Badge variant="outline" className="w-full justify-center border-zinc-300 dark:border-zinc-700 text-[10px] font-normal text-zinc-500 dark:text-zinc-400">
            Feedback notes stay private to the hiring team
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
