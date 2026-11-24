"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeEvolutionIfOpen } from "@/components/skillproof/code-evolution";
import { HiringStatusPanel } from "@/components/skillproof/hiring-status";
import {
  ConfidenceBadge,
  CohortStanding,
  EvidenceBar,
  ProofGraph,
  RadarChart,
  RiskBadge,
  ScoreRing,
  scoreColor,
} from "@/components/skillproof/shared";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Award,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  FileDown,
  Flame,
  Hand,
  Home,
  Layers,
  Link2,
  Loader2,
  Lock,
  Printer,
  MessageSquareCode,
  RefreshCw,
  ShieldCheck,
  Medal,
  Target,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import type { AssessmentReport, BreakdownItem, ClaimedLevel, SkillResult } from "@/lib/types";

interface AttemptSummary {
  assessmentId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  overall: number | null;
  confidence: string | null;
}

interface ProctorSummary {
  total: number;
  positive: number;
  warn: number;
  risk: number;
}

/**
 * Aggregate-only monitoring disclosure — the candidate's own tally of the
 * disclosed, session-scoped proctoring behind this run. Counts only: the
 * full event ledger stays in the recruiter's dossier. Silent when the run
 * recorded no events or the summary is unavailable (e.g. signed-out guest).
 */
function ProctorDisclosure({ assessmentId }: { assessmentId: string }) {
  const [summary, setSummary] = useState<ProctorSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/proctor/summary?assessmentId=${encodeURIComponent(assessmentId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) {
          setSummary({
            total: Number(data.total ?? 0),
            positive: Number(data.positive ?? 0),
            warn: Number(data.warn ?? 0),
            risk: Number(data.risk ?? 0),
          });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  if (failed || !summary || summary.total === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2"
      title="Disclosed, session-scoped monitoring. The full event ledger lives with the recruiter — this tally is the complete candidate-facing record."
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300">
        Disclosed monitoring · {summary.total} event{summary.total === 1 ? "" : "s"} recorded
      </p>
      {summary.risk > 0 ? (
        <span className="rounded border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-rose-700 dark:text-rose-400">
          {summary.risk} risk flag{summary.risk === 1 ? "" : "s"}
        </span>
      ) : (
        <span className="rounded border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          no risk flags
        </span>
      )}
      {summary.warn > 0 && (
        <span className="rounded border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-px font-mono text-[9px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {summary.warn} warning{summary.warn === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

/** Editorial section heading: mono uppercase micro-label + hairline rule,
 *  with an optional right-aligned mono meta annotation. */
function SectionHeading({ id, label, meta }: { id?: string; label: string; meta?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-zinc-200 dark:border-zinc-700 pb-2">
      <h2 id={id} className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </h2>
      {meta != null && <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{meta}</span>}
    </div>
  );
}

export function ResultsStep() {
  const store = useStore();
  const report = store.report;
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [openSkills, setOpenSkills] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [retaking, setRetaking] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  // issued certificate for the active attempt (recruiter-issued, may not exist yet)
  const [cert, setCert] = useState<{ code: string; issuedBy: string; issuedAt: string } | null>(null);

  // hydrated session without in-memory report → refetch it
  useEffect(() => {
    if (report || !store.resultsAssessmentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/report/${store.resultsAssessmentId}`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        store.setReport(data, store.resultsAssessmentId!);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [report, store.resultsAssessmentId]);

  // own run history (candidate side) — only for the candidate's own results
  useEffect(() => {
    if (store.sharedReport || !store.candidateId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/candidates/${store.candidateId}/attempts`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const list = (data.attempts ?? []) as AttemptSummary[];
        list.sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
        setAttempts(list);
      } catch {
        if (!cancelled) setAttempts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store.sharedReport, store.candidateId]);

  // certificate status for the active attempt — recruiters issue these after review
  useEffect(() => {
    if (!store.resultsAssessmentId) return;
    let cancelled = false;
    setCert(null);
    (async () => {
      try {
        const res = await fetch(`/api/certificates?assessmentId=${encodeURIComponent(store.resultsAssessmentId!)}`);
        const data = await res.json();
        if (!cancelled && res.ok) setCert(data.certificate ?? null);
      } catch {
        if (!cancelled) setCert(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store.resultsAssessmentId]);

  const topSkill = useMemo(
    () => (report ? [...report.skills].filter((s) => s.assessed).sort((a, b) => b.score - a.score)[0] : undefined),
    [report]
  );

  const timeStats = useMemo(() => {
    if (!report) return null;
    const items = report.breakdown.filter((b) => b.timeSpentSec != null);
    if (!items.length) return null;
    const total = items.reduce((a, b) => a + (b.timeSpentSec ?? 0), 0);
    const withLimits = items.filter((b) => b.timeLimitSec);
    const within = withLimits.filter((b) => (b.timeSpentSec ?? 0) <= (b.timeLimitSec ?? Infinity)).length;
    return { items, total, withLimits, within };
  }, [report]);

  const achievements = useMemo(() => (report ? computeAchievements(report) : []), [report]);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const growthPlan = useMemo(() => (report ? computeGrowthPlan(report) : []), [report]);

  const switchAttempt = async (assessmentId: string) => {
    if (switching) return;
    setSwitching(assessmentId);
    try {
      const res = await fetch(`/api/report/${assessmentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Report not found");
      store.setReport(data, assessmentId);
      setOpenItems([]);
      setOpenSkills([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Could not load that attempt");
    } finally {
      setSwitching(null);
    }
  };

  const viewCertificate = async (code: string) => {
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Certificate not found");
      store.setCertificate(data.certificate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the certificate");
    }
  };

  const retake = async () => {
    if (!report || retaking) return;
    const fromSelection = Object.entries(store.selection)
      .filter(([, v]) => v.selected)
      .map(([skill, v]) => ({ skill, level: v.level }));
    const skills =
      fromSelection.length > 0
        ? fromSelection
        : report.skills
            .filter((s) => s.assessed)
            .map((s) => ({ skill: s.skill, level: (s.claimedLevel ?? "Intermediate") as ClaimedLevel }));
    if (skills.length === 0) {
      toast.error("No skills to re-verify — select skills from your profile first");
      return;
    }
    setRetaking(true);
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: store.candidateId || undefined,
          name: store.candidateName || report.candidateName,
          email: store.candidateEmail || undefined,
          resumeText: store.resumeText || undefined,
          resumeFileName: store.resumeFileName || undefined,
          skills,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create assessment");
      store.setAssessment(data.assessmentId, data.candidateId, data.total);
      store.setQuestion(null);
      store.setReport(null, "");
      store.setCandidateStep("assessment");
      toast.success("New verification started", {
        description: `${data.total} fresh questions — every run stays in your history.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start retake");
    } finally {
      setRetaking(false);
    }
  };

  const toggleSkillRow = (skill: string) =>
    setOpenSkills((prev) => (prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]));

  if (!report) {
    return (
      <div className="flex items-center justify-center gap-3 py-32 text-sm text-zinc-500 dark:text-zinc-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
        Loading your verified profile…
      </div>
    );
  }

  // ── evidence header inputs ──
  const runId = store.resultsAssessmentId ?? report.assessmentId;
  const shortRunId = runId ? runId.slice(0, 12) : "";
  const verifiedDate = new Date(report.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const assessedSkillNames = report.skills.filter((s) => s.assessed).map((s) => s.skill);
  const skillsSummary =
    (assessedSkillNames.length > 0 ? assessedSkillNames : report.skills.map((s) => s.skill)).join(" · ");

  // ── verification summary inputs (all derived honestly from the report) ──
  const assessedSkills = report.skills.filter((s) => s.assessed);
  const evidencePoints = report.skills.reduce((a, s) => a + (s.evidence?.length ?? 0), 0);
  // "answered" = every dealt question with a recorded outcome (solved/failed/timeout);
  // skipped questions were never answered and are excluded
  const answeredCount = report.breakdown.filter((b) => b.status !== "skipped").length;
  // trust the store's dealt total only when it provably describes THIS run
  // (assessmentId pairs the total with its run; after a retake or attempt
  // switch it may not) — otherwise fall back to the run's own recorded
  // outcomes; never invent a Y
  const totalBelongsToRun = store.assessmentId != null && store.assessmentId === store.resultsAssessmentId;
  const storedTotal = totalBelongsToRun ? store.assessmentTotal : 0;
  const dealtTotal =
    storedTotal > 0 && storedTotal >= report.breakdown.length ? storedTotal : report.breakdown.length;

  const questionsForSkill = (skill: string) => report.breakdown.filter((b) => b.skill === skill);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      {/* ── evidence header band ─────────────────────────────────────────── */}
      <section aria-label="Verified profile" className="border border-zinc-300 dark:border-zinc-700 bg-card">
        <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span aria-hidden className="inline-block h-2 w-2 shrink-0 bg-[#5c7250]" />
              <span className="truncate">
                Verified profile{shortRunId ? ` · run ${shortRunId}` : ""}
              </span>
            </p>
            <h1 className="mt-2 font-display text-3xl tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">{report.candidateName}</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {skillsSummary && <span className="text-zinc-600 dark:text-zinc-300">{skillsSummary}</span>}
              {skillsSummary && <span aria-hidden> · </span>}
              <span>Verified {verifiedDate}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-6 sm:gap-8">
            <div className="flex flex-col items-center gap-2">
              <ScoreRing score={report.overall} size={112} label="overall" />
              <p className="text-center text-[11px] leading-tight text-muted-foreground">
                Evidence-weighted
                <br />
                overall score
              </p>
              <CohortStanding score={report.overall} className="w-full max-w-[176px]" />
            </div>
            <div className="flex flex-col items-start gap-4">
              <div className="flex flex-col items-start gap-1.5">
                <ConfidenceBadge level={report.confidence} />
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Confidence</span>
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <RiskBadge risk={report.aiRisk} />
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">AI-assist risk</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── verification summary ─────────────────────────────────────────── */}
      <section aria-labelledby="verification-summary-label">
        <div className="border border-zinc-300 dark:border-zinc-700 bg-card">
          <h2
            id="verification-summary-label"
            className="border-b border-zinc-200 dark:border-zinc-700 px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:px-6"
          >
            Verification summary
          </h2>
          <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
              <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Overall verification score</dt>
              <dd className="flex items-center">
                <span className="font-mono text-[15px] font-semibold tabular-nums" style={{ color: scoreColor(report.overall) }}>
                  {report.overall}
                  <span className="text-zinc-400 dark:text-zinc-400">/100</span>
                </span>
              </dd>
              <p className="text-[11px] leading-snug text-muted-foreground">Evidence-weighted across every assessed question.</p>
            </div>
            <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
              <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Confidence</dt>
              <dd className="flex items-center">
                <ConfidenceBadge level={report.confidence} />
              </dd>
              <p className="text-[11px] leading-snug text-muted-foreground">How strongly the recorded evidence supports these scores.</p>
            </div>
            {report.breakdown.length > 0 && (
              <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
                <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Assessment completion</dt>
                <dd className="flex items-center">
                  <span className="font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                    {answeredCount}/{dealtTotal}
                  </span>
                  <span className="ml-1.5 text-[11px] text-muted-foreground">questions</span>
                </dd>
                <p className="text-[11px] leading-snug text-muted-foreground">questions answered of those dealt in this run.</p>
              </div>
            )}
            <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
              <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Evidence strength</dt>
              <dd className="flex items-center">
                <span className="font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                  {assessedSkills.length}/{report.skills.length}
                </span>
                <span className="ml-1.5 text-[11px] text-muted-foreground">skills verified</span>
              </dd>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {evidencePoints} evidence point{evidencePoints === 1 ? "" : "s"} cited from code, tests and explanations.
              </p>
            </div>
            <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
              <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Consistency</dt>
              <dd className="flex items-center">
                <span
                  className="font-mono text-sm tabular-nums"
                  style={{ color: scoreColor(report.categories.consistency) }}
                >
                  {report.categories.consistency}
                  <span className="text-zinc-400 dark:text-zinc-400">/100</span>
                </span>
              </dd>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Agreement between the code, its test results and the candidate&apos;s explanations.
              </p>
            </div>
            <div className="grid gap-x-5 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_minmax(0,1.15fr)] sm:items-center sm:px-6">
              <dt className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">AI-assistance risk</dt>
              <dd className="flex items-center">
                <RiskBadge risk={report.aiRisk} />
              </dd>
              <p className="text-[11px] leading-snug text-muted-foreground">
                A risk signal — not proof. Weigh it alongside evidence and explanations.
              </p>
            </div>
          </dl>
        </div>
      </section>

      {/* ── skill evidence — claims vs what was actually proven ──────────── */}
      <section aria-labelledby="skill-evidence-label">
        <SectionHeading
          id="skill-evidence-label"
          label="Skill evidence"
          meta={`${assessedSkills.length}/${report.skills.length} claimed skills verified`}
        />
        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow className="border-zinc-300 dark:border-zinc-700 hover:bg-transparent">
              <TableHead scope="col" className="h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Skill
              </TableHead>
              <TableHead scope="col" className="h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Claimed
              </TableHead>
              <TableHead scope="col" className="h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Verified
              </TableHead>
              <TableHead scope="col" className="h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Score
              </TableHead>
              <TableHead scope="col" className="h-9 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Confidence
              </TableHead>
              <TableHead scope="col" className="h-9 px-2 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Evidence
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.skills.map((s) => {
              const expanded = openSkills.includes(s.skill);
              const skillQuestions = questionsForSkill(s.skill);
              const vLevel = s.assessed ? verifiedLevel(s.score) : null;
              // semantic tone of the verified chip: emerald = proven at/above
              // the claim, amber = proven, but below the claimed level
              const meetsClaim =
                vLevel != null && (!s.claimedLevel || CLAIM_ORDINAL[vLevel] >= CLAIM_ORDINAL[s.claimedLevel]);
              return (
                <Fragment key={s.skill}>
                  <TableRow className="border-zinc-200 dark:border-zinc-700">
                    <TableCell className="px-2 py-3 font-medium text-zinc-900 dark:text-zinc-100">{s.skill}</TableCell>
                    <TableCell className="px-2 py-3">
                      {s.claimedLevel ? (
                        <span className="inline-block rounded-[3px] border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                          {s.claimedLevel}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {s.assessed && vLevel ? (
                        <span
                          className={cn(
                            "inline-block rounded-[3px] border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
                            meetsClaim
                              ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                              : "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                          )}
                        >
                          {vLevel}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {s.assessed ? (
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: scoreColor(s.score) }}>
                            {s.score}
                            <span className="text-zinc-400 dark:text-zinc-400">/100</span>
                          </span>
                          <div className="w-20 sm:w-28">
                            <EvidenceBar score={s.score} height="h-1" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <ConfidenceBadge level={s.assessed ? s.confidence : null} />
                    </TableCell>
                    <TableCell className="px-2 py-3 text-right">
                      {s.assessed ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "View"} evidence for ${s.skill}`}
                          onClick={() => toggleSkillRow(s.skill)}
                        >
                          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {expanded ? "Hide" : "View"}
                        </Button>
                      ) : (
                        <span className="text-[11px] italic text-zinc-400 dark:text-zinc-400">not assessed this run</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="border-zinc-200 dark:border-zinc-700 hover:bg-transparent">
                      <TableCell colSpan={6} className="whitespace-normal border-l-2 border-l-[#5c7250] bg-zinc-50 dark:bg-zinc-800/40 p-0">
                        <div className="px-4 py-4 sm:px-5">
                          <SkillEvidenceDetail skill={s} questions={skillQuestions} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Claims are never graded without evidence — a claimed skill this run didn&apos;t assess stays unverified
          (&ldquo;—&rdquo;) until a future run proves it.
        </p>
      </section>

      <div className="grid gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* left column */}
        <div className="min-w-0 space-y-8">
          {/* recruiter decision — candidate-facing, own results only */}
          {!store.sharedReport && store.candidateId && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="print:hidden">
              <HiringStatusPanel candidateId={store.candidateId} />
            </motion.section>
          )}

          {/* skill certificate — issued by the recruiter after review */}
          {cert ? (
            <div className="flex flex-wrap items-center gap-3 border border-zinc-300 dark:border-zinc-700 bg-card px-4 py-3 print:hidden">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#5c7250]/30 bg-[#5c7250]/5 dark:bg-[#5c7250]/15">
                <Award className="h-4 w-4 text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Certificate issued by {cert.issuedBy}
                </p>
                <p className="font-mono text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{cert.code}</p>
              </div>
              <Button size="sm" className="ml-auto sp-press" onClick={() => viewCertificate(cert.code)}>
                View certificate
              </Button>
            </div>
          ) : (
            !store.sharedReport && (
              <p className="flex items-start gap-2.5 border border-zinc-300 dark:border-zinc-700 bg-card px-4 py-3 text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400 print:hidden">
                <span aria-hidden className="mt-1.5 inline-block h-2 w-2 shrink-0 bg-zinc-300 dark:bg-zinc-700" />
                A verified skill certificate — with your proficiency percentages, like a placement scorecard — can be issued by the recruiter once they review this report.
              </p>
            )
          )}

          {/* achievements */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.45 }}>
            <SectionHeading label="Achievements" meta={`${unlockedCount}/${achievements.length} unlocked`} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {achievements.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.04, duration: 0.3 }}
                  title={a.description}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-md border p-2.5 text-center transition-all",
                    a.unlocked
                      ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40"
                      : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 opacity-55"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      a.unlocked ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                    )}
                  >
                    {a.unlocked ? <a.icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn("text-[11px] font-semibold leading-tight", a.unlocked ? "text-amber-900 dark:text-amber-300" : "text-zinc-500 dark:text-zinc-400")}>
                    {a.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* growth plan */}
          {growthPlan.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.45 }}>
              <SectionHeading label="Suggested growth plan" />
              <div className="space-y-4">
                {growthPlan.map((g, i) => (
                  <div key={g.skill} className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3.5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 font-mono text-[11px] font-bold tabular-nums text-sky-800">
                        {i + 1}
                      </span>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Strengthen {g.skill}</p>
                      <span className="font-mono text-xs" style={{ color: scoreColor(g.score) }}>
                        {g.score}/100
                      </span>
                      {g.claimed && g.score < g.targetForClaimed && (
                        <Badge variant="outline" className="border-sky-200 text-[10px] text-sky-800">
                          below your {g.claimed.toLowerCase()} claim
                        </Badge>
                      )}
                    </div>
                    {g.weakTopics.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {g.weakTopics.map((t) => (
                          <span key={t} className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-1">
                      {g.nextSteps.map((step, j) => (
                        <li key={j} className="flex gap-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                          <Target className="mt-0.5 h-3 w-3 shrink-0 text-sky-600" /> {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
                  Focus areas are derived from your weakest topics and per-skill evidence — practice these before your next
                  assessment to raise the demonstrated bar.
                </p>
              </div>
            </motion.section>
          )}

          {/* time analytics */}
          {timeStats && timeStats.items.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45 }}>
              <SectionHeading label="Time analytics" meta={`total ${Math.floor(timeStats.total / 60)}m ${timeStats.total % 60}s`} />
              <div className="space-y-3">
                {timeStats.withLimits.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {timeStats.within}/{timeStats.withLimits.length} question(s) within the time limit — bars show time
                    spent vs limit.
                  </p>
                )}
                {timeStats.items.map((b) => {
                  const spent = b.timeSpentSec ?? 0;
                  const limit = b.timeLimitSec ?? null;
                  const ratio = limit ? spent / limit : 0;
                  const barColor = !limit ? "#a1a1aa" : ratio <= 0.7 ? "#059669" : ratio <= 1 ? "#d97706" : "#e11d48";
                  return (
                    <div key={b.aqId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-zinc-700 dark:text-zinc-300">{b.questionTitle}</span>
                        <span className="shrink-0 font-mono" style={{ color: barColor }}>
                          {Math.floor(spent / 60)}m {spent % 60}s
                          {limit ? ` / ${Math.round(limit / 60)}m` : ""}
                        </span>
                      </div>
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                        {limit ? (
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: barColor }}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                          />
                        ) : (
                          <div className="h-full rounded-full bg-zinc-400 dark:bg-zinc-600" style={{ width: "40%" }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* question-by-question breakdown */}
          <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.45 }}>
            <SectionHeading label="Question-by-question breakdown" meta={`${report.breakdown.length} question${report.breakdown.length === 1 ? "" : "s"}`} />
            <Accordion type="multiple" className="w-full" value={openItems} onValueChange={setOpenItems}>
              {report.breakdown.map((b, i) => (
                <AccordionItem key={b.aqId} value={`item-${i}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex flex-1 flex-wrap items-center gap-2 pr-3 text-left">
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                          b.score != null && b.score >= 70
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400"
                            : b.score != null && b.score >= 40
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400"
                              : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400"
                        )}
                      >
                        {b.score != null ? Math.round(b.score) : "—"}
                      </span>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{b.questionTitle}</span>
                      <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-[10px] text-zinc-600 dark:text-zinc-300">
                        {b.skill}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-300 dark:border-zinc-700 text-[10px] capitalize text-zinc-600 dark:text-zinc-300">
                        {b.category}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <BreakdownDetail b={b} />
                    <CodeEvolutionIfOpen open={openItems.includes(`item-${i}`)} b={b} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.section>
        </div>

        {/* right column */}
        <div className="space-y-8">
          {/* proof graph */}
          {topSkill && (
            <section>
              <SectionHeading label={`Proof graph · ${topSkill.skill}`} />
              <ProofGraph skill={topSkill.skill} score={topSkill.score} evidence={topSkill.evidence} />
            </section>
          )}

          {/* categories */}
          <section>
            <SectionHeading label="Category scores" />
            <RadarChart
              values={Object.entries(report.categories).map(([label, score]) => ({
                label: label.replace(/([A-Z])/g, " $1").trim(),
                score: score as number,
              }))}
            />
            <div className="mt-3 space-y-2.5">
              {Object.entries(report.categories).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-xs">
                    <span className="capitalize text-zinc-700 dark:text-zinc-300">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                    <span className="font-mono" style={{ color: scoreColor(v) }}>
                      {v}
                    </span>
                  </div>
                  <EvidenceBar score={v} height="h-1.5" />
                </div>
              ))}
            </div>
          </section>

          {/* your attempts + retake (candidate's own results only) */}
          {!store.sharedReport && store.candidateId && (
            <section className="print:hidden">
              <SectionHeading
                label="Your attempts"
                meta={attempts && attempts.length > 1 ? `${attempts.filter((a) => a.status === "completed").length} verified` : undefined}
              />
              <div className="space-y-3">
                {attempts === null ? (
                  <div className="sp-shimmer h-6 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
                ) : attempts.length <= 1 ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    This is your first verification run. Retake it anytime — every attempt is kept, so recruiters can
                    see your progress over time.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" role="list" aria-label="Verification attempt history">
                    {attempts.map((a) => {
                      const active = a.assessmentId === store.resultsAssessmentId;
                      const completed = a.status === "completed" && a.overall != null;
                      return (
                        <button
                          key={a.assessmentId}
                          role="listitem"
                          disabled={!completed || active || switching != null}
                          onClick={() => void switchAttempt(a.assessmentId)}
                          title={
                            completed
                              ? `Scored ${a.overall} · ${new Date(a.completedAt ?? a.createdAt).toLocaleDateString()} — click to view`
                              : "In progress — finish it to see a report"
                          }
                          className={cn(
                            "sp-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            active
                              ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 ring-1 ring-emerald-600/30"
                              : completed
                                ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 hover:border-emerald-600/50 dark:hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                : "cursor-not-allowed border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-400"
                          )}
                          style={completed && !active ? { color: scoreColor(a.overall!) } : undefined}
                        >
                          {completed ? (
                            <span className="font-mono">{a.overall}</span>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" /> in progress
                            </>
                          )}
                          {active && <span className="text-[9px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">current</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <Separator className="bg-border" />
                <Button
                  onClick={() => void retake()}
                  disabled={retaking}
                  className="sp-press w-full font-semibold"
                >
                  {retaking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Retake verification
                </Button>
                <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  A fresh personalized assessment on the same claimed skills. Recruiters see your latest completed run.
                </p>
              </div>
            </section>
          )}

          {/* AI risk */}
          <section>
            <SectionHeading label="AI-assistance analysis" />
            <div className="space-y-3">
              <div
                className={cn(
                  "border px-4 py-3.5",
                  report.aiRisk >= 30 ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40" : "border-emerald-200 dark:border-emerald-800/60 bg-card"
                )}
              >
                <div className="flex items-center gap-3">
                  <ScoreRing score={report.aiRisk} size={72} stroke={7} />
                  <div className="text-xs">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Risk score {Math.round(report.aiRisk)}%</p>
                    <p className="text-muted-foreground">{report.aiRiskConfidence} confidence</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      A risk signal — not proof. Weigh it alongside evidence and explanations.
                    </p>
                  </div>
                </div>
              </div>
              <Separator />
              <p className="flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span aria-hidden className="inline-block h-2 w-2 bg-zinc-950 dark:bg-zinc-100" /> Observed signals
              </p>
              {report.aiSignals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No unusual behavioral patterns detected.</p>
              ) : (
                <ul className="space-y-1">
                  {report.aiSignals.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      • {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* monitoring disclosure — aggregate tally of the disclosed session (counts only) */}
          {store.resultsAssessmentId && <ProctorDisclosure assessmentId={store.resultsAssessmentId} />}

          <div className="flex gap-2 print:hidden">
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="flex-1 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              <Printer className="mr-2 h-4 w-4" /> Export / print
            </Button>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button
              variant="outline"
              onClick={() => downloadBadge(report)}
              className="flex-1 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              <Award className="mr-2 h-4 w-4" /> Verified badge
            </Button>
            <Button
              variant="outline"
              onClick={() => copySummary(report)}
              className="flex-1 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              <Copy className="mr-2 h-4 w-4" /> Copy summary
            </Button>
          </div>
          <Button
            variant="outline"
            disabled={pdfBusy}
            onClick={async () => {
              setPdfBusy(true);
              try {
                // shared-report viewers authenticate via their share token;
                // owners/recruiters ride the session cookie
                const t = store.sharedReportToken
                  ? `?t=${encodeURIComponent(store.sharedReportToken)}`
                  : "";
                const res = await fetch(`/api/report/${report.assessmentId}/pdf${t}`);
                if (!res.ok) throw new Error();
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `skillproof-${report.candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Branded PDF report downloaded");
              } catch {
                toast.error("Failed to generate PDF — try again");
              } finally {
                setPdfBusy(false);
              }
            }}
            title="Download a server-rendered, branded PDF of this verified report"
            className="w-full border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 print:hidden"
          >
            {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Download PDF
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              // intentional sharing: the link carries the report's 192-bit
              // random share token — the bare assessment id grants nothing
              const shareToken =
                report.shareToken ?? store.sharedReportToken ?? "";
              const url = shareToken
                ? `${window.location.origin}/?report=${report.assessmentId}&t=${shareToken}`
                : `${window.location.origin}/?report=${report.assessmentId}`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Share link copied — anyone with it can view this verified report", {
                  description: url,
                });
              } catch {
                toast.error("Could not copy — link: " + url);
              }
            }}
            className="w-full border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 print:hidden"
          >
            <Link2 className="mr-2 h-4 w-4" /> Copy share link
          </Button>
          {!store.sharedReport && (
            <Button
              variant="outline"
              onClick={() => {
                store.resetFlow();
                store.setView("landing");
              }}
              className="w-full border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 print:hidden"
            >
              <Home className="mr-2 h-4 w-4" /> Back to home
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Verified level derivation ────────────────────────────────────────────

/** Ordinal rank used to compare a proven level against the claimed one. */
const CLAIM_ORDINAL: Record<ClaimedLevel, number> = { Basic: 1, Intermediate: 2, Advanced: 3 };

/**
 * Verified proficiency level — derived ONLY from the demonstrated score:
 * ≥75 proves Advanced, ≥55 proves Intermediate, anything lower still proves
 * Basic working knowledge. Deliberately independent of CLAIMED_TARGET (the
 * score a claim aims to justify, used by the growth plan): the Verified
 * column answers "what was proven", never "was the claim granted".
 */
function verifiedLevel(score: number): ClaimedLevel {
  if (score >= 75) return "Advanced";
  if (score >= 55) return "Intermediate";
  return "Basic";
}

// ─── Achievements & growth plan ───────────────────────────────────────────

interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  unlocked: boolean;
}

function computeAchievements(report: AssessmentReport): Achievement[] {
  const c = report.categories;
  const assessed = report.skills.filter((s) => s.assessed);
  const codingBreakdown = report.breakdown.filter((b) => b.category === "coding" || b.category === "debugging");
  const hintsTotal = codingBreakdown.reduce((a, b) => a + (b.hintsUsed ?? 0), 0);
  return [
    {
      id: "perfectionist",
      label: "Perfectionist",
      description: "Overall score of 90 or above",
      icon: Trophy,
      unlocked: report.overall >= 90,
    },
    {
      id: "bug-hunter",
      label: "Bug Hunter",
      description: "Debugging category score of 85 or above",
      icon: Bug,
      unlocked: c.debugging >= 85,
    },
    {
      id: "optimizer",
      label: "Optimizer",
      description: "Efficiency category score of 85 or above",
      icon: Zap,
      unlocked: c.efficiency >= 85,
    },
    {
      id: "clean-coder",
      label: "Clean Coder",
      description: "Code quality score of 85 or above",
      icon: Medal,
      unlocked: c.codeQuality >= 85,
    },
    {
      id: "deep-explainer",
      label: "Deep Explainer",
      description: "Explanation consistency of 85% or above",
      icon: MessageSquareCode,
      unlocked: c.explanation >= 85,
    },
    {
      id: "speed-runner",
      label: "Speed Runner",
      description: "Time management score of 85 or above",
      icon: Timer,
      unlocked: c.timeManagement >= 85,
    },
    {
      id: "authentic",
      label: "Authentic Code",
      description: "AI-assistance risk at or below 15%",
      icon: ShieldCheck,
      unlocked: report.aiRisk <= 15,
    },
    {
      id: "all-rounder",
      label: "All-rounder",
      description: "Every assessed skill scored 70 or above (min. 2 skills)",
      icon: Layers,
      unlocked: assessed.length >= 2 && assessed.every((s) => s.score >= 70),
    },
    {
      id: "self-reliant",
      label: "Self-Reliant",
      description: "Solved coding questions without any hints",
      icon: Hand,
      unlocked: codingBreakdown.length > 0 && hintsTotal === 0,
    },
    {
      id: "persistence",
      label: "Persistence",
      description: "Recovered from a failed attempt and still scored 70+ on a question",
      icon: Flame,
      unlocked: report.breakdown.some((b) => b.attempts >= 2 && (b.score ?? 0) >= 70),
    },
  ];
}

interface GrowthItem {
  skill: string;
  score: number;
  claimed: string | null;
  targetForClaimed: number;
  weakTopics: string[];
  nextSteps: string[];
}

const CLAIMED_TARGET: Record<string, number> = { Advanced: 85, Intermediate: 70, Basic: 55 };

function computeGrowthPlan(report: AssessmentReport): GrowthItem[] {
  return report.skills
    .filter((s) => s.assessed)
    .map((s) => ({ s, target: s.claimedLevel ? CLAIMED_TARGET[s.claimedLevel] ?? 70 : 70 }))
    .filter(({ s, target }) => s.score < 70 || s.score < target)
    .sort((a, b) => a.s.score - b.s.score)
    .slice(0, 3)
    .map(({ s, target }) => {
      const weakTopics = Array.from(
        new Set(
          report.breakdown
            .filter((b) => b.skill === s.skill && (b.score == null || b.score < 70))
            .map((b) => b.topic || b.questionTitle)
        )
      ).slice(0, 3);
      const nextSteps: string[] = [];
      if (weakTopics.length > 0) nextSteps.push(`Revisit ${weakTopics.join(", ")} — these cost you the most points this run.`);
      nextSteps.push(...(s.improvements ?? []).slice(0, 2));
      if (nextSteps.length === 0) nextSteps.push(`Practice more ${s.skill} problems at medium/hard difficulty to close the gap.`);
      return {
        skill: s.skill,
        score: s.score,
        claimed: s.claimedLevel,
        targetForClaimed: target,
        weakTopics,
        nextSteps: nextSteps.slice(0, 3),
      };
    });
}

// ─── Shareable badge & summary ──────────────────────────────────────────────

function badgeSvg(report: AssessmentReport): string {
  const assessed = report.skills.filter((s) => s.assessed).slice(0, 4);
  const date = new Date(report.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const skillsRows = assessed
    .map(
      (s, i) => `
      <text x="52" y="${238 + i * 26}" font-size="13" fill="#52525b" font-family="system-ui, sans-serif">${esc(s.skill)}</text>
      <rect x="180" y="${230 + i * 26}" width="240" height="8" rx="4" fill="#e4e4e7"/>
      <rect x="180" y="${230 + i * 26}" width="${Math.max(6, s.score * 2.4)}" height="8" rx="4" fill="${scoreColor(s.score)}"/>
      <text x="432" y="${238 + i * 26}" font-size="12" fill="${scoreColor(s.score)}" font-family="ui-monospace, monospace">${s.score}</text>`
    )
    .join("");
  const confColor = report.confidence === "HIGH" ? "#059669" : report.confidence === "MEDIUM" ? "#d97706" : "#e11d48";
  const ringColor = scoreColor(report.overall);
  const circumference = 2 * Math.PI * 44;
  const dash = circumference * (1 - Math.min(100, report.overall) / 100);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="380" viewBox="0 0 560 380">
  <rect width="560" height="380" rx="10" fill="#fcfbf7"/>
  <rect x="1" y="1" width="558" height="378" rx="9" fill="none" stroke="#d4d4d8" stroke-width="1.5"/>
  <text x="52" y="66" font-size="11" letter-spacing="2" fill="#5c7250" font-family="system-ui, sans-serif" font-weight="700">SKILLPROOF — VERIFIED SKILL PROFILE</text>
  <text x="52" y="104" font-size="26" fill="#33302b" font-family="system-ui, sans-serif" font-weight="700">${esc(report.candidateName)}</text>
  <text x="52" y="130" font-size="12" fill="#71717a" font-family="system-ui, sans-serif">Verified ${esc(date)} · overall evidence-weighted score</text>

  <g transform="translate(440,72)">
    <circle r="52" fill="none" stroke="#e4e4e7" stroke-width="8"/>
    <circle r="44" fill="none" stroke="#e4e4e7" stroke-width="8"/>
    <circle r="44" fill="none" stroke="${ringColor}" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${dash.toFixed(1)}" transform="rotate(-90)"/>
    <text y="8" text-anchor="middle" font-size="30" font-weight="700" fill="${ringColor}" font-family="ui-monospace, monospace">${report.overall}</text>
  </g>

  <g>
    <rect x="52" y="146" width="${Math.round((report.confidence.length + 11) * 6.8) + 44}" height="22" rx="11" fill="${confColor}22" stroke="${confColor}55"/>
    <circle cx="66" cy="157" r="4" fill="${confColor}"/>
    <text x="76" y="161" font-size="11" fill="${confColor}" font-family="system-ui, sans-serif" font-weight="600">${report.confidence} confidence</text>
  </g>

  ${skillsRows}
  <line x1="52" y1="348" x2="508" y2="348" stroke="#d4d4d8"/>
  <text x="52" y="366" font-size="10" fill="#71717a" font-family="system-ui, sans-serif">Verified via coding, debugging &amp; explanation evidence. ID: ${esc(report.assessmentId.slice(0, 12))}</text>
</svg>`;
}

function downloadBadge(report: AssessmentReport) {
  try {
    const svg = badgeSvg(report);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillproof-badge-${report.candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Verified badge downloaded (SVG)");
  } catch {
    toast.error("Could not generate badge");
  }
}

async function copySummary(report: AssessmentReport) {
  const assessed = report.skills.filter((s) => s.assessed);
  const lines = [
    `SkillProof — Verified Skill Profile`,
    `${report.candidateName} · overall ${report.overall}/100 (${report.confidence} confidence)`,
    `AI-assist risk: ${Math.round(report.aiRisk)}% (signal, not a verdict)`,
    ``,
    ...assessed.map((s) => `${s.skill}: ${s.score}/100 — ${s.evidence[0] ?? ""}`),
    ``,
    `Verified ${new Date(report.createdAt).toLocaleDateString()} · ID ${report.assessmentId.slice(0, 12)}`,
  ];
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Profile summary copied to clipboard");
  } catch {
    toast.error("Clipboard unavailable in this browser");
  }
}

// ─── Per-skill evidence detail (expanded inside the skill evidence table) ──

/**
 * The proof behind one skill's verified score — the same evidence /
 * improvements rendering the per-skill cards used to carry, moved into the
 * skill evidence table's expandable rows, plus the run's questions feeding
 * that score. Full per-question detail stays in the breakdown below.
 */
function SkillEvidenceDetail({ skill, questions }: { skill: SkillResult; questions: BreakdownItem[] }) {
  const evidence = skill.evidence ?? [];
  const improvements = skill.improvements ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
            <span aria-hidden className="inline-block h-2 w-2 bg-emerald-700 dark:bg-emerald-500" /> Evidence
          </p>
          {evidence.length === 0 ? (
            <p className="text-xs text-muted-foreground">No evidence lines recorded for this skill.</p>
          ) : (
            <ul className="space-y-1.5">
              {evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" /> {e}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
            <span aria-hidden className="inline-block h-2 w-2 bg-amber-700 dark:bg-amber-500" /> Areas to improve
          </p>
          {improvements.length === 0 ? (
            <p className="text-xs text-muted-foreground">No improvement notes for this run.</p>
          ) : (
            <ul className="space-y-1.5">
              {improvements.map((e, i) => (
                <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" /> {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {questions.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Questions feeding this score · {questions.length}
          </p>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-700">
            {questions.map((q) => (
              <li key={q.aqId} className="flex items-center gap-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">{q.questionTitle}</span>
                <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-400 sm:inline">
                  {q.category} · {q.difficulty}
                </span>
                <span
                  className="w-7 shrink-0 text-right font-mono tabular-nums"
                  style={q.score != null ? { color: scoreColor(q.score) } : undefined}
                >
                  {q.score != null ? Math.round(q.score) : "—"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            Full question-by-question detail — timing, tests, solving timeline — sits in the breakdown below.
          </p>
        </div>
      )}
    </div>
  );
}

function BreakdownDetail({ b }: { b: BreakdownItem }) {
  const fmt = (sec: number | null) => (sec == null ? "—" : `${Math.floor(sec / 60)}m ${sec % 60}s`);
  return (
    <div className="space-y-3 pl-1">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Fact label="Status" value={b.status} />
        <Fact
          label="Time"
          value={fmt(b.timeSpentSec)}
          icon={<Timer className="h-3 w-3" />}
        />
        <Fact label="Tests" value={b.testsTotal ? `${b.testsPassed}/${b.testsTotal}` : "—"} />
        <Fact label="Attempts" value={String(b.attempts)} />
        {b.complexity && <Fact label="Complexity" value={b.complexity} />}
        {b.quality != null && <Fact label="Quality" value={String(Math.round(b.quality))} />}
        {b.explainConsistency != null && <Fact label="Explanation" value={`${Math.round(b.explainConsistency)}%`} />}
        {b.aiRisk != null && <Fact label="AI risk" value={`${Math.round(b.aiRisk)}%`} />}
        {(b.hintsUsed ?? 0) > 0 && (
          <Fact
            label="Hints"
            value={`${b.hintsUsed} · −${b.hintPenalty ?? 4}%`}
            className="border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400"
          />
        )}
      </div>
      {b.eventSummary && b.eventSummary.length > 0 && (
        <div className="rounded-md border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Solving timeline</p>
          <div className="space-y-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
            {b.eventSummary.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, icon, className }: { label: string; value: string; icon?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border border-border bg-card px-2.5 py-2", className)}>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-mono tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
