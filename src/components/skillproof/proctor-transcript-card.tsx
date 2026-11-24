"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  Archive,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Eye,
  EyeOff,
  FileCode2,
  Lightbulb,
  MessageSquareCode,
  Play,
  Send,
  ShieldAlert,
} from "lucide-react";

/**
 * Recruiter dossier card — the persisted proctoring transcript for ONE
 * assessment. The live monitor streams events in real time; the proctor
 * service flushes them to the evidence store, and this card reads that
 * durable record so every report carries its monitoring evidence.
 */

interface TranscriptEvent {
  id: string;
  type: string;
  detail: string;
  severity: "info" | "good" | "warn" | "risk";
  ts: number;
}

const SEV = {
  info: { dot: "bg-zinc-400 dark:bg-zinc-600", text: "text-zinc-600 dark:text-zinc-300", chip: "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-300", label: "info" },
  good: { dot: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-400", chip: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400", label: "good" },
  warn: { dot: "bg-amber-600", text: "text-amber-700 dark:text-amber-400", chip: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400", label: "warning" },
  risk: { dot: "bg-rose-600", text: "text-rose-700 dark:text-rose-400", chip: "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400", label: "risk" },
} as const;

function iconFor(type: string) {
  if (type.startsWith("paste")) return ClipboardPaste;
  if (type === "focus_lost") return EyeOff;
  if (type === "focus_back") return Eye;
  if (type === "run_tests") return Play;
  if (type === "submit") return Send;
  if (type === "mcq") return CheckCircle2;
  if (type.startsWith("hint")) return Lightbulb;
  if (type.startsWith("explain")) return MessageSquareCode;
  if (type === "question_open") return FileCode2;
  return Activity;
}

function humanType(type: string): string {
  return type.replace(/_/g, " ");
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function dayStamp(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ProctorTranscriptCard({ assessmentId }: { assessmentId: string }) {
  const [events, setEvents] = useState<TranscriptEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setFailed(false);
    setOpen(false);
    (async () => {
      try {
        const res = await fetch(`/api/proctor/events?assessmentId=${encodeURIComponent(assessmentId)}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "transcript unavailable");
        if (!cancelled) setEvents(Array.isArray(data.events) ? data.events : []);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setEvents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const summary = useMemo(() => {
    const list = events ?? [];
    return {
      count: list.length,
      warn: list.filter((e) => e.severity === "warn").length,
      risk: list.filter((e) => e.severity === "risk").length,
      good: list.filter((e) => e.severity === "good").length,
      first: list.length ? list[0].ts : null,
      last: list.length ? list[list.length - 1].ts : null,
    };
  }, [events]);

  return (
    <Card className="border-border bg-card" data-testid="proctor-transcript-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <Archive className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Proctoring transcript
          </span>
          {events !== null && summary.count > 0 && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                {summary.count} event{summary.count === 1 ? "" : "s"}
              </span>
              {summary.good > 0 && (
                <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", SEV.good.chip)}>
                  {summary.good} positive
                </span>
              )}
              {summary.warn > 0 && (
                <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", SEV.warn.chip)}>
                  {summary.warn} warning{summary.warn === 1 ? "" : "s"}
                </span>
              )}
              {summary.risk > 0 && (
                <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]", SEV.risk.chip)}>
                  <ShieldAlert className="h-3 w-3" /> {summary.risk} risk
                </span>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {events === null && !failed && (
          <p className="py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400" aria-live="polite">
            loading transcript…
          </p>
        )}

        {events !== null && summary.count === 0 && (
          <p className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
            {failed
              ? "The evidence store is unreachable right now — the transcript can't be loaded. Live monitoring and scoring were unaffected."
              : "No proctoring events were recorded for this run. Events persist only when the candidate's assessment streams through the live monitor — in-progress runs appear here once activity is flushed (every couple of seconds)."}
          </p>
        )}

        {events !== null && summary.count > 0 && (
          <>
            <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {dayStamp(summary.first!)} · {clock(summary.first!)} → {clock(summary.last!)} · disclosed monitoring, session-scoped
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="h-7 border-zinc-300 dark:border-zinc-700 px-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {open ? "Hide ledger" : "View ledger"}
              <ChevronDown className={cn("ml-1.5 h-3 w-3 transition-transform", open && "rotate-180")} />
            </Button>
            {open && (
              <ol
                aria-label="Chronological proctoring events"
                className="max-h-64 space-y-0 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-800/40"
              >
                {events.map((e) => {
                  const Icon = iconFor(e.type);
                  const sev = SEV[e.severity] ?? SEV.info;
                  return (
                    <li key={e.id} className="flex items-start gap-2.5 border-b border-zinc-200/70 dark:border-zinc-700 px-3 py-2 last:border-b-0">
                      <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", sev.dot)} />
                      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-400" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("text-[11px] font-medium", e.severity === "info" ? "text-zinc-700 dark:text-zinc-300" : sev.text)}>
                          {humanType(e.type)}
                        </span>
                        {e.detail && (
                          <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400" title={e.detail}>
                            {e.detail}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">{clock(e.ts)}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
