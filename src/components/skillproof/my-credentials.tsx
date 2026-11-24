"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Award, Copy, Download, Eye, GraduationCap, History, Loader2, QrCode, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ConfidenceBadge, scoreColor } from "@/components/skillproof/shared";
import type { CertificatePayload } from "@/lib/types";

/** One completed verification run in the candidate's own ledger. */
interface AttemptRow {
  assessmentId: string;
  completedAt: string | null;
  overall: number | null;
  confidence: string | null;
  aiRisk: number | null;
  topSkills: Array<{ name: string; score: number }>;
  questions: number;
  answered: number;
  timeSpentMin: number | null;
  certificateCode: string | null;
  /** Live cohort standing for this run's score (null while cohort < 2 runs) */
  cohort: { rank: number; size: number; topPct: number } | null;
}

/** Engraved corner ticks — the registry-sheet framing language, miniaturized. */
function CornerTicks() {
  return (
    <>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-zinc-400 dark:border-zinc-600" />
      <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-zinc-400 dark:border-zinc-600" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-zinc-400 dark:border-zinc-600" />
      <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-[#5c7250]/70" />
    </>
  );
}

/** Thin ink gauge — hairline track, ink fill, sage reading edge. */
function InkGauge({ score }: { score: number }) {
  return (
    <span className="relative inline-block h-[3px] w-10 shrink-0 bg-zinc-200 dark:bg-zinc-800 align-middle" aria-hidden>
      <span
        className="absolute inset-y-0 left-0 bg-zinc-800"
        style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
      />
      <span
        className="absolute inset-y-[-1px] w-[1.5px] bg-[#5c7250]"
        style={{ left: `calc(${Math.max(4, Math.min(100, score))}% - 1px)` }}
      />
    </span>
  );
}

/**
 * Wallet share dialog — the QR plate + copyable verify link for one
 * certificate, framed like the verify sheet's plate mark. Anyone with the
 * link or the code can pull the public evidence report.
 */
function ShareDialog({ cert, onClose }: { cert: CertificatePayload | null; onClose: () => void }) {
  /** QR svg tagged with the cert code it was generated for — rendered only while it matches. */
  const [qr, setQr] = useState<{ code: string; svg: string } | null>(null);
  const url = cert ? `${window.location.origin}/?cert=${cert.code}` : "";

  useEffect(() => {
    if (!cert) return;
    let alive = true;
    const code = cert.code;
    QRCode.toString(`${window.location.origin}/?cert=${code}`, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1917", light: "#00000000" },
    })
      .then((s) => {
        if (alive) setQr({ code, svg: s });
      })
      .catch(() => {
        /* leave the plate blank rather than break the dialog */
      });
    return () => {
      alive = false;
    };
  }, [cert]);

  const copy = async () => {
    // cascade: async clipboard → execCommand fallback → error (headless tests
    // deny clipboard permission, so a rejection must still try the fallback)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand copy failed");
      } catch {
        toast.error("Could not copy the verify link");
        return;
      }
    }
    toast.success("Verify link copied to clipboard", { description: url });
  };

  return (
    <Dialog open={!!cert} onOpenChange={(o) => !o && onClose()}>
      {cert && (
        <DialogContent className="max-w-sm gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-zinc-900 dark:text-zinc-100">
              <QrCode className="h-4 w-4 text-zinc-700 dark:text-zinc-300" aria-hidden />
              Share certificate {cert.code}
            </DialogTitle>
            <DialogDescription>
              Anyone with this link or code can verify the credential and read its evidence report — no account
              needed.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <div className="inline-block shrink-0 border border-zinc-300 dark:border-zinc-700 bg-white p-1.5">
              {qr && qr.code === cert.code ? (
                <div
                  className="size-28 [&>svg]:h-full [&>svg]:w-full"
                  // qrcode emits a plain <svg> — safe to mount inline
                  dangerouslySetInnerHTML={{ __html: qr.svg }}
                />
              ) : (
                <div className="size-28 animate-pulse bg-zinc-200/60 dark:bg-zinc-800/60" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">Verification code</p>
              <p className="border-b border-dotted border-zinc-400 dark:border-zinc-600 pb-px font-mono text-sm font-semibold tracking-[0.08em] text-zinc-800 dark:text-zinc-300">
                {cert.code}
              </p>
              <p className="break-all font-mono text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-400">{url}</p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void copy()}
            className="h-9 bg-zinc-950 dark:bg-zinc-100 font-mono text-xs text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy verify link
          </Button>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * Score progression sparkline — chronological overall scores (oldest → newest,
 * left → right) as an ink polyline on a hairline track, sage tip on the
 * latest run, dotted 50-midline for reference. Pure SVG, no chart dependency.
 */
function ScoreSparkline({ scores }: { scores: number[] }) {
  const W = 150;
  const H = 30;
  const PAD = 3;
  if (scores.length === 0) return null;
  const x = (i: number) =>
    scores.length === 1 ? W / 2 : PAD + (i / (scores.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2);
  const points = scores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = scores[scores.length - 1];
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="block"
      role="img"
      aria-label={`Score progression across ${scores.length} runs, latest ${last} of 100`}
    >
      {/* 50-midline, dotted for reference */}
      <line x1={PAD} x2={W - PAD} y1={y(50)} y2={y(50)} stroke="var(--sp-grid-ink)" strokeWidth={1} strokeDasharray="2 3" />
      {/* ink polyline */}
      {scores.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="#3f3f46"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {/* sage tip on the latest run */}
      <circle cx={x(scores.length - 1)} cy={y(last)} r={2.5} fill="#5c7250" />
      {scores.length > 1 && <circle cx={x(0)} cy={y(scores[0])} r={1.5} fill="#a1a1aa" />}
    </svg>
  );
}

/**
 * Candidate home strip — "My credentials". After signing in, a candidate sees
 * every certificate a recruiter has issued to them (matched by account email),
 * each with a public verify code and a one-click PDF download — plus the
 * verification ledger: every completed run on record, certified or not, with
 * one-click re-open of the full evidence report.
 */
export function MyCredentials() {
  const setCertificate = useStore((s) => s.setCertificate);
  const setReport = useStore((s) => s.setReport);
  const setView = useStore((s) => s.setView);
  const setCandidateStep = useStore((s) => s.setCandidateStep);
  const [certs, setCerts] = useState<CertificatePayload[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  // share dialog — QR plate + copyable verify link for one certificate
  const [shareCert, setShareCert] = useState<CertificatePayload | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/my/certificates")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => alive && setCerts(Array.isArray(data.certificates) ? data.certificates : []))
      .catch(() => alive && setCerts([]));
    fetch("/api/my/attempts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => alive && setAttempts(Array.isArray(data.attempts) ? data.attempts : []))
      .catch(() => alive && setAttempts([]));
    return () => {
      alive = false;
    };
  }, []);

  const download = async (code: string) => {
    setDownloading(code);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(code)}/pdf`);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-certificate-${code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Certificate ${code} downloaded`);
    } catch {
      toast.error("Could not download the certificate — try again");
    } finally {
      setDownloading(null);
    }
  };

  const open = (c: CertificatePayload) => {
    setCertificate(c); // store navigates to the certificate view; Back returns here
  };

  /** Re-open the full evidence report of a past run (results step refetches if needed). */
  const openReport = async (assessmentId: string) => {
    if (opening) return;
    setOpening(assessmentId);
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(assessmentId)}`);
      const data = await res.json();
      if (!res.ok || !data?.reportId) throw new Error(data?.error || "Report not found");
      setReport(data, assessmentId);
      setView("candidate");
      setCandidateStep("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Could not open that report — try again");
    } finally {
      setOpening(null);
    }
  };

  const loading = certs === null || attempts === null;

  if (loading) {
    return (
      <div className="border-b border-zinc-300 dark:border-zinc-700 bg-card print:hidden" aria-label="Loading your credentials">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-3 h-12 animate-pulse rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  const certByAssessment = new Map(certs.map((c) => [c.assessmentId, c]));
  const bestScore = attempts.reduce<number | null>(
    (best, a) => (a.overall != null && (best == null || a.overall > best) ? a.overall : best),
    null
  );

  // chronological scored runs for the progression sparkline (ledger is newest-first)
  const scoredChrono = attempts
    .filter((a) => a.overall != null)
    .map((a) => a.overall as number)
    .reverse();
  const progression =
    scoredChrono.length >= 2
      ? { first: scoredChrono[0], last: scoredChrono[scoredChrono.length - 1], delta: scoredChrono[scoredChrono.length - 1] - scoredChrono[0] }
      : null;

  return (
    <section aria-label="My credentials and verification history" className="border-b border-zinc-300 dark:border-zinc-700 bg-card print:hidden">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        {/* ── wallet header ─────────────────────────────────────────────── */}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 bg-[#5c7250]" aria-hidden />
            <Award className="h-3.5 w-3.5 text-[#5c7250] dark:text-[#a9c29b]" aria-hidden />
            My credentials
          </span>
          <span className="text-zinc-300" aria-hidden>
            ·
          </span>
          <span className="tabular-nums">
            {certs.length} certificate{certs.length === 1 ? "" : "s"}
          </span>
          {bestScore != null && (
            <>
              <span className="text-zinc-300" aria-hidden>
                ·
              </span>
              <span className="tabular-nums">
                best <span style={{ color: scoreColor(bestScore) }}>{bestScore}</span>/100
              </span>
            </>
          )}
        </p>

        {certs.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
            No certificates yet — when a recruiter issues one for your completed verification, it appears here
            with a downloadable PDF.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {certs.map((c) => (
              <li
                key={c.code}
                className="group relative flex flex-wrap items-center gap-x-4 gap-y-2 border border-zinc-300 dark:border-zinc-700 bg-background px-3.5 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-all hover:border-zinc-400 dark:hover:border-zinc-500 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
              >
                <CornerTicks />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-[#faf7f0] dark:bg-zinc-900">
                  <GraduationCap className="h-4 w-4 text-zinc-700 dark:text-zinc-300" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[15px] leading-tight text-zinc-950 dark:text-zinc-100">
                    Verified proficiency certificate
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                    <span className="border-b border-dotted border-zinc-400 dark:border-zinc-600 pb-px text-zinc-700 dark:text-zinc-300">{c.code}</span>
                    <span aria-hidden>·</span>
                    <span>
                      issued{" "}
                      {new Date(c.issuedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      by {c.issuedBy}
                    </span>
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="font-serif text-xl font-semibold tabular-nums"
                    style={{ color: scoreColor(c.overallScore) }}
                    title="Overall verified score"
                  >
                    {c.overallScore}
                    <span className="ml-0.5 font-mono text-[10px] font-normal text-zinc-400 dark:text-zinc-400">/100</span>
                  </span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-400">
                    {c.skills
                      .filter((s) => s.assessed)
                      .slice(0, 3)
                      .map((s) => `${s.name} ${Math.round(s.score)}`)
                      .join(" · ")}
                    {c.skills.filter((s) => s.assessed).length > 3
                      ? ` · +${c.skills.filter((s) => s.assessed).length - 3}`
                      : ""}
                  </span>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => open(c)}
                    className="h-8 px-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                    aria-label={`View certificate ${c.code}`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShareCert(c)}
                    className="h-8 px-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                    aria-label={`Share certificate ${c.code} — QR and verify link`}
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    Share
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => download(c.code)}
                    disabled={downloading === c.code}
                    className={cn("sp-press h-8 px-3 font-mono text-[11px]")}
                    aria-label={`Download certificate ${c.code} as PDF`}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading === c.code ? "Preparing…" : "Download PDF"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* ── verification ledger ───────────────────────────────────────── */}
        <div className="mt-4 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-3" data-testid="verification-ledger">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
            <History className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" aria-hidden />
            Verification ledger · {attempts.length} run{attempts.length === 1 ? "" : "s"} on record
          </p>

          {attempts.length === 0 ? (
            <p className="mt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
              No completed verifications yet — run one from the flow below and every attempt lands in this
              ledger, certified or not.
            </p>
          ) : (
            <>
              {/* progression strip — sparkline + first→last delta over scored runs */}
              {scoredChrono.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border border-zinc-200 dark:border-zinc-700 bg-[#faf7f0]/60 dark:bg-zinc-800/60 px-3 py-2">
                  <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                    <TrendingUp className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" aria-hidden />
                    Progression
                  </p>
                  <ScoreSparkline scores={scoredChrono} />
                  {progression ? (
                    <p className="flex items-center gap-1.5 font-mono text-[10.5px] tabular-nums text-zinc-500 dark:text-zinc-400">
                      <span style={{ color: scoreColor(progression.first) }}>{progression.first}</span>
                      <span aria-hidden className="text-zinc-300">→</span>
                      <span style={{ color: scoreColor(progression.last) }}>{progression.last}</span>
                      <span
                        className={cn(
                          "ml-1 border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.1em]",
                          progression.delta > 0
                            ? "border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400"
                            : progression.delta < 0
                              ? "border-rose-600/30 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400"
                              : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400"
                        )}
                      >
                        {progression.delta > 0 ? "+" : ""}{progression.delta} since first run
                      </span>
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                      single scored run on record
                    </p>
                  )}
                </div>
              )}
              <ol className="mt-2.5 space-y-1.5">
              {attempts.map((a, i) => {
                const cert = a.certificateCode ? certByAssessment.get(a.assessmentId) : undefined;
                return (
                  <li
                    key={a.assessmentId}
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border border-zinc-200 dark:border-zinc-700 bg-background/60 px-3 py-2 transition-colors hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-background"
                  >
                    {/* folio square */}
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center border border-zinc-300 dark:border-zinc-700 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400"
                      aria-hidden
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    <div className="min-w-0 basis-40 grow">
                      <p className="font-mono text-[11px] tracking-[0.06em] text-zinc-700 dark:text-zinc-300">
                        {a.completedAt
                          ? new Date(a.completedAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-400">
                        {a.questions > 0
                          ? `${a.answered}/${a.questions} answered${a.timeSpentMin != null ? ` · ${a.timeSpentMin} min` : ""}`
                          : "archived run"}
                      </p>
                    </div>

                    <div className="flex min-w-0 items-center gap-2.5">
                      {a.overall != null ? (
                        <span
                          className="font-serif text-lg font-semibold tabular-nums"
                          style={{ color: scoreColor(a.overall) }}
                          title="Overall verified score"
                        >
                          {a.overall}
                          <span className="ml-0.5 font-mono text-[9px] font-normal text-zinc-400 dark:text-zinc-400">/100</span>
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                          unscored
                        </span>
                      )}
                      <ConfidenceBadge level={a.confidence} className="shrink-0" />
                      {a.cohort && a.overall != null && (
                        <span
                          className="hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-1.5 py-px font-mono text-[9.5px] tabular-nums text-zinc-500 dark:text-zinc-400 md:inline"
                          title={`Rank #${a.cohort.rank} of ${a.cohort.size} verified runs`}
                        >
                          top {Number.isInteger(a.cohort.topPct) ? a.cohort.topPct : a.cohort.topPct.toFixed(1)}%
                        </span>
                      )}
                    </div>

                    {a.topSkills.length > 0 && (
                      <p
                        className="hidden min-w-0 flex-1 items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-400 sm:flex"
                        title={a.topSkills.map((s) => `${s.name} ${s.score}`).join(" · ")}
                      >
                        {a.topSkills.map((s) => (
                          <span key={s.name} className="flex items-center gap-1">
                            {s.name}
                            <InkGauge score={s.score} />
                          </span>
                        ))}
                      </p>
                    )}

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      {cert ? (
                        <button
                          type="button"
                          onClick={() => open(cert)}
                          className="border border-emerald-700/30 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-400 transition-colors hover:bg-emerald-100"
                          aria-label={`Open certificate ${a.certificateCode}`}
                        >
                          certified · {a.certificateCode}
                        </button>
                      ) : (
                        <span className="border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                          on file
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openReport(a.assessmentId)}
                        disabled={opening === a.assessmentId}
                        className="h-7 gap-1.5 px-2 font-mono text-[10.5px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                        aria-label={`View the evidence report for the run completed ${
                          a.completedAt ? new Date(a.completedAt).toLocaleDateString("en-IN") : "recently"
                        }`}
                      >
                        {opening === a.assessmentId ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : (
                          <Eye className="h-3 w-3" aria-hidden />
                        )}
                        Report
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
            </>
          )}
        </div>
      </div>

      {/* share dialog — QR plate + verify link for the selected certificate */}
      <ShareDialog cert={shareCert} onClose={() => setShareCert(null)} />
    </section>
  );
}
