"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CodeEditor } from "@/components/skillproof/code-editor";
import { useStore } from "@/lib/store";
import { BehaviorTracker } from "@/lib/behavior";
import { summarizeEvent } from "@/lib/metrics";
import { CODE_LANGUAGES, codeLanguageMeta, type CodeLanguage } from "@/lib/code-languages";
import {
  emitProctorEvent,
  joinAsCandidate,
  leaveAsCandidate,
  type ProctorEvent,
  type ProctorIdentity,
} from "@/lib/proctor";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  Cpu,
  Database,
  Eraser,
  Eye,
  FileCode2,
  Flag,
  History,
  Keyboard,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquareCode,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Timer,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type {
  BehaviorEvent,
  ClientQuestion,
  ClientTestResult,
  CodeAnalysis,
  ExplainEvaluation,
  ExplainQuestion,
  PaletteRow,
} from "@/lib/types";

interface SubmitResponse {
  type: "coding" | "debugging" | "mcq";
  passed?: boolean;
  score: number;
  status: string;
  correct?: boolean;
  answerIndex?: number | null;
  explanation?: string | null;
  compileError?: string;
  logs?: string[];
  maxRuntimeMs?: number;
  analysis?: CodeAnalysis;
  aiRisk?: { score: number; signals: string[]; confidence: string };
  results?: ClientTestResult[];
  hintsUsed?: number;
  hintPenaltyPct?: number;
  /** error paths carry these (e.g. QUESTION_EXPIRED after the server deadline) */
  error?: string;
  code?: string;
}

type Phase = "loading" | "intro" | "question" | "result" | "explain" | "explainDone" | "finishing";

interface IntroPlanSkill {
  skill: string;
  claimedLevel: string;
  coding: number;
  debugging: number;
  mcq: number;
}

interface TimerPolicyValues {
  debuggingMin: number;
  dsaEasyMin: number;
  dsaMediumMin: number;
  dsaHardMin: number;
  mcqSec: number;
  /** Per-skill overrides (minutes per question) — replace the section limit. */
  skillOverrides: Record<string, number>;
  /** Proctor live-stream severity thresholds (recruiter-tuned). */
  pasteWarnChars: number;
  pasteRiskChars: number;
  explainWarnPct: number;
}

interface FeedEntry {
  id: number;
  text: string;
  kind: string;
}

const LANG_STORAGE_KEY = "skillproof:code-language";

/** Namespaced local-draft key — candidate × assessment × question × language.
 *  Local drafts are a convenience net against an accidental refresh; they are
 *  NEVER authoritative assessment data (the server's state always wins). */
function draftStorageKey(
  candidateId: string | null,
  assessmentId: string | null,
  aqId: string,
  language: string
): string {
  return `skillproof:draft:${candidateId ?? "anon"}:${assessmentId ?? "none"}:${aqId}:${language}`;
}

function loadPreferredLanguage(): CodeLanguage {
  if (typeof window === "undefined") return "javascript";
  try {
    const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
    return raw === "python" || raw === "cpp" || raw === "java" || raw === "javascript" || raw === "sql"
      ? raw
      : "javascript";
  } catch {
    return "javascript";
  }
}

/** Languages offered for a question (legacy questions may only carry `language`) */
function offeredLanguages(q: ClientQuestion): string[] {
  if (q.languages?.length) return q.languages;
  return q.language === "sql" ? ["sql"] : ["javascript"];
}

/** SQL questions offer only "sql" — the candidate writes a single SELECT (SQLite) */
function isSqlQuestion(q: ClientQuestion): boolean {
  return q.languages?.includes("sql") ?? q.language === "sql";
}

export function AssessmentStep() {
  const store = useStore();
  const assessmentId = store.assessmentId;
  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState<ClientQuestion | null>(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState<CodeLanguage>("javascript");
  const [runResults, setRunResults] = useState<ClientTestResult[] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [mcqChoice, setMcqChoice] = useState<number | null>(null);
  const [explainQs, setExplainQs] = useState<ExplainQuestion[] | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainAnswers, setExplainAnswers] = useState<string[]>([]);
  const [explainEvals, setExplainEvals] = useState<ExplainEvaluation[] | null>(null);
  const [explainSubmitting, setExplainSubmitting] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [resolvedCount, setResolvedCount] = useState(0);
  // timestamp of the last server-confirmed persistence (submit/skip/deal) —
  // powers the exam bar's "Saved Ns ago" chip (honest: only set on res.ok)
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hintState, setHintState] = useState<{ text: string; penaltyPct: number; count: number } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [introPlan, setIntroPlan] = useState<{ skills: IntroPlanSkill[]; total: number } | null>(null);
  const [policy, setPolicy] = useState<TimerPolicyValues | null>(null);
  const [palette, setPalette] = useState<PaletteRow[]>([]);
  const [paletteBusyId, setPaletteBusyId] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  // mobile question-navigation drawer (desktop keeps the persistent left panel)
  const [paletteOpen, setPaletteOpen] = useState(false);
  // finish confirmation dialog: never complete without an explicit,
  // informed confirm showing the REAL answered/skipped/remaining counts
  const [finishOpen, setFinishOpen] = useState(false);
  // honest save-state chip: set when a mutation fails to reach the server,
  // cleared the moment anything persists successfully
  const [saveError, setSaveError] = useState(false);
  // a locally-stored draft was restored for this question (display only —
  // the server's assessment state stays authoritative)
  const [recoveredDraft, setRecoveredDraft] = useState(false);
  // MCQ validation nudge — inline feedback when the candidate tries to save
  // without selecting an option (Ctrl+Enter / Save with nothing picked)
  const [mcqNudge, setMcqNudge] = useState(false);
  // tab-switch enforcement: warning on the first switch, auto-submit on the second
  const [strikes, setStrikes] = useState(0);
  const [focusWarning, setFocusWarning] = useState(false);
  const violationsRef = useRef(0);
  const autoSubmitRef = useRef(false);
  const startedRef = useRef(false);
  const finishRef = useRef<() => Promise<void>>(async () => {});

  const trackerRef = useRef<BehaviorTracker | null>(null);
  const feedIdRef = useRef(0);
  const dealtRef = useRef(false);
  const submitLockRef = useRef(false);
  // per-language code drafts for the current question (switching keeps work)
  const langDraftsRef = useRef<Map<string, string>>(new Map());
  // "recovered previous work" toast fires once per question, not per revisit
  const recoveredToastRef = useRef<Set<string>>(new Set());
  // mirrors mcqChoice for the window-level keyboard handler (never stale)
  const mcqChoiceRef = useRef<number | null>(null);
  // re-entry guard for adaptive dealing — a double-clicked Next must never
  // deal two questions (spec: prevent duplicate navigation)
  const dealLockRef = useRef(false);

  // ── live proctoring (disclosed, real-time recruiter view) ─────────────
  const identityRef = useRef<ProctorIdentity | null>(null);
  const pEvent = useCallback((type: string, detail: string, severity: ProctorEvent["severity"] = "info") => {
    const idn = identityRef.current;
    if (idn) emitProctorEvent(idn, type, detail, severity);
  }, []);

  // join the live session once the identity is known (re-runs after hydration)
  const candidateId = store.candidateId;
  const candidateName = store.candidateName;
  useEffect(() => {
    if (!assessmentId || !candidateId) return;
    if (!identityRef.current) {
      identityRef.current = {
        candidateId,
        candidateName: candidateName || "Candidate",
        assessmentId,
      };
    } else {
      identityRef.current = { ...identityRef.current, candidateId, candidateName: candidateName || "Candidate", assessmentId };
    }
    joinAsCandidate(identityRef.current);
  }, [assessmentId, candidateId, candidateName]);

  // leave the live session on unmount (finish → results, or navigation away)
  useEffect(() => {
    return () => {
      const idn = identityRef.current;
      if (idn) leaveAsCandidate(idn);
    };
  }, []);

  const pushFeed = useCallback((e: BehaviorEvent) => {
    feedIdRef.current += 1;
    // capture the id BEFORE the updater: batched updaters execute after the
    // synchronous block, so reading feedIdRef inside them would give several
    // events the same (final) id → duplicate React keys + lost feed entries
    const id = feedIdRef.current;
    setFeed((f) => [...f.slice(-40), { id, text: summarizeEvent(e), kind: e.type }]);
  }, []);

  const getTracker = useCallback(() => {
    if (!trackerRef.current) trackerRef.current = new BehaviorTracker();
    return trackerRef.current;
  }, []);

  const refreshPalette = useCallback(async () => {
    if (!assessmentId) return;
    try {
      const res = await fetch(`/api/assessment/${assessmentId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.palette)) setPalette(data.palette as PaletteRow[]);
    } catch {
      // palette is a navigation aid — a failed refresh leaves the last known state
    }
  }, [assessmentId]);

  // ── deal question ────────────────────────────────────────────────────────
  /** Reset per-question client state and mount a dealt question */
  const applyQuestion = useCallback(
    (q: ClientQuestion) => {
      startedRef.current = true;
      setQuestion(q);
      // seed per-language drafts; restore locally-backed drafts when present
      // (namespaced by candidate × assessment × question × language — a
      // convenience net, never authoritative assessment data)
      const restored = new Map<string, string>();
      const draftCid = useStore.getState().candidateId;
      for (const lang of offeredLanguages(q)) {
        try {
          const raw = window.localStorage.getItem(draftStorageKey(draftCid, assessmentId, q.aqId, lang));
          if (raw && raw.trim()) restored.set(lang, raw);
        } catch {}
      }
      langDraftsRef.current = restored;
      const offered = offeredLanguages(q);
      const pref = loadPreferredLanguage();
      // fall back to the question's first offered language (SQL questions only offer "sql")
      const initial = (offered.includes(pref) ? pref : offered[0]) as CodeLanguage;
      setLanguage(initial);
      const starter = q.starters?.[initial] ?? q.starterCode ?? "";
      const draft = restored.get(initial);
      const recoveredHere = !!draft && draft.trim() !== "" && draft !== starter;
      setCode(recoveredHere ? draft : starter);
      setRecoveredDraft(recoveredHere);
      if (recoveredHere && !recoveredToastRef.current.has(q.aqId)) {
        recoveredToastRef.current.add(q.aqId);
        toast.info("Recovered your previous work on this question from this browser.", { duration: 6000 });
      }
      setRunResults(null);
      setRunError(null);
      setSubmitResult(null);
      setMcqChoice(null);
      setExplainQs(null);
      setExplainEvals(null);
      setExplainAnswers([]);
      setSubmissionId(null);
      setHintState(q.hintsUsed > 0 ? { text: "", penaltyPct: 0, count: q.hintsUsed } : null);
      // the countdown SEEDS from the server's authoritative remaining time —
      // after a refresh/reconnect the clock continues where the server says,
      // never from a browser-local guess
      setTimeLeft(q.remainingSec ?? q.timeLimitSec);
      setPhase("question");
      const tr = getTracker();
      tr.reset();
      tr.startPeriodicSnapshots(() => codeRef.current);
      pushFeed({ type: "question_open", t: 0 });
      pEvent("question_open", `Q${q.order} · ${q.title} (${q.category} · ${q.difficulty})`, "info");
    },
    [assessmentId, getTracker, pushFeed, pEvent]
  );

  const dealQuestion = useCallback(
    async (body?: { skill?: string; result?: string }) => {
      if (!assessmentId || dealLockRef.current) return;
      dealLockRef.current = true;
      setPhase("loading");
      try {
        const res = await fetch(`/api/assessment/${assessmentId}/next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.done || !data.question) {
          void finishAssessment();
          return;
        }
        applyQuestion(data.question as ClientQuestion);
        setSavedAt(Date.now());
        void refreshPalette();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load question");
      } finally {
        dealLockRef.current = false;
      }
    },
    // finishAssessment reads only refs and stable store setters — safe to omit
    [assessmentId, applyQuestion, refreshPalette]
  );

  const codeRef = useRef(code);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // debounced LOCAL draft backup (not assessment data): a recovery net for the
  // candidate on accidental refresh. No keystroke ever goes to the server here
  // — persistence to the server happens only on explicit submit.
  useEffect(() => {
    if (phase !== "question" || !question) return;
    const starter = question.starters?.[language] ?? question.starterCode ?? "";
    if (!code.trim() || code === starter) return;
    const id = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftStorageKey(useStore.getState().candidateId, assessmentId, question.aqId, language),
          code
        );
      } catch {}
    }, 800);
    return () => clearTimeout(id);
  }, [code, language, question, phase, assessmentId]);

  useEffect(() => {
    if (dealtRef.current || !assessmentId) return;
    dealtRef.current = true;
    (async () => {
      try {
        const stateRes = await fetch(`/api/assessment/${assessmentId}`);
        const state = await stateRes.json();
        if (stateRes.ok && state.status === "completed") {
          const repRes = await fetch(`/api/report/${assessmentId}`);
          const rep = await repRes.json();
          if (repRes.ok) {
            store.setReport(rep, assessmentId);
            store.setCandidateStep("results");
            return;
          }
        }
        if (stateRes.ok && state.progress && state.progress.resolved > 0) {
          // resumed mid-flow — continue where the candidate left off; sync the
          // plan total so the header/palette/placeholders show the real count
          if (state.progress.total) {
            useStore.getState().setAssessmentTotal(state.progress.total);
          }
          toast.info("Session recovered — continuing where you left off.", { duration: 6000 });
          void dealQuestion();
          return;
        }
        if (stateRes.ok && state.skills) {
          // fresh assessment — show the prep / rules screen first
          setIntroPlan({ skills: state.skills, total: state.progress?.total ?? 0 });
          if (state.progress?.total) {
            useStore.getState().setAssessmentTotal(state.progress.total);
          }
          setPhase("intro");
          // recruiter-configured section-wise limits drive the time estimate
          fetch("/api/timer-policy")
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d?.policy && setPolicy(d.policy))
            .catch(() => {});
          return;
        }
      } catch {
        // fall through to normal flow
      }
      void dealQuestion();
    })();
  }, [assessmentId]);

  // focus policing — disclosed, like real test-conducting software: the first
  // tab switch records a warning (blocking overlay on return), the second
  // auto-submits the test with whatever has been answered so far
  const autoSubmitForViolation = useCallback(() => {
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    setFocusWarning(false);
    pEvent("auto_submit", "Second tab-switch violation — test auto-submitted by proctoring policy", "risk");
    toast.error("Assessment auto-submitted — the test window was left twice.", { duration: 10000 });
    void finishRef.current();
  }, [pEvent]);

  useEffect(() => {
    const onVis = () => {
      const tr = trackerRef.current;
      const examLive =
        phase === "question" || phase === "result" || phase === "explain" || phase === "explainDone";
      if (document.hidden) {
        if (!tr || !examLive) return;
        tr.tabBlur();
        pushFeed({ type: "tab_blur", t: tr.t() });
        pEvent("focus_lost", "Left the assessment tab", "warn");
        violationsRef.current += 1;
        setStrikes(violationsRef.current);
        if (violationsRef.current >= 2) {
          autoSubmitForViolation();
        } else {
          pEvent("tab_warning", `Tab switch recorded — warning ${violationsRef.current} of 2`, "warn");
          toast.warning(
            `Warning ${violationsRef.current} of 2 — stay on the test window. A second switch auto-submits the test.`,
            { duration: 8000 }
          );
        }
      } else {
        if (tr && examLive) {
          tr.tabFocus();
          pushFeed({ type: "tab_focus", t: tr.t() });
          pEvent("focus_back", "Returned to the assessment tab", "info");
        }
        // the warning overlay waits for the return — the candidate must acknowledge it
        if (examLive && violationsRef.current === 1) {
          setFocusWarning(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase, pushFeed, pEvent, autoSubmitForViolation]);

  // timer — pure countdown; the expiry side-effect lives in the effect below
  // (state updaters must stay pure — React may double-invoke them in dev)
  useEffect(() => {
    if (phase !== "question" || !question) return;
    const iv = setInterval(() => {
      setTimeLeft((t) => (t <= 0 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [phase, question?.aqId]);

  // expiry trigger — fires the timeout flow exactly once per question when
  // the display clock lands on zero. The server deadline remains the
  // authority: if the submit arrives after dealtAt + timeLimitSec it comes
  // back QUESTION_EXPIRED and the run continues on the same terms.
  const handledTimeoutRef = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "question" || timeLeft !== 0 || !question) return;
    if (handledTimeoutRef.current === question.aqId) return;
    handledTimeoutRef.current = question.aqId;
    void handleTimeout();
    // handleTimeout is re-created each render but exactly-once guarded above;
    // keying on phase/timeLeft/aqId keeps the trigger scoped to the live question
  }, [phase, timeLeft, question?.aqId]);

  // exam chrome: the shell hides stepper/footer while the runner is live.
  // Once the first question is dealt, inter-question loading keeps the surface.
  const examLive =
    phase === "question" ||
    phase === "result" ||
    phase === "explain" ||
    phase === "explainDone" ||
    (phase === "loading" && startedRef.current);
  useEffect(() => {
    useStore.getState().setExamActive(examLive);
    return () => useStore.getState().setExamActive(false);
  }, [examLive]);

  // unsaved-change protection: a live exam holds server-side state and a
  // running timer — an accidental refresh/close must ask first. The runner
  // itself is fully persisted per action, so the wording stays honest.
  useEffect(() => {
    if (!examLive) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy convention: Chrome/IE require returnValue to show the dialog
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [examLive]);

  // ── language switching (coding questions, JS/Python/C++/Java) ──────────
  /** Clear the local draft net for a question — called once the server has
   *  durably accepted the submission (the run for that question is over). */
  const clearQuestionDrafts = (q: ClientQuestion) => {
    const cid = useStore.getState().candidateId;
    try {
      for (const lang of offeredLanguages(q)) {
        window.localStorage.removeItem(draftStorageKey(cid, assessmentId, q.aqId, lang));
      }
    } catch {}
  };

  const switchLanguage = (next: string) => {
    if (!question) return;
    const meta = codeLanguageMeta(next);
    if (!meta || next === language) return;
    // keep the current draft per language, then load (or seed) the target draft
    langDraftsRef.current.set(language, code);
    // flush the outgoing language's draft to local storage immediately — the
    // debounced backup effect would be cancelled by this re-render
    try {
      if (code.trim()) {
        window.localStorage.setItem(
          draftStorageKey(useStore.getState().candidateId, assessmentId, question.aqId, language),
          code
        );
      }
    } catch {}
    const hadDraft = langDraftsRef.current.has(next);
    const nextCode = langDraftsRef.current.get(next) ?? question.starters?.[next] ?? "";
    setLanguage(next as CodeLanguage);
    setCode(nextCode);
    setRunResults(null);
    setRunError(null);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {}
    pEvent(
      "language_switch",
      hadDraft ? `Switched to ${meta.label} — draft restored` : `Switched to ${meta.label} — starter loaded`,
      "info"
    );
    toast.info(
      hadDraft ? `${meta.label} — your ${meta.label} draft was restored` : `${meta.label} starter template loaded`
    );
  };

  const handleTimeout = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    toast.warning("Time is up for this question");
    const q = question;
    if (q?.category === "mcq") {
      await submitMcq(-1, true);
    } else if (q) {
      await submitCode(true);
    }
  };

  // ── actions ──────────────────────────────────────────────────────────────
  const runCode = async () => {
    if (!question || running) return;
    setRunning(true);
    setRunError(null);
    const tr = getTracker();
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aqId: question.aqId, code, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRunResults(data.results);
      setRunError(data.compileError ?? null);
      tr.run(data.passedCount, data.total, !!(data.compileError || data.results?.some((r: ClientTestResult) => r.error)));
      pushFeed({ type: "run", t: tr.t(), passCount: data.passedCount, total: data.total, error: !!(data.compileError || data.results?.some((r: ClientTestResult) => r.error)) });
      tr.snapshot(code, "post-run");
      pEvent(
        "run_tests",
        `Ran tests — ${data.passedCount}/${data.total} passed`,
        data.passedCount === data.total ? "good" : "warn"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setRunning(false);
    }
  };

  const submitCode = async (timeout = false) => {
    if (!question || submitting) return;
    // the expiry flow carries its own exactly-once guard and MUST proceed even
    // though handleTimeout holds the lock (it exists to block USER submissions
    // on the expired question, not the authoritative timeout itself)
    if (!timeout && submitLockRef.current) return;
    if (!timeout && code.trim().length < 10) {
      toast.error("Write some code before submitting");
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    const tr = getTracker();
    tr.submitAttempt();
    tr.snapshot(code, "pre-submit");
    tr.stopPeriodicSnapshots();
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aqId: question.aqId,
          code,
          language,
          events: tr.events,
          versions: tr.versions,
          timeSpentSec: tr.elapsedSec(),
        }),
      });
      const data: SubmitResponse = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.code === "QUESTION_EXPIRED") {
          // the SERVER closed this question at its deadline (the browser clock
          // is only a display) — surface the timeout and let the run continue
          const timedOut: SubmitResponse = {
            type: question.category,
            passed: false,
            score: 0,
            status: "timeout",
          };
          setSubmitResult(timedOut);
          setResolvedCount((c) => c + 1);
          setSaveError(false);
          setPhase("result");
          void refreshPalette();
          pEvent("timeout", "Question closed by the server deadline", "warn");
          toast.warning("Time is up — the question was closed on the server.");
          if (question) clearQuestionDrafts(question);
          return;
        }
        throw new Error(data.explanation || data.error || "Submit failed");
      }
      setSubmitResult(data);
      setSavedAt(Date.now());
      setSaveError(false);
      clearQuestionDrafts(question);
      setResolvedCount((c) => c + 1);
      setPhase("result");
      pushFeed({ type: "submit_attempt", t: tr.t() });
      void refreshPalette();
      pEvent(
        "submit",
        `Solution submitted — scored ${data.score}/100`,
        data.passed ? "good" : "warn"
      );
      if (data.passed) toast.success(`All tests passed — scored ${data.score}/100`);
      else toast.warning(`Scored ${data.score}/100 — ${data.results ? `${data.results.filter((r) => r.pass).length}/${data.results.length} tests` : ""}`);
    } catch (err) {
      setSaveError(true);
      toast.error(err instanceof Error ? err.message : "Submit failed");
      submitLockRef.current = false;
      tr.startPeriodicSnapshots(() => codeRef.current);
    } finally {
      setSubmitting(false);
    }
  };

  const submitMcq = async (index: number, timeout = false) => {
    if (!question || submitting) return;
    // same lock carve-out as submitCode — see note above
    if (!timeout && submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    const tr = getTracker();
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aqId: question.aqId,
          mcqAnswerIndex: index,
          timeSpentSec: tr.elapsedSec(),
        }),
      });
      const data: SubmitResponse = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.code === "QUESTION_EXPIRED") {
          // server closed the question at its deadline — surface the timeout
          const timedOut: SubmitResponse = {
            type: "mcq",
            passed: false,
            score: 0,
            status: "timeout",
            correct: false,
          };
          setSubmitResult(timedOut);
          setResolvedCount((c) => c + 1);
          setSaveError(false);
          setPhase("result");
          void refreshPalette();
          pEvent("timeout", "MCQ closed by the server deadline", "warn");
          toast.warning("Time is up — the question was closed on the server.");
          return;
        }
        throw new Error(data.error || "Submit failed");
      }
      setSubmitResult(data);
      setSavedAt(Date.now());
      setSaveError(false);
      setResolvedCount((c) => c + 1);
      setPhase("result");
      void refreshPalette();
      pEvent("mcq", `MCQ answered — ${data.correct ? "correct" : "incorrect"}`, data.correct ? "good" : "warn");
      if (data.correct) toast.success("Correct!");
      else if (!timeout) toast.warning("Incorrect — noted in evidence");
    } catch {
      setSaveError(true);
      toast.error("Submit failed");
      submitLockRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  const goExplain = async () => {
    if (!question || !submitResult) return;
    setExplainLoading(true);
    setPhase("explain");
    pEvent("explain_start", "Explain-your-code phase started", "info");
    try {
      const listRes = await fetch(`/api/assessment/${assessmentId}/explain?aqId=${question.aqId}`);
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error);
      setExplainQs(listData.questions);
      setExplainAnswers(listData.questions.map(() => ""));
      // (submission id resolution happens in the explain POST below — the aq
      // snapshot endpoint is read-only and its result is not needed here)
    } catch {
      toast.error("Could not load verification questions — using defaults");
      setExplainQs([
        { q: "Walk me through your overall approach and why you chose it.", hint: "" },
        { q: "What is the time and space complexity of your solution?", hint: "" },
        { q: "Which edge cases does your solution handle, and how?", hint: "" },
      ]);
      setExplainAnswers(["", "", ""]);
    } finally {
      setExplainLoading(false);
    }
  };

  const submitExplain = async () => {
    if (!explainQs || !question) return;
    if (explainAnswers.some((a) => a.trim().length < 10)) {
      toast.error("Answer every verification question (at least a sentence)");
      return;
    }
    setExplainSubmitting(true);
    try {
      // resolve submissionId by aqId
      const res = await fetch(`/api/assessment/${assessmentId}/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: await resolveSubmissionId(question.aqId),
          answers: explainQs.map((q, i) => ({ q: q.q, answer: explainAnswers[i] })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setExplainEvals(data.evaluations);
      setSavedAt(Date.now());
      setPhase("explainDone");
      const avgC = Math.round(data.evaluations.reduce((a: number, e: ExplainEvaluation) => a + e.score, 0) / data.evaluations.length);
      pEvent(
        "explain_done",
        `Explanation evaluated — ${avgC}% consistency`,
        avgC >= (policy?.explainWarnPct ?? 70) ? "good" : "warn"
      );
      toast.success(`Explanation evaluated — ${avgC}% consistency`, { description: "This feeds the code–explanation consistency signal." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setExplainSubmitting(false);
    }
  };

  const resolveSubmissionId = async (aqId: string): Promise<string> => {
    const res = await fetch(`/api/assessment/${assessmentId}/explain?aqId=${aqId}`);
    const data = await res.json();
    return data.submissionId ?? "";
  };

  const finishAssessment = async () => {
    if (!assessmentId) return;
    setPhase("finishing");
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // staged reveal for effect
      await new Promise((r) => setTimeout(r, 600));
      pEvent("session_end", "Verification finished — verified profile generated", "good");
      const idn = identityRef.current;
      if (idn) leaveAsCandidate(idn);
      store.setReport(data, assessmentId);
      store.setCandidateStep("results");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate report");
      setPhase("question");
    }
  };

  const nextQuestion = () => {
    submitLockRef.current = false;
    if (!question || !submitResult) return;
    let result: string = "solved";
    if (question.category === "mcq") {
      result = submitResult.correct ? (timeSpentFast() ? "solved_fast" : "solved") : "failed";
    } else {
      const allPass = submitResult.passed;
      const somePass = submitResult.results?.some((r) => r.pass) ?? false;
      result = allPass ? (timeSpentFast() ? "solved_fast" : "solved") : somePass ? "partial" : "failed";
    }
    void dealQuestion({ skill: question.skill, result: result as "solved_fast" | "solved" | "partial" | "failed" });
  };

  const timeSpentFast = () => {
    if (!question) return false;
    return (trackerRef.current?.elapsedSec() ?? 9999) <= question.timeLimitSec * 0.4;
  };

  // keep the visibility handler pointed at the latest finisher
  useEffect(() => {
    finishRef.current = finishAssessment;
  });

  // ── skip & return (palette navigation) ───────────────────────────────
  const skipQuestion = async () => {
    if (!question || skipping || submitting || submitLockRef.current) return;
    setSkipping(true);
    const tr = getTracker();
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aqId: question.aqId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      tr.stopPeriodicSnapshots();
      pushFeed({ type: "question_skipped", t: tr.t() });
      setSavedAt(Date.now());
      setSaveError(false);
      pEvent("question_skipped", `Skipped Q${question.order} · ${question.title} — parked for revisit`, "warn");
      toast.info("Question parked — return to it anytime from the question palette.");
      await dealQuestion();
    } catch (err) {
      setSaveError(true);
      toast.error(err instanceof Error ? err.message : "Could not skip this question");
    } finally {
      setSkipping(false);
    }
  };

  const revisitQuestion = async (aqId: string) => {
    if (paletteBusyId) return;
    if (submitLockRef.current || submitting || skipping) {
      toast.info("Finish this question's flow first — the palette unlocks on the next question screen.");
      return;
    }
    setPaletteBusyId(aqId);
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/goto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aqId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const q = data.question as ClientQuestion;
      pEvent("revisit_open", `Returned to Q${q.order} · ${q.title}`, "info");
      applyQuestion(q);
      void refreshPalette();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen this question");
    } finally {
      setPaletteBusyId(null);
    }
  };

  const ackFocusWarning = () => {
    setFocusWarning(false);
    pEvent("warning_ack", "Acknowledged the tab-switch warning — resumed the test", "info");
  };

  // ── hint reveal (disclosed aid — recorded as evidence) ────────────────
  const revealHint = async () => {
    if (!question || !question.hasHint || hintLoading || hintState?.text) return;
    setHintLoading(true);
    const tr = getTracker();
    try {
      const res = await fetch(`/api/assessment/${assessmentId}/hint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aqId: question.aqId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHintState({ text: data.hint, penaltyPct: data.penaltyPct ?? 0, count: data.hintCount ?? 1 });
      tr.hintUsed();
      pushFeed({ type: "hint", t: tr.t() });
      pEvent("hint_revealed", `Revealed a hint — score adjustment −${data.penaltyPct ?? 4}% (disclosed)`, "warn");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reveal hint");
    } finally {
      setHintLoading(false);
    }
  };

  // ── progress summary (single source of truth for header AND palette) ──
  // answered = server-locked rows (solved/failed/timeout). resolvedCount wins
  // transiently (increments the instant a submit lands, before the palette
  // refetch returns) so the header updates immediately after every action;
  // the palette rows keep resumed sessions honest. Skipped is NEVER counted
  // as answered — it stays an open, revisit-able row.
  const summary = useMemo(() => {
    const totalQ = store.assessmentTotal || Math.max(resolvedCount, 1);
    const answeredRows = palette.filter((r) => ANSWERED_STATUSES.has(r.status)).length;
    const answered = Math.max(resolvedCount, answeredRows);
    const skipped = palette.filter((r) => r.status === "skipped").length;
    const remaining = Math.max(0, totalQ - answered - skipped);
    return {
      total: totalQ,
      answered,
      skipped,
      remaining,
      pct: totalQ > 0 ? Math.round((answered / totalQ) * 100) : 0,
    };
  }, [store.assessmentTotal, resolvedCount, palette]);

  // ── Previous-question target (engine rule: ONLY skipped rows are
  // revisitable — solved/failed/timeout are locked server-side and goto
  // 409s). "Previous" therefore jumps to the nearest parked question behind
  // the current one; the engine parks the on-screen question in the same
  // transaction and re-arms a fresh server deadline for the target.
  const previousTarget = useMemo(() => {
    if (!question) return null;
    return (
      palette
        .filter((r) => r.status === "skipped" && r.order < question.order)
        .sort((a, b) => b.order - a.order)[0] ?? null
    );
  }, [palette, question?.order, question]);

  // ── context-aware primary action (mirrored by the footer bar, the in-panel
  // controls, and Ctrl/Cmd+Enter) — always the "obvious way to continue" for
  // the current question type and phase, persisting before advancing:
  const primaryAction = useMemo((): {
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    disabled: boolean;
    run: () => void;
  } | null => {
    if (!examLive) return null;
    const pending = submitting || skipping || explainSubmitting || paletteBusyId !== null;
    if (phase === "question" && question) {
      if (question.category === "mcq") {
        return {
          label: "Save & next",
          shortLabel: "Save & next",
          icon: <Send className="h-4 w-4" />,
          disabled: mcqChoice == null || submitting,
          run: () => void submitMcq(mcqChoice ?? -1),
        };
      }
      const label =
        question.category === "debugging" ? "Submit fix" : isSqlQuestion(question) ? "Submit answer" : "Submit solution";
      return {
        label,
        shortLabel: label,
        icon: <Send className="h-4 w-4" />,
        disabled: pending || code.trim().length < 10,
        run: () => void submitCode(),
      };
    }
    if (phase === "result" && submitResult) {
      return submitResult.type === "mcq"
        ? {
            label: "Next question",
            shortLabel: "Next",
            icon: <ArrowRight className="h-4 w-4" />,
            disabled: false,
            run: nextQuestion,
          }
        : {
            label: "Explain my solution",
            shortLabel: "Explain",
            icon: <MessageSquareCode className="h-4 w-4" />,
            disabled: false,
            run: () => void goExplain(),
          };
    }
    if (phase === "explain") {
      return {
        label: "Submit explanation",
        shortLabel: "Submit",
        icon: <Eye className="h-4 w-4" />,
        disabled: explainSubmitting || explainLoading || !explainQs,
        run: () => void submitExplain(),
      };
    }
    if (phase === "explainDone") {
      return {
        label: "Next question",
        shortLabel: "Next",
        icon: <ArrowRight className="h-4 w-4" />,
        disabled: false,
        run: nextQuestion,
      };
    }
    return null;
  }, [examLive, phase, question, mcqChoice, submitResult, code, submitting, skipping, explainSubmitting, explainLoading, explainQs, paletteBusyId, nextQuestion, submitMcq, submitCode, goExplain, submitExplain]);

  // keep the keyboard shortcut handler pointed at the latest primary action
  const primaryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    primaryRef.current = primaryAction && !primaryAction.disabled ? primaryAction.run : null;
    // mirror for the window-level key handler (reads never go stale)
    mcqChoiceRef.current = mcqChoice;
  });

  // Ctrl/Cmd+Enter is the "primary editor action" — and it must NEVER submit:
  // on code questions it runs the tests (matching Monaco's own binding), on
  // MCQ it saves the explicitly selected answer, in result/explain phases it
  // triggers the obvious continuation. Kept separate from the footer primary
  // so a stray Ctrl+Enter can never submit an unfinished solution.
  const ctrlEnterRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (phase === "question" && question) {
      if (question.category === "mcq") {
        ctrlEnterRef.current =
          mcqChoice != null && !submitting ? () => void submitMcq(mcqChoice) : null;
      } else {
        ctrlEnterRef.current = !running ? () => void runCode() : null;
      }
    } else if (phase === "result" && submitResult) {
      ctrlEnterRef.current =
        submitResult.type === "mcq" ? nextQuestion : () => void goExplain();
    } else if (phase === "explain") {
      ctrlEnterRef.current =
        !explainSubmitting && !explainLoading && explainQs ? () => void submitExplain() : null;
    } else if (phase === "explainDone") {
      ctrlEnterRef.current = nextQuestion;
    } else {
      ctrlEnterRef.current = null;
    }
  });

  // ── keyboard shortcuts (never intercept typing) ──────────────────────────
  // · Ctrl/Cmd+Enter → context primary action (in Monaco the editor's own
  //   command runs first and the handler below yields — no double fire)
  // · 1–5 → select the matching MCQ option (only when focus is OUTSIDE any
  //   text entry surface, so typing a "2" in the editor is never hijacked)
  // · Escape → close the mobile question drawer (Radix also closes natively)
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const inEditable =
        !!t &&
        (t.isContentEditable ||
          !!t.closest("input, textarea, [contenteditable='true'], .monaco-editor, .no-exam-shortcuts"));
      if (e.key === "Escape") {
        if (paletteOpenRef.current) setPaletteOpen(false);
        return;
      }
      if (inEditable) return;
      // 1–5 → MCQ option select (question phase only, nothing submitted yet)
      if (phase === "question" && question && question.category === "mcq" && !submitResult && !submitting) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= (question.options?.length ?? 0)) {
          e.preventDefault();
          setMcqChoice(n - 1);
          setMcqNudge(false);
          return;
        }
      }
      // Ctrl/Cmd+Enter → primary editor action (never a submission on code questions)
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (ctrlEnterRef.current) {
          e.preventDefault();
          ctrlEnterRef.current();
        } else if (phase === "question" && question?.category === "mcq" && mcqChoiceRef.current == null) {
          // tried to save without a selection — inline validation, never a silent no-op
          e.preventDefault();
          setMcqNudge(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, question, submitResult, submitting]);

  // ── intro / prep screen (fresh assessments only) ────────────────────────
  if (phase === "intro") {
    if (!introPlan) {
      return (
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-700 dark:text-emerald-400" />
          <p className="mt-4 text-sm text-muted-foreground">Preparing your verification plan…</p>
        </div>
      );
    }
    const estMinutes = (() => {
      if (!introPlan) return 0;
      if (!policy) return Math.max(8, introPlan.total * 4);
      const ov = (skill: string) => policy.skillOverrides?.[skill] ?? null;
      const coding = introPlan.skills.reduce((a, s) => a + s.coding * (ov(s.skill) ?? policy.dsaMediumMin), 0);
      const debugging = introPlan.skills.reduce((a, s) => a + s.debugging * (ov(s.skill) ?? policy.debuggingMin), 0);
      const mcq = introPlan.skills.reduce(
        (a, s) => a + (s.mcq * (ov(s.skill) !== null ? (ov(s.skill) as number) * 60 : policy.mcqSec)) / 60,
        0
      );
      const explainOverhead = introPlan.skills.reduce((a, s) => a + s.coding * 2, 0); // explain-the-code phase
      return Math.max(5, Math.round(coding + debugging + mcq + explainOverhead));
    })();
    // skills the recruiter per-skill-overrode — surfaced as distinct chips on the prep screen
    const overrideChips = policy
      ? Array.from(
          new Set(
            (introPlan?.skills ?? [])
              .filter((s) => (policy.skillOverrides?.[s.skill] ?? 0) > 0)
              .map((s) => s.skill)
          )
        )
      : [];
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <StepHeader
            step={2}
            kicker="Dossier · Step 3 of 4"
            title={
              <>
                Ready to <em className="text-[#5c7250] dark:text-[#a9c29b]">prove</em> it, {store.candidateName || "candidate"}?
              </>
            }
            note="Adaptive · timed · disclosed tracking"
          />

          <Card className="rounded-md border-zinc-300 dark:border-zinc-700 bg-card shadow-none">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-card">
                  <ShieldAlert className="h-5 w-5 text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Before you begin</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Your assessment is personalized to the skills on your resume. Difficulty adapts as you solve.
                  </p>
                </div>
              </div>

              {/* plan preview */}
              <div className="space-y-2">
                <p className="flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span aria-hidden className="inline-block h-2 w-2 bg-[#5c7250]" /> Your verification plan
                </p>
                {introPlan.skills.map((s, i) => (
                  <motion.div
                    key={`${s.skill}-${i}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.07, duration: 0.35 }}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3.5 py-2.5"
                  >
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{s.skill}</span>
                    <span className="rounded-[3px] border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-emerald-800 dark:text-emerald-400">
                      claimed {s.claimedLevel}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {s.coding > 0 && (
                        <span className="flex items-center gap-1">
                          <FileCode2 className="h-3 w-3 text-emerald-700 dark:text-emerald-400" /> {s.coding} coding
                        </span>
                      )}
                      {s.debugging > 0 && (
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-amber-700 dark:text-amber-400" /> {s.debugging} debugging
                        </span>
                      )}
                      {s.mcq > 0 && (
                        <span className="flex items-center gap-1">
                          <CircleDot className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> {s.mcq} conceptual
                        </span>
                      )}
                    </span>
                  </motion.div>
                ))}
                <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" /> {introPlan.total} question{introPlan.total === 1 ? "" : "s"} · ~{estMinutes} min
                  </span>
                  <span>Adaptive difficulty — solve fast to level up</span>
                </div>
                {policy && (
                  <p className="flex flex-wrap gap-2 pt-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-400">
                    <span className="border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5">Debugging {policy.debuggingMin} min</span>
                    <span className="border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5">DSA easy {policy.dsaEasyMin} min</span>
                    <span className="border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5">Medium {policy.dsaMediumMin} min</span>
                    <span className="border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5">Hard {policy.dsaHardMin} min</span>
                    <span className="border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5">MCQ {policy.mcqSec} sec</span>
                    {overrideChips.map((skill) => (
                      <span
                        key={skill}
                        className="border border-[#5c7250]/50 bg-[#5c7250]/5 dark:bg-[#5c7250]/15 px-1.5 py-0.5 text-[#5c7250] dark:text-[#a9c29b]"
                        title={`Recruiter override — every ${skill} question gets ${policy.skillOverrides[skill]} min`}
                      >
                        {skill} · {policy.skillOverrides[skill]} min override
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {/* rules */}
              <div className="space-y-2.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-4">
                <p className="flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span aria-hidden className="inline-block h-2 w-2 bg-[#5c7250]" /> How this works
                </p>
                <ul className="space-y-2 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    Code runs in a sandboxed environment with visible + hidden test cases. Each question has a time limit — auto-submit applies at zero.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    After each coding solution, explain your own code — the code–explanation consistency feeds your evidence profile.
                  </li>
                  <li className="flex gap-2">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    Hints are available on coding questions but are disclosed: each reveal is logged as evidence and adjusts that question by −4% (max −12%).
                  </li>
                  <li className="flex gap-2">
                    <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    Disclosed tracking: edits, pastes, test runs and focus changes are recorded as verification evidence — never keystroke content. Recruiters may monitor live.
                  </li>
                  <li className="flex gap-2">
                    <SkipForward className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                    Stuck? Skip a question and keep moving — the palette marks it open so you can return before finishing.
                  </li>
                  <li className="flex gap-2">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700 dark:text-rose-400" />
                    Conceptual questions allow one attempt — once locked, the answer is final.
                  </li>
                  <li className="flex gap-2">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700 dark:text-rose-400" />
                    Test-window policy: the first tab switch records a warning; a second switch auto-submits the test with your current answers.
                  </li>
                </ul>
              </div>

              <Button
                onClick={() => void dealQuestion()}
                className="sp-press w-full py-3 text-base font-semibold"
              >
                Start assessment <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // ── finishing screen ─────────────────────────────────────────────────────
  if (phase === "finishing") {
    const steps = ["Aggregating evidence", "Verifying skill consistency", "Computing confidence", "Building verified profile"];
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-700 dark:text-emerald-400" />
        <h2 className="mt-6 font-display text-2xl tracking-tight">Generating your verified profile…</h2>
        <div className="mt-8 w-full space-y-3 text-left">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300 sp-slide-in" style={{ animationDelay: `${i * 0.45}s` }}>
              <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" /> {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const total = summary.total;

  // advancing = any mutation in flight — the footer bar disables + spins on it
  const advancing =
    submitting || skipping || explainSubmitting || explainLoading || paletteBusyId !== null || (phase === "loading" && startedRef.current);
  const onPrimary = primaryAction?.run ?? null;

  return (
    <div className="flex flex-1 flex-col">
      {/* exam header — replaces the app masthead while the runner is live */}
      {examLive && (
        <ExamHeader
          candidateName={store.candidateName}
          questionOrder={question?.order ?? null}
          total={summary.total}
          answered={summary.answered}
          skipped={summary.skipped}
          remaining={summary.remaining}
          strikes={strikes}
          saving={submitting || skipping || paletteBusyId !== null}
          savedAt={savedAt}
          timeLeft={phase === "question" && question ? timeLeft : null}
          limitSec={question?.timeLimitSec ?? null}
          saveFailed={saveError}
          onFinishClick={() => setFinishOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          paletteDealt={palette.length}
        />
      )}

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* sidebar — on desktop a persistent question-navigation panel sits on
            the LEFT; on mobile the palette lives in a bottom drawer (the test
            owns the viewport). Deliberately NOT sticky: the stacked cards are
            taller than most viewports, so a sticky pin would jitter; the exam
            header keeps the progress tally permanently visible instead. */}
        <aside className="order-2 space-y-4 lg:order-1">
          {palette.length > 0 && (
            <div className="hidden lg:block">
              <QuestionPalette
                rows={palette}
                summary={summary}
                busyId={paletteBusyId ?? (skipping ? (question?.aqId ?? null) : null)}
                currentAqId={phase === "question" ? (question?.aqId ?? null) : null}
                navigable={phase === "question"}
                onRevisit={(id) => void revisitQuestion(id)}
              />
            </div>
          )}
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> Session evidence
                <span className="ml-auto flex items-center gap-1 text-[10px] normal-case text-emerald-700 dark:text-emerald-400">
                  <span className="sp-live-dot h-1.5 w-1.5 rounded-full bg-emerald-600" /> live
                </span>
              </p>
              <p className="mt-2 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-[11px] leading-relaxed text-emerald-900 dark:text-emerald-300">
                Disclosed tracking: edits, pastes, test runs and focus changes are recorded as assessment evidence — never keystroke content. Leaving the test window twice auto-submits.
              </p>
              <Separator className="my-3" />
              <ScrollArea className="h-64 pr-2">
                <div className="space-y-1.5">
                  {feed.length === 0 && <p className="text-xs text-muted-foreground">Waiting for activity…</p>}
                  {feed.slice().reverse().map((f) => (
                    <div key={f.id} className="sp-slide-in flex items-start gap-1.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
                      <CircleDot className="mt-0.5 h-2.5 w-2.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className={cn(f.kind === "paste" && "text-amber-700 dark:text-amber-400", f.kind === "tab_blur" && "text-rose-700 dark:text-rose-400", f.kind === "question_skipped" && "text-amber-700 dark:text-amber-400")}>{f.text}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">How scoring works</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                <li>· Correctness 35% · Problem solving 20%</li>
                <li>· Efficiency 15% · Debugging 10%</li>
                <li>· Code quality 10% · Explanation 5%</li>
                <li>· Time management 5%</li>
              </ul>
            </CardContent>
          </Card>
        </aside>

        {/* main panel */}
        <main className="order-1 min-w-0 space-y-4 lg:order-2">
          {phase === "loading" && (
            <Card className="border-border bg-card">
              <CardContent className="flex items-center justify-center gap-3 p-16 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-700 dark:text-emerald-400" /> Preparing your personalized question…
              </CardContent>
            </Card>
          )}

          {question && (phase === "question" || phase === "result" || phase === "explain" || phase === "explainDone") && (
            <QuestionPanel
              question={question}
              total={total}
              phase={phase}
              code={code}
              setCode={(v) => {
                setCode(v);
              }}
              onEditDelta={(added, removed) => {
                const tr = getTracker();
                tr.codeChange(added, removed);
                if (added + removed > 0) pushFeed({ type: "code_change", t: tr.t(), added, removed });
              }}
              onPaste={(chars) => {
                const tr = getTracker();
                tr.paste(chars);
                pushFeed({ type: "paste", t: tr.t(), pastedChars: chars });
                // severity ladder from the recruiter's proctor policy (spec
                // defaults when the policy hasn't loaded yet)
                const riskChars = policy?.pasteRiskChars ?? 200;
                const warnChars = policy?.pasteWarnChars ?? 80;
                pEvent(
                  "paste",
                  `Pasted ~${chars} characters`,
                  chars > riskChars ? "risk" : chars > warnChars ? "warn" : "info"
                );
              }}
              runResults={runResults}
              runError={runError}
              running={running}
              submitting={submitting}
              submitResult={submitResult}
              mcqChoice={mcqChoice}
              setMcqChoice={(i) => {
                setMcqChoice(i);
                setMcqNudge(false);
              }}
              onRun={() => void runCode()}
              onSubmitCode={() => void submitCode()}
              onSubmitMcq={() => void submitMcq(mcqChoice ?? -1)}
              onGoExplain={() => void goExplain()}
              language={language}
              onSwitchLanguage={switchLanguage}
              explainQs={explainQs}
              explainLoading={explainLoading}
              explainAnswers={explainAnswers}
              setExplainAnswers={setExplainAnswers}
              explainSubmitting={explainSubmitting}
              explainEvals={explainEvals}
              onSubmitExplain={() => void submitExplain()}
              onNext={nextQuestion}
              submissionId={submissionId}
              hintState={hintState}
              hintLoading={hintLoading}
              onRevealHint={() => void revealHint()}
              onSkip={() => void skipQuestion()}
              skipping={skipping}
              mcqNudge={mcqNudge}
              recoveredDraft={recoveredDraft}
            />
          )}
        </main>
      </div>
      </div>

      {/* bottom navigation bar — always-visible continuation controls. Sticky
          to the viewport bottom while scrolling (the exam root is a flex
          column, so on short pages it pins to the bottom edge), never covering
          the editor permanently: it sits BELOW the content at scroll end. */}
      {examLive && (
        <ExamFooterNav
          phase={phase}
          question={question}
          total={total}
          primaryAction={primaryAction}
          pending={advancing}
          previousTarget={previousTarget}
          navigable={phase === "question"}
          onPrevious={() => previousTarget && void revisitQuestion(previousTarget.aqId)}
          onSkip={() => void skipQuestion()}
          onPrimary={() => onPrimary?.()}
        />
      )}

      {/* mobile question-navigation drawer (bottom sheet) */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-lg border-zinc-300 bg-card px-4 pb-6 pt-4 dark:border-zinc-700">
          <SheetHeader className="p-0 pb-1">
            <SheetTitle className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <LayoutGrid className="h-3.5 w-3.5" /> Question navigation
            </SheetTitle>
          </SheetHeader>
          {palette.length > 0 ? (
            <QuestionPalette
              rows={palette}
              summary={summary}
              busyId={paletteBusyId ?? (skipping ? (question?.aqId ?? null) : null)}
              currentAqId={phase === "question" ? (question?.aqId ?? null) : null}
              navigable={phase === "question"}
              onRevisit={(id) => {
                setPaletteOpen(false);
                void revisitQuestion(id);
              }}
              inDrawer
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Questions appear here as they are dealt.</p>
          )}
        </SheetContent>
      </Sheet>

      {/* finish confirmation — real counts, explicit informed consent.
          Radix AlertDialog owns focus + Escape; Confirm calls the existing
          completion endpoint, which remains the single completion path. */}
      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent className="border-zinc-300 dark:border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl tracking-tight text-zinc-900 dark:text-zinc-100">
              Finish assessment?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Unfinished questions may be recorded as unanswered according to the assessment rules. Answered
              questions are locked and cannot be revisited after finishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Answered</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{summary.answered}</dd>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Skipped</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-[#5c7250] dark:text-[#a9c29b]">{summary.skipped}</dd>
            </div>
            <div className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-3">
              <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Remaining</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{summary.remaining}</dd>
            </div>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue assessment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setFinishOpen(false);
                void finishAssessment();
              }}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-700"
            >
              <Flag className="mr-1.5 h-4 w-4" /> Confirm finish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* tab-switch warning — blocking until acknowledged */}
      {focusWarning && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-modal="true"
          aria-label="Test window violation warning"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-md rounded-md border-2 border-rose-600 bg-card p-6"
          >
            <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-400">
              <TriangleAlert className="h-3.5 w-3.5" /> Test window violation · warning 1 of 2
            </p>
            <h3 className="mt-2 font-display text-xl tracking-tight text-zinc-900 dark:text-zinc-100">Stay on the assessment window</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              You left the test window — this switch was recorded as evidence.
              <span className="font-semibold text-rose-700 dark:text-rose-400"> A second switch will auto-submit the test</span> with your current answers.
            </p>
            <p className="mt-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 font-mono text-[10.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Recruiters monitoring this session live have been notified.
            </p>
            <Button onClick={ackFocusWarning} className="sp-press mt-4 w-full py-2.5 font-semibold">
              Return to the test
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  // fixed-width MM:SS — tabular numerals keep the countdown from shifting
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Exam header ────────────────────────────────────────────────────────────

/** Professional test-conducting header — while the runner is live it REPLACES
 *  the app masthead (the shell hides its own chrome when examActive) and sits
 *  sticky at the very top, like real assessment software. Light, high
 *  contrast, and dense with the facts that matter mid-test: who is taking it,
 *  where they are, how long is left for THIS question, and whether progress
 *  is safely stored. */
function ExamHeader(props: {
  candidateName: string;
  questionOrder: number | null;
  total: number;
  answered: number;
  skipped: number;
  remaining: number;
  strikes: number;
  /** any mutation in flight (submit / skip / palette revisit) */
  saving: boolean;
  /** server-confirmed persistence stamp for the "Saved Ns ago" chip */
  savedAt: number | null;
  timeLeft: number | null;
  limitSec: number | null;
  /** the last mutation failed to reach the server — honest error chip */
  saveFailed: boolean;
  /** opens the informed finish-confirmation dialog */
  onFinishClick: () => void;
  /** mobile: opens the bottom-drawer question navigation */
  onOpenPalette: () => void;
  /** dealt questions so far (drawer trigger count) */
  paletteDealt: number;
}) {
  const t = props.timeLeft;
  // keep the "Saved Ns ago" chip honest when nothing is mid-flight
  const [, tick] = useState(0);
  useEffect(() => {
    if (props.savedAt == null) return;
    const iv = setInterval(() => tick((c) => c + 1), 5000);
    return () => clearInterval(iv);
  }, [props.savedAt]);
  const savedAgo =
    props.savedAt == null ? null : Math.max(0, Math.round((Date.now() - props.savedAt) / 1000));
  const savedLabel =
    savedAgo == null
      ? null
      : savedAgo < 4
        ? "Saved just now"
        : savedAgo < 90
          ? `Saved ${savedAgo}s ago`
          : `Saved ${Math.floor(savedAgo / 60)}m ago`;

  // Urgency ladder for the per-question countdown. The deadline itself is
  // server-authoritative (dealtAt + timeLimitSec; the browser clock is only a
  // display) — these thresholds only decide how loudly the display warns:
  //   warn   ≈ 20% of the limit left (never later than the final 60s; short
  //          limits warn at a third of their time so a 90s MCQ isn't amber
  //          from the first second)
  //   danger the final 30 seconds
  //   final  the last 10 seconds — solid block, no animation
  const limit = props.limitSec ?? 0;
  const warnAt =
    limit > 0 && limit <= 120 ? Math.round(limit / 3) : Math.max(60, Math.round(limit * 0.2));
  const urgency =
    t == null || limit <= 0
      ? "calm"
      : t <= 10
        ? "final"
        : t <= 30
          ? "danger"
          : t <= warnAt
            ? "warn"
            : "calm";

  // aria-live announcements — timer thresholds and save failures are spoken
  // once (state changes only on threshold crossings, so screen readers are not
  // spammed every second)
  const [announce, setAnnounce] = useState("");
  const prevUrgencyRef = useRef("calm");
  useEffect(() => {
    if (urgency !== prevUrgencyRef.current) {
      if (urgency === "danger") setAnnounce("30 seconds remaining for this question");
      else if (urgency === "final") setAnnounce("10 seconds remaining — this question auto-submits at zero");
      prevUrgencyRef.current = urgency;
    }
  }, [urgency]);
  useEffect(() => {
    if (props.saveFailed) setAnnounce("Save failed — your last action did not reach the server. Retry.");
  }, [props.saveFailed]);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 print:hidden">
      {/* screen-reader announcements (visually hidden) */}
      <span className="sr-only" role="status" aria-live="assertive">
        {announce}
      </span>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {/* identity — mark + assessment title + candidate */}
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-950 dark:bg-zinc-100"
        >
          <ShieldCheck className="h-4 w-4 text-[#faf7f0] dark:text-[#211d16]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[13.5px] font-semibold tracking-tight">
            Technical Assessment
          </p>
          <p className="hidden truncate font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400 sm:block">
            {props.candidateName || "Candidate"}
          </p>
        </div>

        {/* question position — the exam's "you are here" */}
        <div className="ml-4 hidden items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 md:flex">
          <span>Question</span>
          <span className="font-display text-lg font-semibold normal-case tracking-tight text-zinc-900 tabular-nums dark:text-zinc-100">
            {props.questionOrder ?? "–"}
          </span>
          <span>of {props.total}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
          {/* keyboard shortcuts — help popover (all sizes) */}
          <ShortcutHelpPopover />

          {/* mobile question-navigation trigger — the palette drawer */}
          <Button
            variant="outline"
            size="sm"
            onClick={props.onOpenPalette}
            aria-label={`Open question navigation — ${props.paletteDealt} of ${props.total} dealt`}
            title="Question navigation"
            className="h-8 border-zinc-300 bg-white px-2 text-xs font-medium text-zinc-800 hover:bg-zinc-950 hover:text-zinc-50 lg:hidden dark:border-zinc-700 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="ml-1 font-mono tabular-nums">
              {props.paletteDealt}/{props.total}
            </span>
          </Button>

          {/* focus strikes — disclosed proctoring state */}
          <span
            className="hidden items-center gap-1.5 md:flex"
            title="Tab switches are recorded — two auto-submit the test"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
              focus
            </span>
            {[0, 1].map((i) => (
              <span
                key={i}
                aria-label={`Tab-switch strike ${i + 1}${i < props.strikes ? " used" : " unused"}`}
                className={cn(
                  "h-2.5 w-2.5 border",
                  i < props.strikes ? "border-rose-600 bg-rose-600" : "border-zinc-300 dark:border-zinc-600"
                )}
              />
            ))}
          </span>

          {/* save status — honest: Saving… while in flight, an explicit error
              chip when the last mutation failed, "Saved Ns ago" on success */}
          {props.saving ? (
            <span
              className="hidden items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-amber-700 sm:flex dark:text-amber-400"
              role="status"
            >
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          ) : props.saveFailed ? (
            <span
              className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-rose-700 sm:flex dark:text-rose-400"
              role="status"
              title="Your last submit or skip did not reach the server — retry the action"
            >
              <TriangleAlert className="h-3 w-3" /> Save failed
            </span>
          ) : (
            savedLabel && (
              <span
                className="hidden items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-emerald-700 lg:flex dark:text-emerald-400"
                title="Every answer is stored the moment it lands — progress survives a refresh"
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={1.5} /> {savedLabel}
              </span>
            )
          )}

          {/* countdown — per-question limit (server-authoritative deadline) */}
          {t != null && (
            <span
              role="timer"
              aria-label={`Time remaining for this question: ${formatTime(t)}`}
              title="Per-question time limit — auto-submit at zero"
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1",
                urgency === "calm" &&
                  "border-zinc-300 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
                urgency === "warn" &&
                  "border-amber-500/50 bg-amber-100 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
                urgency === "danger" &&
                  "border-rose-500/50 bg-rose-100 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300",
                urgency === "final" &&
                  "border-rose-600 bg-rose-600 text-white dark:border-rose-600 dark:bg-rose-600"
              )}
            >
              <Timer className="h-3.5 w-3.5" />
              <span className="font-mono text-[15px] font-semibold leading-none tabular-nums">
                {formatTime(t)}
              </span>
              <span
                className={cn(
                  "hidden font-mono text-[8.5px] uppercase tracking-[0.14em] sm:inline",
                  urgency === "final" ? "text-white/75" : "text-zinc-400 dark:text-zinc-500"
                )}
              >
                this question
              </span>
            </span>
          )}

          {/* finish — opens the informed confirmation dialog (real counts) */}
          <Button
            variant="outline"
            size="sm"
            onClick={props.onFinishClick}
            title="Review your progress before finishing"
            className="sp-press h-8 px-2.5 text-xs font-semibold sm:px-3 border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-950 hover:text-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
          >
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Finish assessment</span>
            <span className="sm:hidden">Finish</span>
          </Button>
        </div>
      </div>

      {/* progress strip — completion caption + answered/skipped/remaining tally,
          then a hairline rail that fills with the same numbers */}
      <div className="border-t border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mx-auto flex h-6 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-600 tabular-nums dark:text-zinc-300">
            {props.total > 0 ? Math.round((props.answered / Math.max(1, props.total)) * 100) : 0}% completed
          </p>
          <p className="ml-auto hidden items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-zinc-400 tabular-nums sm:flex dark:text-zinc-500">
            <span>{props.total} total</span>
            <span aria-hidden>·</span>
            <span>{props.answered} answered</span>
            <span aria-hidden>·</span>
            <span>{props.skipped} skipped</span>
            <span aria-hidden>·</span>
            <span>{props.remaining} remaining</span>
          </p>
        </div>
      </div>
      <div aria-hidden className="h-[3px] w-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-full bg-[#5c7250] transition-[width] duration-500 dark:bg-[#a9c29b]"
          style={{
            width: `${Math.min(100, (props.answered / Math.max(1, props.total)) * 100)}%`,
          }}
        />
      </div>
    </header>
  );
}

// ─── Question palette (skip & return navigation) ────────────────────────────

const ANSWERED_STATUSES = new Set(["solved", "failed", "timeout"]);

function paletteCellTitle(status: string): string {
  switch (status) {
    case "current":
      return "On screen now";
    case "solved":
      return "Answered — locked";
    case "failed":
    case "timeout":
      return "Attempted — locked";
    case "skipped":
      return "Skipped — click to return";
    default:
      return status;
  }
}

/** The five palette states, rendered identically in the cells and the legend
 *  so the color language is learned once. */
function paletteCellClass(status: string, active: boolean): string {
  if (active) return "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"; // current — dark filled
  switch (status) {
    case "solved": // answered — green
      return "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-zinc-950";
    case "failed": // attempted (incorrect / incomplete) — amber
    case "timeout":
      return "border-amber-500 bg-amber-400 text-amber-950 dark:border-amber-400 dark:bg-amber-400/90 dark:text-zinc-950";
    case "skipped": // skipped — outlined dashed (revisit-able)
      return "border-dashed border-[#5c7250]/60 bg-[#5c7250]/5 dark:bg-[#5c7250]/15 text-[#5c7250] dark:text-[#a9c29b]";
    default: // not visited — neutral gray
      return "border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500";
  }
}

function PaletteLegend() {
  const items: { label: string; cls: string; dashed?: boolean }[] = [
    { label: "Current", cls: "border-zinc-950 bg-zinc-950 dark:border-zinc-100 dark:bg-zinc-100" },
    { label: "Answered", cls: "border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500" },
    { label: "Attempted", cls: "border-amber-500 bg-amber-400 dark:border-amber-400 dark:bg-amber-400/90" },
    { label: "Skipped", cls: "border-dashed border-[#5c7250]/60 bg-[#5c7250]/10 dark:bg-[#5c7250]/20" },
    { label: "Not visited", cls: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-1">
      {items.map((it) => (
        <p key={it.label} className="flex items-center gap-1.5 text-[10.5px] leading-snug text-zinc-500 dark:text-zinc-400">
          <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 border", it.cls)} />
          {it.label}
        </p>
      ))}
    </div>
  );
}

function QuestionPalette(props: {
  rows: PaletteRow[];
  /** shared progress summary — same object the exam header renders, so the
   *  two can never disagree */
  summary: { total: number; answered: number; skipped: number; remaining: number };
  busyId: string | null;
  currentAqId: string | null;
  /** navigation opens on the question screen; result/explain phases lock it */
  navigable: boolean;
  onRevisit: (aqId: string) => void;
  /** bottom-drawer variant: card chrome is provided by the sheet itself */
  inDrawer?: boolean;
}) {
  // future questions the adaptive engine has not dealt yet — shown as inert
  // "not visited" placeholders so the grid always reflects the full plan
  const placeholders = Math.max(0, props.summary.total - props.rows.length);
  const body = (
    <>
      <div
        role="group"
        aria-label="Question navigation"
        className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-6 lg:grid-cols-5"
      >
        {props.rows.map((row) => {
          const active = row.aqId === props.currentAqId;
          const clickable = props.navigable && row.status === "skipped" && !active && !props.busyId;
          return (
            <button
              key={row.aqId}
              type="button"
              disabled={!clickable}
              onClick={() => props.onRevisit(row.aqId)}
              title={props.navigable ? paletteCellTitle(row.status) : "Return from the question screen"}
              aria-label={`Question ${row.order}: ${paletteCellTitle(row.status)}`}
              className={cn(
                "flex h-8 items-center justify-center border font-mono text-[11px] tabular-nums transition-colors",
                paletteCellClass(row.status, active),
                clickable && "cursor-pointer hover:border-[#5c7250] hover:bg-[#5c7250]/15 hover:text-[#5c7250] dark:hover:text-[#a9c29b]",
                !clickable && "cursor-default"
              )}
            >
              {props.busyId === row.aqId ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-label="Opening…" />
              ) : (
                row.order
              )}
            </button>
          );
        })}
        {Array.from({ length: placeholders }, (_, i) => {
          const order = props.rows.length + i + 1;
          return (
            <span
              key={`ph-${order}`}
              aria-label={`Question ${order}: not visited yet`}
              title="Not visited yet — questions are dealt adaptively"
              className={cn(
                "flex h-8 items-center justify-center border font-mono text-[11px] tabular-nums",
                paletteCellClass("pending", false)
              )}
            >
              {order}
            </span>
          );
        })}
      </div>
      {/* legend — same visual language as the cells */}
      <div className="mt-3 border-t border-zinc-200 pt-2.5 dark:border-zinc-700">
        <p className="mb-1.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
          Legend
        </p>
        <PaletteLegend />
      </div>
      {/* progress summary — same numbers the exam header shows */}
      <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-zinc-200 pt-3 text-center dark:border-zinc-700">
        <div>
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Total</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{props.summary.total}</dd>
        </div>
        <div>
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Answered</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{props.summary.answered}</dd>
        </div>
        <div>
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Skipped</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-[#5c7250] dark:text-[#a9c29b]">{props.summary.skipped}</dd>
        </div>
        <div>
          <dt className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">Remaining</dt>
          <dd className="mt-0.5 text-base font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">{props.summary.remaining}</dd>
        </div>
      </dl>
    </>
  );

  if (props.inDrawer) return body;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> Question navigation
        </p>
        {body}
      </CardContent>
    </Card>
  );
}

// ─── Bottom navigation bar ──────────────────────────────────────────────────

/** Persistent continuation bar: [← Previous] Question N of M · [Skip] [primary →].
 *  "Previous" is enabled ONLY when the engine can legally return — i.e. a
 *  skipped (parked) question exists behind the current one; locked
 *  (solved/failed/timeout) questions can never be reopened. The primary
 *  button is context-aware (Save & next / Submit fix / Submit answer / Next /
 *  Explain) and always persists before advancing. */
function ExamFooterNav(props: {
  phase: Phase;
  question: ClientQuestion | null;
  total: number;
  primaryAction: { label: string; shortLabel: string; icon: React.ReactNode; disabled: boolean } | null;
  pending: boolean;
  previousTarget: PaletteRow | null;
  navigable: boolean;
  onPrevious: () => void;
  onSkip: () => void;
  onPrimary: () => void;
}) {
  const primary = props.primaryAction;
  const showSkip = props.navigable && props.phase === "question" && !!props.question;
  const prevReady = props.navigable && !!props.previousTarget && !props.pending;

  return (
    <footer
      className="sticky bottom-0 z-30 mt-auto border-t border-zinc-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm print:hidden dark:border-zinc-700 dark:bg-zinc-950/95"
      role="navigation"
      aria-label="Question navigation bar"
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        {/* previous — engine-permitted returns only */}
        {props.previousTarget ? (
          <Button
            variant="outline"
            size="sm"
            onClick={props.onPrevious}
            disabled={!prevReady}
            title={
              prevReady
                ? `Return to Q${props.previousTarget.order} — ${props.previousTarget.skill} (parks this question)`
                : "Finish this question's flow first"
            }
            aria-label={`Return to question ${props.previousTarget.order}`}
            className="h-9 shrink-0 border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-950 hover:text-zinc-50 sm:px-3 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
          >
            {props.pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowLeft className="h-3.5 w-3.5" />
            )}
            <span className="ml-1.5 hidden sm:inline">Previous</span>
          </Button>
        ) : (
          <span
            title="No parked questions behind — answered questions are locked"
            className="hidden sm:inline-block"
          >
            <Button variant="outline" size="sm" disabled className="h-9 shrink-0 cursor-not-allowed border-zinc-200 bg-transparent px-2.5 text-xs text-zinc-300 sm:px-3 dark:border-zinc-800 dark:text-zinc-600">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">Previous</span>
            </Button>
          </span>
        )}

        {/* position counter */}
        <p
          className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500 tabular-nums dark:text-zinc-400"
          aria-label={`Question ${props.question?.order ?? "–"} of ${props.total}`}
        >
          Question{" "}
          <span className="font-display text-sm font-semibold normal-case tracking-tight text-zinc-900 dark:text-zinc-100">
            {props.question?.order ?? "–"}
          </span>{" "}
          of {props.total}
        </p>

        <div className="ml-auto flex items-center gap-2">
          {showSkip && (
            <Button
              variant="outline"
              size="sm"
              onClick={props.onSkip}
              disabled={props.pending || (primary != null && !primary.disabled && primary.label.startsWith("Save"))}
              title="Park this question — return anytime from the question palette"
              className="h-9 border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-950 hover:text-zinc-50 sm:px-3 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
            >
              {props.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SkipForward className="h-3.5 w-3.5" />}
              <span className="ml-1.5 sm:inline">Skip</span>
            </Button>
          )}
          {primary && (
            <Button
              size="sm"
              onClick={props.onPrimary}
              disabled={primary.disabled || props.pending}
              title={primary.disabled && props.phase === "question" && props.question?.category !== "mcq" ? "Write some code first" : undefined}
              aria-label={primary.label}
              className="sp-press h-9 px-3 text-xs font-semibold sm:px-4"
            >
              {props.pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-label="Working…" />
              ) : (
                primary.icon
              )}
              <span className="hidden sm:inline">{primary.label}</span>
              <span className="sm:hidden">{primary.shortLabel}</span>
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}

// ─── Keyboard shortcuts help ────────────────────────────────────────────────

/** Small header popover listing the exam shortcuts (discovered affordance —
 *  the editor footer already surfaces the two Monaco ones). */
function ShortcutHelpPopover() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 transition-colors hover:bg-zinc-950 hover:text-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
      >
        <Keyboard className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-border bg-popover p-3.5">
        <p className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Keyboard shortcuts
        </p>
        <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
          <li className="flex items-center justify-between gap-3">
            <span>Run code / primary action</span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="sp-kbd">Ctrl</kbd>
              <span className="text-zinc-400">+</span>
              <kbd className="sp-kbd">↵</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Submit solution (in editor)</span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="sp-kbd">Ctrl</kbd>
              <span className="text-zinc-400">+</span>
              <kbd className="sp-kbd">⇧</kbd>
              <span className="text-zinc-400">+</span>
              <kbd className="sp-kbd">↵</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Select answer option</span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="sp-kbd">1</kbd>
              <span className="text-zinc-400">–</span>
              <kbd className="sp-kbd">5</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Move between options</span>
            <span className="flex shrink-0 items-center gap-1">
              <kbd className="sp-kbd">↑</kbd>
              <kbd className="sp-kbd">↓</kbd>
            </span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Close the question panel</span>
            <kbd className="sp-kbd">Esc</kbd>
          </li>
        </ul>
        <p className="mt-2.5 border-t border-border pt-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
          Shortcuts pause while you are typing in the editor or an answer field.
        </p>
      </PopoverContent>
    </Popover>
  );
}

const FLOW_STEPS = ["Resume", "Skill profile", "Assessment", "Verified profile"];

/** Square folio marks — active square ink-filled, completed get a sage check,
 *  future squares hairline-only; connecting rules fill ink as steps complete. */
function Folio({ current }: { current: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
      {FLOW_STEPS.map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center border font-mono text-[10px] tabular-nums",
                done && "border-zinc-300 dark:border-zinc-700 bg-card",
                active && "border-zinc-950 bg-zinc-950 text-[#faf7f0] dark:bg-zinc-100 dark:text-zinc-950",
                !done && !active && "border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-400 dark:text-zinc-400"
              )}
            >
              {done ? <CheckCircle2 className="h-3 w-3 text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={2.5} /> : i + 1}
            </span>
            {i < FLOW_STEPS.length - 1 && (
              <span className={cn("h-px w-3.5 sm:w-5", i < current ? "bg-zinc-950 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Editorial step header: mono kicker + folio, Fraunces headline with an italic
 *  sage emphasis word, then a hairline rule running to a mono annotation. */
function StepHeader({
  step,
  kicker,
  title,
  note,
}: {
  step: number;
  kicker: string;
  title: React.ReactNode;
  note: string;
}) {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between gap-4">
        <p className="flex min-w-0 items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-[#5c7250]" />
          <span className="truncate">{kicker}</span>
        </p>
        <Folio current={step} />
      </div>
      <h1 className="mt-2.5 font-display text-3xl tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h1>
      <div className="mt-4 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{note}</span>
      </div>
    </header>
  );
}

// ─── Question panel ─────────────────────────────────────────────────────────

function QuestionPanel(props: {
  question: ClientQuestion;
  total: number;
  phase: Phase;
  code: string;
  setCode: (v: string) => void;
  onEditDelta: (a: number, r: number) => void;
  onPaste: (chars: number) => void;
  runResults: ClientTestResult[] | null;
  runError: string | null;
  running: boolean;
  submitting: boolean;
  submitResult: SubmitResponse | null;
  mcqChoice: number | null;
  setMcqChoice: (i: number | null) => void;
  onRun: () => void;
  onSubmitCode: () => void;
  onSubmitMcq: () => void;
  onGoExplain: () => void;
  language: CodeLanguage;
  onSwitchLanguage: (lang: string) => void;
  explainQs: ExplainQuestion[] | null;
  explainLoading: boolean;
  explainAnswers: string[];
  setExplainAnswers: (a: string[]) => void;
  explainSubmitting: boolean;
  explainEvals: ExplainEvaluation[] | null;
  onSubmitExplain: () => void;
  onNext: () => void;
  submissionId: string | null;
  hintState: { text: string; penaltyPct: number; count: number } | null;
  hintLoading: boolean;
  onRevealHint: () => void;
  onSkip: () => void;
  skipping: boolean;
  /** inline validation nudge — candidate tried to save an MCQ without a selection */
  mcqNudge: boolean;
  /** a locally-stored draft was restored for this question (display chip) */
  recoveredDraft: boolean;
}) {
  const q = props.question;
  const isCode = q.category === "coding" || q.category === "debugging";
  const categoryLabel = q.category === "mcq" ? "Conceptual" : q.category === "debugging" ? "Debugging" : "Coding";
  const limitLabel =
    q.timeLimitSec >= 60 ? `${Math.round(q.timeLimitSec / 60)} min limit` : `${q.timeLimitSec}s limit`;

  return (
    <div className="space-y-4">
      {/* header — exam-paper hierarchy: QUESTION NN/MM → skill · topic → title
          → difficulty · type · time limit · points (only when the backend
          defines a real per-question weight — never a fabricated value) */}
      <Card className="border-border bg-card">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground tabular-nums">
                Question {String(q.order).padStart(2, "0")}
                <span className="text-zinc-400 dark:text-zinc-500"> / {String(props.total).padStart(2, "0")}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
                <span className="text-emerald-800 dark:text-emerald-400">{q.skill}</span>
                {q.topic && (
                  <>
                    <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="font-medium text-zinc-500 dark:text-zinc-400">{q.topic}</span>
                  </>
                )}
              </p>
              <h1 className="mt-1 font-display text-[1.55rem] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-100">
                {q.title}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] text-zinc-600 dark:text-zinc-300">
                <span
                  className={cn(
                    "rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]",
                    q.difficulty === "easy"
                      ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400"
                      : q.difficulty === "medium"
                        ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400"
                        : "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
                  )}
                >
                  {q.difficulty}
                </span>
                <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="font-medium">{categoryLabel}</span>
                <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Timer className="h-3 w-3" /> {limitLabel}
                </span>
                {q.points > 0 && (
                  <>
                    <span aria-hidden className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span
                      className="rounded-[3px] border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 dark:text-emerald-400"
                      title="This question's weight in the assessment scoring"
                    >
                      +{q.points} pts
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
              {isCode ? (
                <span
                  className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
                  title="Hidden tests run on submit — they count toward your score"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                  {q.visibleTestCount} visible test{q.visibleTestCount === 1 ? "" : "s"}
                </span>
              ) : (
                <span
                  className="flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
                  title="One attempt — the answer locks when you save"
                >
                  <CircleDot className="h-3.5 w-3.5" /> Conceptual · 1 attempt
                </span>
              )}
              {q.category === "debugging" && (
                <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
                  fix the bug
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* result banner */}
      {props.phase === "result" && props.submitResult && <ResultBanner result={props.submitResult} />}

      {/* result-phase navigation */}
      {props.phase === "result" && props.submitResult && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3">
          <p className="text-xs text-zinc-700 dark:text-zinc-300">
            {props.submitResult.type === "mcq"
              ? "Your answer has been recorded as evidence."
              : "Next: explain your own solution — this powers the code–explanation consistency signal."}
          </p>
          {props.submitResult.type === "mcq" ? (
            <Button onClick={props.onNext} className="sp-press font-semibold">
              Continue to next question <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={props.onGoExplain} className="sp-press font-semibold">
              <MessageSquareCode className="mr-2 h-4 w-4" /> Explain my solution
            </Button>
          )}
        </div>
      )}

      {/* question body */}
      {(props.phase === "question" || props.phase === "result") && (
        isCode ? (
          <CodeQuestionBody {...props} />
        ) : (
          <McqQuestionBody {...props} />
        )
      )}

      {/* skip & return — the palette marks parked questions open */}
      {props.phase === "question" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-4 py-2.5">
          <p className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <SkipForward className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-400" />
            Not ready? Park it and keep moving — return anytime from the question palette.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={props.onSkip}
            disabled={props.skipping || props.submitting}
            className="h-8 border-zinc-300 dark:border-zinc-700 bg-card text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          >
            {props.skipping ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <SkipForward className="mr-1.5 h-3.5 w-3.5" />}
            Skip for now
          </Button>
        </div>
      )}

      {/* explain phase */}
      {(props.phase === "explain" || props.phase === "explainDone") && (
        <ExplainPhase {...props} />
      )}
    </div>
  );
}

// ─── Language selector (coding questions) ───────────────────────────────

function LanguagePicker(props: {
  question: ClientQuestion;
  language: CodeLanguage;
  disabled: boolean;
  onSwitchLanguage: (lang: string) => void;
}) {
  const q = props.question;
  const offered = offeredLanguages(q);
  const multi = offered.length > 1;
  const meta = codeLanguageMeta(props.language) ?? CODE_LANGUAGES[0];

  if (q.category !== "coding") {
    return (
      <span
        className="flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400"
        title="Language choice is available on coding questions"
      >
        <FileCode2 className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> JavaScript only
      </span>
    );
  }

  if (!multi) {
    // single-language coding question — static chip (JavaScript, or SQL (SQLite) for SQL questions)
    const isSql = meta.id === "sql";
    return (
      <span
        className="flex items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400"
        title={isSql ? "Runs on SQLite — write a single SELECT statement" : undefined}
      >
        {isSql ? <Database className="h-3 w-3 text-zinc-500 dark:text-zinc-400" /> : <Code2 className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />} {meta.label}
      </span>
    );
  }

  return (
    <Select value={props.language} onValueChange={props.onSwitchLanguage} disabled={props.disabled}>
      <SelectTrigger
        aria-label="Solution language"
        className="h-8 w-[148px] gap-1.5 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-xs text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 data-[placeholder]:text-zinc-500"
      >
        <Code2 className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-border bg-popover">
        {offered.map((id) => {
          const m = codeLanguageMeta(id);
          if (!m) return null;
          const available = !!q.starters?.[id] || id === "javascript";
          return (
            <SelectItem key={id} value={id} disabled={!available} className="text-xs text-zinc-700 dark:text-zinc-300">
              <span className="flex items-center gap-2">
                {m.label}
                {!available && <span className="text-[10px] text-zinc-400 dark:text-zinc-400">unavailable</span>}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

// ─── Coding body ────────────────────────────────────────────────────────────

function CodeQuestionBody(props: {
  question: ClientQuestion;
  phase: Phase;
  code: string;
  setCode: (v: string) => void;
  onEditDelta: (a: number, r: number) => void;
  onPaste: (chars: number) => void;
  runResults: ClientTestResult[] | null;
  runError: string | null;
  running: boolean;
  submitting: boolean;
  submitResult: SubmitResponse | null;
  onRun: () => void;
  onSubmitCode: () => void;
  language: CodeLanguage;
  onSwitchLanguage: (lang: string) => void;
  hintState: { text: string; penaltyPct: number; count: number } | null;
  hintLoading: boolean;
  onRevealHint: () => void;
  /** a locally-stored draft was restored for this question (display chip) */
  recoveredDraft: boolean;
}) {
  const q = props.question;
  const disabled = props.phase === "result";
  const isSql = isSqlQuestion(q);
  // per-type action labels — the required action is always explicit
  const runLabel = isSql ? "Run query" : q.category === "debugging" ? "Run tests" : "Run code";
  const submitLabel =
    q.category === "debugging" ? "Submit fix" : isSql ? "Submit answer" : "Submit solution";
  // after submit the server's scored results (incl. compile output/logs) fill the console
  const submittedResults =
    disabled && props.submitResult
      ? props.submitResult.results ?? null
      : null;
  const showConsole = disabled
    ? !!(submittedResults?.length || props.submitResult?.compileError || props.submitResult?.logs?.length)
    : !!(props.runResults || props.runError);

  return (
    <>
      {/* split workspace — problem + editor side by side on desktop (each with
          its own scroll), stacked on small screens. The console/results panel
          spans the full workspace below. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* problem panel — brief + examples + constraints + schema + hint;
            scrolls independently so the editor never fights the page */}
        <div className="min-w-0 space-y-4 lg:max-h-[calc(100vh-11.5rem)] lg:overflow-y-auto lg:pr-1">
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <p className="mb-2 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span aria-hidden className="inline-block h-2 w-2 bg-[#5c7250]" /> Problem
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900 dark:text-zinc-100">{q.description}</p>
            </CardContent>
          </Card>

          {q.schemaSql && <SchemaBrowser schemaSql={q.schemaSql} />}

          {q.hasHint && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5">
              <p className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300">
                <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  Stuck? A hint is available — revealing it is <span className="font-medium">recorded as evidence</span> and adjusts the question score by
                  <span className="font-mono font-semibold text-amber-800 dark:text-amber-400"> −4%</span> (max −12%).
                </span>
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={props.onRevealHint}
                disabled={props.hintLoading || disabled || (!!props.hintState?.text)}
                className="h-7 shrink-0 border-amber-300 dark:border-amber-700 text-[11px] text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                {props.hintLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Lightbulb className="mr-1.5 h-3 w-3" />}
                {props.hintState?.text ? "Hint revealed" : "Reveal hint"}
              </Button>
            </div>
          )}

          {props.hintState?.text && (
            <div className="sp-slide-in rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-4">
              <p className="flex items-start gap-2 text-sm leading-relaxed text-amber-900 dark:text-amber-300">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <span>
                  <span className="font-semibold text-amber-800 dark:text-amber-400">Hint:</span> {props.hintState.text}
                </span>
              </p>
              <p className="mt-2 pl-6 text-[11px] text-amber-700 dark:text-amber-400">
                Disclosed to recruiters · score adjustment −{props.hintState.penaltyPct || 4}% · logged in the session evidence feed
              </p>
            </div>
          )}
        </div>

        {/* editor panel — language selector, run/submit, Monaco, sandbox note */}
        <Card className="min-w-0 border-border bg-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-700 pb-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {q.category === "debugging" ? "Buggy implementation — fix it" : "Code editor"}
                </p>
                {props.recoveredDraft && !disabled && (
                  <span
                    className="flex items-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-400"
                    title="Your unsaved draft from this browser was restored — the server's assessment state stays authoritative"
                  >
                    <History className="h-3 w-3" /> Recovered previous work
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LanguagePicker question={q} language={props.language} disabled={disabled} onSwitchLanguage={props.onSwitchLanguage} />
                <Button size="sm" variant="outline" onClick={props.onRun} disabled={props.running || disabled} className="border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10">
                  {props.running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                  {runLabel}
                </Button>
                <Button
                  size="sm"
                  onClick={props.onSubmitCode}
                  disabled={props.submitting || disabled}
                  className="sp-press font-semibold"
                >
                  {props.submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  {submitLabel}
                </Button>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700 p-1">
              <CodeEditor
                value={props.code}
                onChange={props.setCode}
                onEditDelta={props.onEditDelta}
                onPaste={props.onPaste}
                readOnly={disabled}
                onRun={props.onRun}
                onSubmit={props.onSubmitCode}
                height="clamp(320px, calc(100vh - 400px), 600px)"
                language={props.language}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isSql ? (
                <>
                  Executed against an isolated in-memory SQLite database built from the question's schema (read-only). Write a
                  single{" "}
                  <code className="rounded bg-zinc-950 px-1 py-0.5 font-mono text-zinc-100">SELECT</code> statement — your column
                  names/order must match the expected output.
                </>
              ) : (
                <>
                  Executed in an isolated sandbox (no network/filesystem, CPU-time limited). Define{" "}
                  <code className="rounded bg-zinc-950 px-1 py-0.5 font-mono text-zinc-100">{q.fnName}</code> exactly as specified —
                  the same function name and argument order in every language.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* console / results — a separate panel spanning the workspace; hidden
          tests stay hidden (showAll=false) in every state */}
      {showConsole && (
        <TestResultsPanel
          results={disabled ? submittedResults : props.runResults}
          compileError={disabled ? props.submitResult?.compileError ?? null : props.runError}
          logs={disabled ? props.submitResult?.logs : props.submitResult?.logs}
          showAll={false}
          isSql={isSql}
          running={disabled ? false : props.running}
        />
      )}
    </>
  );
}

// ─── MCQ body ───────────────────────────────────────────────────────────────

function McqQuestionBody(props: {
  question: ClientQuestion;
  phase: Phase;
  submitResult: SubmitResponse | null;
  mcqChoice: number | null;
  setMcqChoice: (i: number | null) => void;
  onSubmitMcq: () => void;
  submitting: boolean;
  /** inline validation nudge — save attempted with no selection */
  mcqNudge: boolean;
}) {
  const q = props.question;
  const answered = props.phase === "result";
  const options = q.options ?? [];
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow-key navigation across the choices (focus roving). Only active when
  // focus is already inside the options list, so typing elsewhere is untouched.
  const onOptionsKeyDown = (e: React.KeyboardEvent) => {
    const idx = optionRefs.current.findIndex((el) => el === document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % options.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next >= 0) {
      e.preventDefault();
      optionRefs.current[next]?.focus();
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-4 p-5">
        <p className="text-[15px] leading-relaxed text-zinc-900 dark:text-zinc-100">{q.description}</p>
        {/* selectable option cards — click anywhere on a card selects it; the
            radio mark gives a shape cue (never color alone) and the selected
            card also carries an sr-only "Selected" for screen readers */}
        <div
          role="listbox"
          aria-label="Answer options"
          onKeyDown={onOptionsKeyDown}
          title={`Pick an option — press 1–${Math.min(options.length, 5)} to select, Ctrl+Enter to save`}
          className="grid gap-2"
        >
          {options.map((opt, i) => {
            const isChoice = props.mcqChoice === i;
            const isCorrect = answered && props.submitResult?.answerIndex === i;
            const isWrongChoice = answered && isChoice && !props.submitResult?.correct;
            return (
              <button
                key={i}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                role="option"
                aria-selected={isChoice}
                disabled={answered}
                onClick={() => props.setMcqChoice(i)}
                aria-label={`Option ${String.fromCharCode(65 + i)}: ${opt}${isChoice ? " — selected" : ""} — press ${i + 1} to select`}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 dark:focus-visible:outline-zinc-100",
                  isCorrect
                    ? "border-emerald-600 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300"
                    : isWrongChoice
                      ? "border-rose-600 bg-rose-50 dark:border-rose-700 dark:bg-rose-950/40 text-rose-900 dark:text-rose-300"
                      : isChoice
                        ? "border-zinc-950 bg-zinc-50 ring-1 ring-zinc-950 text-zinc-900 dark:border-zinc-100 dark:bg-zinc-800/60 dark:ring-zinc-100 dark:text-zinc-100"
                        : "border-zinc-200 bg-card text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/40"
                )}
              >
                {/* radio mark — selection state as shape, not just color */}
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    isCorrect
                      ? "border-emerald-700 dark:border-emerald-500"
                      : isWrongChoice
                        ? "border-rose-700 dark:border-rose-500"
                        : isChoice
                          ? "border-zinc-950 dark:border-zinc-100"
                          : "border-zinc-300 dark:border-zinc-600"
                  )}
                >
                  {(isChoice || isCorrect || isWrongChoice) && (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isCorrect
                          ? "bg-emerald-700 dark:bg-emerald-500"
                          : isWrongChoice
                            ? "bg-rose-700 dark:bg-rose-500"
                            : "bg-zinc-950 dark:bg-zinc-100"
                      )}
                    />
                  )}
                </span>
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center border font-mono text-[10px] font-semibold transition-colors",
                  isCorrect
                    ? "border-emerald-700 bg-emerald-700 text-emerald-50"
                    : isWrongChoice
                      ? "border-rose-700 bg-rose-700 text-rose-50"
                      : isChoice
                        ? "border-zinc-950 bg-zinc-950 text-[#faf7f0] dark:bg-zinc-100 dark:text-zinc-950"
                        : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 flex-1">{opt}</span>
                {isChoice && !answered && <span className="sr-only">Selected</span>}
                {!answered && isChoice && (
                  <kbd className="sp-kbd hidden shrink-0 sm:inline" aria-hidden>
                    {i + 1}
                  </kbd>
                )}
                {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />}
                {isWrongChoice && <XCircle className="h-4 w-4 shrink-0 text-rose-700 dark:text-rose-400" />}
              </button>
            );
          })}
        </div>
        {/* validation feedback — surfaced when the candidate tries to save
            without a selection (Save stays disabled so nothing is lost) */}
        {!answered && props.mcqNudge && props.mcqChoice == null && (
          <p
            role="alert"
            className="sp-slide-in flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-300"
          >
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Select an option before saving — click a card or press 1–{Math.min(options.length, 5)}.
          </p>
        )}
        {!answered && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              One attempt — the answer locks the moment you save.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.setMcqChoice(null)}
                disabled={props.mcqChoice == null || props.submitting}
                title="Clear the selection before saving"
                className="h-9 border-zinc-300 dark:border-zinc-700 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-950 hover:text-zinc-50 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-100 dark:hover:text-zinc-950"
              >
                <Eraser className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
              <Button
                onClick={props.onSubmitMcq}
                disabled={props.mcqChoice == null || props.submitting}
                title={props.mcqChoice == null ? "Select an option first" : undefined}
                className="sp-press h-9 font-semibold"
              >
                {props.submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Save & next
              </Button>
            </div>
          </div>
        )}
        {answered && props.submitResult?.explanation && (
          <div className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold text-emerald-800 dark:text-emerald-400">Why: </span>{props.submitResult.explanation}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Result banner ──────────────────────────────────────────────────────────

function ResultBanner({ result }: { result: SubmitResponse }) {
  const analysis = result.analysis;
  // timeout is its own outcome — never dressed up as "incorrect"
  const timedOut = result.status === "timeout";
  const good = !timedOut && !!(result.passed || result.correct);
  const headline = timedOut
    ? "Time expired"
    : result.type === "mcq"
      ? result.correct
        ? "Answer saved successfully — correct"
        : "Answer recorded — incorrect"
      : result.passed
        ? "Solution submitted — all tests passed"
        : "Solution submitted — partially correct";
  return (
    <Card
      className={cn(
        "border",
        good
          ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40"
          : timedOut
            ? "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40"
            : "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40"
      )}
      role="status"
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {good ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
          ) : timedOut ? (
            <Timer className="h-5 w-5 text-rose-700 dark:text-rose-400" />
          ) : (
            <XCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          )}
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {headline}
            {!timedOut && (
              <>
                {" · "}
                <span className="font-mono text-emerald-800 dark:text-emerald-400">{result.score}/100</span>
              </>
            )}
          </span>
          {(result.hintsUsed ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-400">
              <Lightbulb className="h-3 w-3" /> {result.hintsUsed} hint{(result.hintsUsed ?? 0) > 1 ? "s" : ""} used · −{result.hintPenaltyPct ?? 4}%
            </span>
          )}
          {analysis && (
            <span className="ml-auto flex flex-wrap gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
                <Cpu className="h-3 w-3 text-emerald-700 dark:text-emerald-400" /> {analysis.timeComplexity}
              </span>
              <span className="rounded-md border border-border bg-card px-2 py-1">quality {Math.round(analysis.quality)}</span>
            </span>
          )}
        </div>
        {timedOut && (
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            The question closed at the server deadline — your current answer was submitted and recorded.
          </p>
        )}
        {analysis?.notes?.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {analysis.notes.slice(0, 3).map((n, i) => (
              <li key={i} className="flex gap-1.5"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" /> {n}</li>
            ))}
          </ul>
        ) : null}
        {result.aiRisk && (
          <div className={cn("rounded-md border p-2.5", result.aiRisk.score >= 30 ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40" : "border-border bg-card")}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              <ShieldAlert className={cn("h-3.5 w-3.5", result.aiRisk.score >= 30 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")} />
              AI-assistance risk signal: {result.aiRisk.score}% ({result.aiRisk.confidence} confidence)
            </p>
            {result.aiRisk.signals.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                {result.aiRisk.signals.slice(0, 3).map((s, i) => <li key={i}>• {s}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground">No unusual patterns detected in this session.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Test results panel ─────────────────────────────────────────────────────

function TestResultsPanel({
  results,
  compileError,
  logs,
  showAll,
  isSql = false,
  running = false,
}: {
  results: ClientTestResult[] | null;
  compileError: string | null;
  logs?: string[];
  showAll: boolean;
  isSql?: boolean;
  /** a run is in flight — console shows an honest in-progress state */
  running?: boolean;
}) {
  const visible = (results ?? []).filter((r) => showAll || !r.hidden);
  const passedCount = visible.filter((r) => r.pass).length;
  const failedCount = visible.length - passedCount;
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {isSql ? "Query results" : "Console — test results"}
          </p>
          {running ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400" role="status">
              <Loader2 className="h-3 w-3 animate-spin" /> Running…
            </span>
          ) : results ? (
            <span className="flex items-center gap-1.5 text-xs tabular-nums">
              <span className="rounded-[3px] border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-medium text-emerald-800 dark:text-emerald-400">
                {passedCount} passed
              </span>
              {failedCount > 0 && (
                <span className="rounded-[3px] border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 font-medium text-rose-700 dark:text-rose-400">
                  {failedCount} failed
                </span>
              )}
              <span className="text-zinc-400 dark:text-zinc-500">of {visible.length} run</span>
            </span>
          ) : null}
        </div>
        {compileError && (
          <div className="mb-2 rounded-md border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-2.5 font-mono text-xs text-rose-800 dark:text-rose-400">
            {compileError}
          </div>
        )}
        <ScrollArea className="max-h-56">
          <div className="space-y-1.5">
            {visible.map((r) => (
              <div key={r.index} className={cn("rounded-md border px-3 py-2 text-xs", r.pass ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40" : "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40")}>
                <div className="flex items-center gap-2">
                  {r.pass ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-rose-700 dark:text-rose-400" />}
                  <span className={r.pass ? "font-semibold text-emerald-800 dark:text-emerald-400" : "font-semibold text-rose-700 dark:text-rose-400"}>{r.pass ? "Pass" : "Fail"}</span>
                  <span className="text-zinc-500 dark:text-zinc-400">· {r.ms}ms</span>
                  {r.hidden && <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300">hidden</span>}
                </div>
                {!r.hidden && (
                  isSql ? (
                    <SqlTestDetail result={r} />
                  ) : (
                    <>
                      <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        input: {r.inputPreview}
                      </p>
                      {!r.pass && (
                        <p className="mt-0.5 font-mono text-[11px] text-rose-700 dark:text-rose-400">
                          {r.error ? `error: ${r.error}` : `expected ${r.expectedPreview} — got ${r.actualPreview}`}
                        </p>
                      )}
                    </>
                  )
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
        {logs && logs.length > 0 && (
          <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
            {logs.slice(0, 8).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SQL presentation (schema browser + visible-test detail) ────────────────

interface SqlSchemaColumn {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  unique: boolean;
}

interface SqlSchemaTable {
  name: string;
  columns: SqlSchemaColumn[];
}

const SQL_CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w$]*))\s*\(/i;

const SQL_COLUMN_DEF_RE = /^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][\w$]*))\s*([\s\S]*)$/;

/** Split SQL text on a separator, ignoring separators inside quotes or parentheses. */
function splitSqlTopLevel(sql: string, sep: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/**
 * Defensive client-side parse of the question's DDL into table cards.
 * Handles multi-line definitions, quoted/bracketed identifiers and table-level
 * constraints (which are skipped). Returns [] when nothing parseable is found —
 * the UI then falls back to showing the raw DDL only.
 */
function parseSchemaTables(schemaSql: string): SqlSchemaTable[] {
  if (!schemaSql) return [];
  const tables: SqlSchemaTable[] = [];
  for (const stmtRaw of splitSqlTopLevel(schemaSql, ";")) {
    const stmt = stmtRaw.replace(/\s+/g, " ").trim();
    const m = SQL_CREATE_TABLE_RE.exec(stmt);
    if (!m) continue;
    const name = m[1] || m[2] || m[3] || m[4];
    if (!name) continue;
    const start = m.index + m[0].length;
    const end = stmt.lastIndexOf(")");
    const body = end > start ? stmt.slice(start, end) : "";
    const columns: SqlSchemaColumn[] = [];
    for (const defRaw of splitSqlTopLevel(body, ",")) {
      const def = defRaw.trim();
      if (!def) continue;
      // table-level constraints are not column definitions
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|KEY|INDEX)\b/i.test(def)) continue;
      const cm = SQL_COLUMN_DEF_RE.exec(def);
      if (!cm) continue;
      const colName = cm[1] || cm[2] || cm[3] || cm[4];
      if (!colName) continue;
      const rest = cm[5] ?? "";
      const tm = rest.match(/^\s*([A-Za-z_]\w*)(\s*\([^)]*\))?/);
      columns.push({
        name: colName,
        type: tm ? tm[1] + (tm[2] ? tm[2].replace(/\s+/g, "") : "") : "",
        pk: /\bPRIMARY\s+KEY\b/i.test(rest),
        notNull: /\bNOT\s+NULL\b/i.test(rest),
        unique: /\bUNIQUE\b/i.test(rest),
      });
    }
    tables.push({ name, columns });
  }
  return tables;
}

function SchemaBrowser({ schemaSql }: { schemaSql: string }) {
  const tables = useMemo(() => parseSchemaTables(schemaSql), [schemaSql]);
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Database className="h-3 w-3" /> Database schema
          </p>
          {tables.length > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {tables.length} table{tables.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {tables.length > 0 ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {tables.map((t) => (
                <div key={t.name} className="min-w-0 overflow-hidden rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40">
                  <p className="truncate border-b border-border px-3 py-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.name}
                  </p>
                  {t.columns.length > 0 ? (
                    <ul className="divide-y divide-border/60">
                      {t.columns.map((c) => (
                        <li key={c.name} className="flex min-w-0 items-center gap-2 px-3 py-1 font-mono text-[11px]">
                          <span className="min-w-0 truncate text-zinc-800 dark:text-zinc-300">{c.name}</span>
                          {c.type && <span className="shrink-0 text-zinc-400 dark:text-zinc-400">{c.type}</span>}
                          <span className="ml-auto flex shrink-0 items-center gap-1">
                            {c.pk && (
                              <span className="rounded border border-[#5c7250]/40 bg-[#5c7250]/5 dark:bg-[#5c7250]/15 px-1 text-[9px] font-semibold leading-4 text-[#5c7250] dark:text-[#a9c29b]">
                                PK
                              </span>
                            )}
                            {c.notNull && (
                              <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-card px-1 text-[9px] leading-4 text-zinc-500 dark:text-zinc-400">
                                NN
                              </span>
                            )}
                            {c.unique && (
                              <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-card px-1 text-[9px] leading-4 text-zinc-500 dark:text-zinc-400">
                                UQ
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-1.5 font-mono text-[11px] text-zinc-400 dark:text-zinc-400">columns could not be parsed</p>
                  )}
                </div>
              ))}
            </div>
            <details className="group">
              <summary className="flex w-fit cursor-pointer list-none select-none items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-zinc-700 dark:hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" /> View raw DDL
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
                {schemaSql}
              </pre>
            </details>
          </>
        ) : (
          // parse found nothing usable — show the DDL as-is
          <pre className="max-h-56 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100">
            {schemaSql}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Parse the server's SQL expected-rows preview ("2 rows · [1,\"a\"] | [2,\"b\"]",
 * capped at 3 rows / 220 chars) back into structured rows. Returns null when the
 * preview does not parse — the UI then falls back to the raw string.
 */
function parseSqlExpectedRows(preview: string): { rows: unknown[][]; truncated: boolean } | null {
  if (!preview) return null;
  if (/^∅\s*\(0 rows\)/.test(preview)) return { rows: [], truncated: false };
  const m = preview.match(/^(\d+)\s+rows?\s*·\s*([\s\S]+)$/);
  if (!m) return null;
  const total = Number(m[1]);
  const rows: unknown[][] = [];
  for (const part of m[2].split(" | ")) {
    try {
      const v = JSON.parse(part) as unknown;
      if (!Array.isArray(v)) return null;
      rows.push(v as unknown[]);
    } catch {
      break; // preview was truncated mid-row
    }
  }
  if (!rows.length) return null;
  return { rows, truncated: rows.length < total };
}

function SqlExpectedTable({ rows, truncated }: { rows: unknown[][]; truncated: boolean }) {
  if (!rows.length) {
    return <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">0 rows — empty result</p>;
  }
  const width = Math.max(...rows.map((r) => r.length));
  return (
    <div className="mt-1 min-w-0 overflow-x-auto rounded-md border border-border">
      <table className="max-w-full border-collapse font-mono text-[11px] tabular-nums">
        <thead>
          <tr className="border-b border-border bg-zinc-50 dark:bg-zinc-800/40">
            <th className="px-2 py-1 text-left font-semibold text-zinc-500 dark:text-zinc-400">Row</th>
            {Array.from({ length: width }, (_, i) => (
              <th key={i} className="px-2 py-1 text-left font-semibold text-zinc-500 dark:text-zinc-400">
                #
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border bg-card last:border-b-0">
              <td className="px-2 py-1 text-zinc-400 dark:text-zinc-400">{ri + 1}</td>
              {Array.from({ length: width }, (_, ci) => {
                const v = row[ci];
                return (
                  <td
                    key={ci}
                    className={cn("whitespace-nowrap px-2 py-1", v === null || v === undefined ? "text-zinc-400 dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-300")}
                  >
                    {v === null ? "NULL" : v === undefined ? "" : JSON.stringify(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <p className="border-t border-border bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          … preview truncated — run the query to compare the full result
        </p>
      )}
    </div>
  );
}

/** Per-test detail for visible SQL tests (replaces the args/expected JSON lines). */
function SqlTestDetail({ result }: { result: ClientTestResult }) {
  const setup = result.inputPreview.startsWith("setup: ") ? result.inputPreview.slice("setup: ".length).trim() : null;
  const expected = parseSqlExpectedRows(result.expectedPreview);
  return (
    <div className="mt-1.5 min-w-0 space-y-2">
      {setup && (
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Scenario setup
          </p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-zinc-100">
            {setup}
          </pre>
        </div>
      )}
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Expected result
        </p>
        {expected ? (
          <SqlExpectedTable rows={expected.rows} truncated={expected.truncated} />
        ) : (
          <p className="mt-1 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{result.expectedPreview}</p>
        )}
      </div>
      {!result.pass && result.error && <p className="font-mono text-[11px] text-rose-700 dark:text-rose-400">error: {result.error}</p>}
      {!result.pass && result.actualPreview !== "—" && (
        <p className="min-w-0 truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">your query returned: {result.actualPreview}</p>
      )}
    </div>
  );
}

// ─── Explain phase ──────────────────────────────────────────────────────────

function ExplainPhase(props: {
  question: ClientQuestion;
  phase: Phase;
  explainQs: ExplainQuestion[] | null;
  explainLoading: boolean;
  explainAnswers: string[];
  setExplainAnswers: (a: string[]) => void;
  explainSubmitting: boolean;
  explainEvals: ExplainEvaluation[] | null;
  onSubmitExplain: () => void;
  onNext: () => void;
}) {
  const done = props.phase === "explainDone";
  const avg = props.explainEvals
    ? Math.round(props.explainEvals.reduce((a, e) => a + e.score, 0) / props.explainEvals.length)
    : null;

  return (
    <Card className="border-emerald-200 dark:border-emerald-800/60 bg-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <MessageSquareCode className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Explain-the-Code verification</p>
            <p className="text-xs text-muted-foreground">
              Questions were generated from <span className="text-emerald-800 dark:text-emerald-400">your actual submitted code</span>. Answer in your own words — consistency feeds your evidence profile.
            </p>
          </div>
        </div>

        {props.explainLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-700 dark:text-emerald-400" /> Analyzing your code to generate verification questions…
          </div>
        )}

        {props.explainQs?.map((eq, i) => (
          <div key={i} className="space-y-2 rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3.5">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              <span className="mr-1.5 font-mono text-[#5c7250] dark:text-[#a9c29b]">Q{i + 1}.</span>{eq.q}
            </p>
            {eq.hint && !done && (
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lightbulb className="h-3 w-3 text-amber-700 dark:text-amber-400" /> {eq.hint}
              </p>
            )}
            {!done ? (
              <Textarea
                value={props.explainAnswers[i] ?? ""}
                onChange={(e) => {
                  const next = [...props.explainAnswers];
                  next[i] = e.target.value;
                  props.setExplainAnswers(next);
                }}
                placeholder="Explain in your own words…"
                className="min-h-20 text-sm"
              />
            ) : (
              props.explainEvals && (
                <div className="rounded-md border border-border bg-card p-2.5 text-xs">
                  <p className="text-zinc-500 dark:text-zinc-400">Your answer: <span className="text-zinc-900 dark:text-zinc-100">{props.explainAnswers[i]}</span></p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {(() => {
                      const ev = props.explainEvals[i];
                      const color = ev.score >= 70 ? "text-emerald-700 dark:text-emerald-400" : ev.score >= 45 ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400";
                      return (
                        <>
                          <span className={cn("font-semibold", color)}>Consistency: {ev.score}%</span>
                          <span className="text-zinc-500 dark:text-zinc-400">· {ev.feedback}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )
            )}
          </div>
        ))}

        <div className="flex justify-end">
          {!done ? (
            <Button
              onClick={props.onSubmitExplain}
              disabled={props.explainSubmitting || props.explainLoading || !props.explainQs}
              className="sp-press font-semibold"
            >
              {props.explainSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Submit explanation
            </Button>
          ) : (
            <Button onClick={props.onNext} className="sp-press font-semibold">
              {avg != null && <span className="mr-2 tabular-nums text-zinc-50/70 dark:text-zinc-950/70">avg {avg}%</span>}
              Next question <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
