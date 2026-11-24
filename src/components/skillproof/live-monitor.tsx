"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  getProctorSocket,
  getProctorStatusSnapshot,
  subscribeProctorStatus,
  type LiveSession,
  type ProctorEvent,
  type ProctorStatus,
} from "@/lib/proctor";
import { toast } from "sonner";
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
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Timer,
  Trash2,
  Users,
} from "lucide-react";

type SevFilter = "all" | "warn" | "risk";

const MAX_EVENTS = 120;

/** One persisted proctoring session in the transcript index. */
interface TranscriptSession {
  assessmentId: string;
  candidateName: string;
  count: number;
  warn: number;
  risk: number;
  firstTs: number;
  lastTs: number;
}

/** One persisted proctoring event inside an opened transcript. */
interface TranscriptEvent {
  id: string;
  type: string;
  detail: string;
  severity: ProctorEvent["severity"];
  ts: number;
}

const SEV_STYLE: Record<ProctorEvent["severity"], { dot: string; text: string; label: string }> = {
  info: { dot: "bg-zinc-400 dark:bg-zinc-600", text: "text-zinc-600 dark:text-zinc-300", label: "info" },
  good: { dot: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-400", label: "good" },
  warn: { dot: "bg-amber-600", text: "text-amber-700 dark:text-amber-400", label: "warning" },
  risk: { dot: "bg-rose-600", text: "text-rose-700 dark:text-rose-400", label: "risk" },
};

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
  if (type === "session_start" || type === "session_end") return Activity;
  return Activity;
}

function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function elapsed(from: number, now: number): string {
  const s = Math.max(0, Math.round((now - from) / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * One transcript index row — expandable into the persisted chronological
 * event ledger for that assessment (severity dots, relative times).
 */
function TranscriptRow({
  session,
  open,
  events,
  loading,
  now,
  onToggle,
}: {
  session: TranscriptSession;
  open: boolean;
  events: TranscriptEvent[] | null;
  loading: boolean;
  now: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer border-b border-zinc-100 dark:border-zinc-800 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
          open && "bg-zinc-50 dark:bg-zinc-800/40"
        )}
        onClick={onToggle}
        aria-expanded={open}
      >
        <th scope="row" className="px-3 py-2.5 text-left font-normal">
          <span className="flex items-center gap-2">
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-400 transition-transform", open && "rotate-180")} />
            <span className="truncate text-[12.5px] font-medium text-zinc-900 dark:text-zinc-100">{session.candidateName}</span>
          </span>
        </th>
        <td className="hidden px-3 py-2.5 font-mono text-[11px] uppercase text-zinc-500 dark:text-zinc-400 sm:table-cell">
          {session.assessmentId.slice(0, 8)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-zinc-800 dark:text-zinc-300">{session.count}</td>
        <td className="px-3 py-2.5 text-right">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
            {session.warn > 0 && (
              <span className="border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-1 text-amber-700 dark:text-amber-400" title="warn signals">
                {session.warn}⚠
              </span>
            )}
            {session.risk > 0 && (
              <span className="border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-1 text-rose-700 dark:text-rose-400" title="risk signals">
                {session.risk}▲
              </span>
            )}
            {session.warn === 0 && session.risk === 0 && (
              <span className="border border-emerald-100 bg-emerald-50 dark:bg-emerald-950/40 px-1 text-emerald-700 dark:text-emerald-400" title="no escalation signals">
                clean
              </span>
            )}
          </span>
        </td>
        <td className="hidden px-3 py-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 md:table-cell">{relTime(session.lastTs, now)}</td>
        <td className="px-3 py-2.5" aria-hidden />
      </tr>
      {open && (
        <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40">
          <td colSpan={6} className="px-3 pb-3">
            {loading && events === null ? (
              <p className="py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">loading transcript…</p>
            ) : !events || events.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">No persisted events for this assessment.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700 bg-background">
                <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {events.map((e) => {
                    const Icon = iconFor(e.type);
                    const sev = SEV_STYLE[e.severity] ?? SEV_STYLE.info;
                    return (
                      <li key={e.id} className="flex items-start gap-2.5 px-3 py-2">
                        <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", sev.dot)} aria-hidden />
                        <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", sev.text)} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-xs leading-snug", sev.text)}>{e.detail}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-400">
                            {new Date(e.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ·{" "}
                            {e.type.replace(/_/g, " ")}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function LiveMonitor() {
  // shared connection status — same store drives the dashboard tab dot
  const conn: ProctorStatus = useSyncExternalStore(
    subscribeProctorStatus,
    getProctorStatusSnapshot,
    () => "connecting"
  );
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [sevFilter, setSevFilter] = useState<SevFilter>("all");
  const [thresholds, setThresholds] = useState<{ pasteWarnChars: number; pasteRiskChars: number; explainWarnPct: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mountedRef = useRef(true);

  // ── transcripts (persisted stream history, recruiter-facing) ──────────
  const [transcriptsOpen, setTranscriptsOpen] = useState(false);
  const [transcriptSessions, setTranscriptSessions] = useState<TranscriptSession[] | null>(null);
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null);
  const [transcriptEvents, setTranscriptEvents] = useState<TranscriptEvent[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const loadTranscriptIndex = useCallback(() => {
    setTranscriptLoading(true);
    fetch("/api/proctor/events?list=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("transcripts unavailable"))))
      .then((d) => {
        if (mountedRef.current) setTranscriptSessions(Array.isArray(d.sessions) ? d.sessions : []);
      })
      .catch(() => {
        if (mountedRef.current) {
          setTranscriptSessions([]);
          toast.error("Could not load proctor transcripts");
        }
      })
      .finally(() => {
        if (mountedRef.current) setTranscriptLoading(false);
      });
  }, []);

  const loadTranscript = useCallback((assessmentId: string) => {
    setTranscriptLoading(true);
    fetch(`/api/proctor/events?assessmentId=${encodeURIComponent(assessmentId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("transcript unavailable"))))
      .then((d) => {
        if (mountedRef.current) setTranscriptEvents(Array.isArray(d.events) ? d.events : []);
      })
      .catch(() => {
        if (mountedRef.current) {
          setTranscriptEvents([]);
          toast.error("Could not load the transcript");
        }
      })
      .finally(() => {
        if (mountedRef.current) setTranscriptLoading(false);
      });
  }, []);

  const toggleTranscripts = useCallback(() => {
    setTranscriptsOpen((open) => {
      const next = !open;
      if (next && transcriptSessions === null) loadTranscriptIndex();
      if (!next) {
        setOpenTranscriptId(null);
        setTranscriptEvents(null);
      }
      return next;
    });
  }, [transcriptSessions, loadTranscriptIndex]);

  const openTranscript = useCallback(
    (assessmentId: string) => {
      setOpenTranscriptId((cur) => {
        const next = cur === assessmentId ? null : assessmentId;
        setTranscriptEvents(null);
        if (next) loadTranscript(assessmentId);
        return next;
      });
    },
    [loadTranscript]
  );

  // ticking clock for elapsed/relative times
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // active proctor severity policy — so the recruiter reads the stream
  // against the thresholds actually in force (public GET, no secrets)
  useEffect(() => {
    let alive = true;
    fetch("/api/timer-policy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("policy unavailable"))))
      .then((d) => {
        if (alive && d?.policy) {
          setThresholds({
            pasteWarnChars: d.policy.pasteWarnChars ?? 80,
            pasteRiskChars: d.policy.pasteRiskChars ?? 200,
            explainWarnPct: d.policy.explainWarnPct ?? 70,
          });
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // socket lifecycle
  useEffect(() => {
    mountedRef.current = true;
    let socket: ReturnType<typeof getProctorSocket> | null = null;
    let bootTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      socket = getProctorSocket();
    } catch {
      return;
    }

    const onConnect = () => {
      if (!mountedRef.current) return;
      socket?.emit("proctor:join-recruiter");
    };
    const onInit = (payload: { events: ProctorEvent[]; sessions: LiveSession[] }) => {
      if (!mountedRef.current) return;
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...payload.events.filter((e) => !seen.has(e.id)), ...prev].slice(0, MAX_EVENTS);
      });
      setSessions(payload.sessions);
    };
    const onEvent = (e: ProctorEvent) => {
      if (!mountedRef.current) return;
      setEvents((prev) => (prev.some((x) => x.id === e.id) ? prev : [e, ...prev].slice(0, MAX_EVENTS)));
    };
    const onSessions = (list: LiveSession[]) => {
      if (mountedRef.current) setSessions(list);
    };

    if (socket.connected) {
      // already connected — join on the next tick (avoids sync setState in effect)
      bootTimer = setTimeout(() => {
        if (!mountedRef.current) return;
        socket?.emit("proctor:join-recruiter");
      }, 0);
    }
    socket.on("connect", onConnect);
    socket.on("proctor:init", onInit);
    socket.on("proctor:event", onEvent);
    socket.on("proctor:sessions", onSessions);

    return () => {
      mountedRef.current = false;
      if (bootTimer) clearTimeout(bootTimer);
      socket?.off("connect", onConnect);
      socket?.off("proctor:init", onInit);
      socket?.off("proctor:event", onEvent);
      socket?.off("proctor:sessions", onSessions);
      try {
        socket?.emit("proctor:leave-recruiter");
      } catch {}
    };
  }, []);

  const visibleEvents = useMemo(() => {
    if (sevFilter === "all") return events;
    if (sevFilter === "warn") return events.filter((e) => e.severity === "warn" || e.severity === "risk");
    return events.filter((e) => e.severity === "risk");
  }, [events, sevFilter]);

  const riskCount = events.filter((e) => e.severity === "risk").length;

  return (
    <div className="space-y-4">
      {/* status header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
            conn === "live"
              ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
              : conn === "offline"
                ? "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
                : "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
          )}
        >
          <span className={cn("sp-live-dot h-1.5 w-1.5 rounded-full", conn === "live" ? "bg-emerald-600" : conn === "offline" ? "bg-rose-600" : "bg-amber-600")} />
          {conn === "live" ? "Live · connected" : conn === "offline" ? "Offline — reconnecting" : "Connecting…"}
        </span>
        <span className="text-xs text-muted-foreground">
          {sessions.length === 0
            ? "No candidates are being monitored right now."
            : `${sessions.length} live session${sessions.length === 1 ? "" : "s"} · ${events.length} events received`}
        </span>
        {thresholds && (
          <span
            className="hidden font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-400 lg:inline"
            title="Active proctor severity policy — tune it in the Question bank › timer policy panel"
          >
            policy · paste warn &gt; {thresholds.pasteWarnChars} · risk &gt; {thresholds.pasteRiskChars} chars · explain warn &lt; {thresholds.explainWarnPct}%
          </span>
        )}
        {riskCount > 0 && (
          <Badge variant="outline" className="border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
            <ShieldAlert className="mr-1 h-3 w-3" /> {riskCount} risk signal{riskCount === 1 ? "" : "s"}
          </Badge>
        )}
        <p className="ml-auto max-w-md text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          Disclosed monitoring — candidates are informed and only aggregated activity (pastes, runs, focus, hints) is streamed, never keystroke content.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* live sessions */}
        <section aria-label="Live sessions" className="space-y-3">
          <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> In progress
          </p>
          {sessions.length === 0 ? (
            <Card className="rounded-lg border-dashed border-border bg-card shadow-none">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <Radio className="h-6 w-6 text-zinc-400 dark:text-zinc-400" />
                <p className="text-xs text-muted-foreground">
                  Waiting for live sessions. They appear the moment a candidate starts an assessment.
                </p>
              </CardContent>
            </Card>
          ) : (
            sessions.map((s) => (
              <Card key={s.candidateId} className="sp-slide-in rounded-lg border-emerald-200 dark:border-emerald-800/60 bg-card shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {initials(s.candidateName) || "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.candidateName}</p>
                      <p className="text-[11px] text-muted-foreground">started {relTime(s.startedAt, now)}</p>
                    </div>
                    <span className="flex items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                      <Timer className="h-3 w-3" /> {elapsed(s.startedAt, now)}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="sp-live-dot h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    <span className="min-w-0 truncate">
                      last: {s.lastType.replace(/_/g, " ")} · {s.eventCount} event{s.eventCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {/* event feed */}
        <section aria-label="Live event feed" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Activity className="h-3.5 w-3.5" /> Event stream
            </p>
            <div className="ml-auto flex items-center gap-1.5">
              {(
                [
                  ["all", "All"],
                  ["warn", "Warnings"],
                  ["risk", "Risk only"],
                ] as Array<[SevFilter, string]>
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  onClick={() => setSevFilter(key)}
                  aria-pressed={sevFilter === key}
                  className={cn(
                    "h-7 rounded-full px-3 text-[11px]",
                    sevFilter === key
                      ? "border-zinc-950 dark:border-zinc-100 bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                      : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  {label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEvents([]);
                  toast.success("Event stream cleared");
                }}
                className="h-7 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <Trash2 className="mr-1 h-3 w-3" /> Clear
              </Button>
            </div>
          </div>

          <Card className="rounded-lg border-border bg-card shadow-none">
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                <div className="divide-y divide-border/60">
                  {visibleEvents.length === 0 ? (
                    <p className="p-8 text-center text-xs text-muted-foreground">
                      {events.length === 0
                        ? "No events yet. Open a candidate assessment in another tab and activity will stream here in real time."
                        : "No events match the current severity filter."}
                    </p>
                  ) : (
                    visibleEvents.map((e) => {
                      const Icon = iconFor(e.type);
                      const sev = SEV_STYLE[e.severity];
                      return (
                        <div key={e.id} className="sp-slide-in flex items-start gap-2.5 px-4 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", sev.dot)} />
                          <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", sev.text)} />
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-xs leading-snug", sev.text)}>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{e.candidateName}</span>{" "}
                              <span className="text-zinc-500 dark:text-zinc-400">·</span> {e.detail}
                            </p>
                            <p className="mt-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
                              {relTime(e.ts, now)} · {e.type.replace(/_/g, " ")}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── transcripts — the persisted stream, readable after the run ── */}
      <section aria-label="Proctor transcripts" className="mt-5 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleTranscripts}
            aria-expanded={transcriptsOpen}
            className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <Archive className="h-3.5 w-3.5" /> Proctor transcripts
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", transcriptsOpen && "rotate-180")} />
          </button>
          <span className="text-[11px] text-muted-foreground">
            persisted event history — review a session after it ends
          </span>
          {transcriptsOpen && (
            <Button
              size="sm"
              variant="ghost"
              onClick={loadTranscriptIndex}
              disabled={transcriptLoading}
              className="ml-auto h-7 px-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <RefreshCw className={cn("mr-1 h-3 w-3", transcriptLoading && "animate-spin")} /> Refresh
            </Button>
          )}
        </div>

        {transcriptsOpen && (
          <div className="mt-3">
            {transcriptSessions === null ? (
              <p className="p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">loading…</p>
            ) : transcriptSessions.length === 0 ? (
              <p className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-card p-6 text-center text-xs text-muted-foreground">
                No persisted transcripts yet. Sessions appear here once a candidate streams events — the proctor
                service flushes them to the evidence store every couple of seconds.
              </p>
            ) : (
              <div className="overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-card">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40">
                      <th scope="col" className="px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Candidate</th>
                      <th scope="col" className="hidden px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">Assessment</th>
                      <th scope="col" className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Events</th>
                      <th scope="col" className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Signals</th>
                      <th scope="col" className="hidden px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground md:table-cell">Last activity</th>
                      <th scope="col" className="px-3 py-2" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {transcriptSessions.map((s) => {
                      const isOpen = openTranscriptId === s.assessmentId;
                      return (
                        <TranscriptRow
                          key={s.assessmentId}
                          session={s}
                          open={isOpen}
                          events={isOpen ? transcriptEvents : null}
                          loading={isOpen && transcriptLoading}
                          now={now}
                          onToggle={() => openTranscript(s.assessmentId)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
