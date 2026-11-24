"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, Printer, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { CertificatePayload } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Certificate of Verified Skill Proficiency ──────────────────────────────
// "Museum Matte": the credential as a gallery plaque — stark white stock,
// near-black ink, oversized display type, one hairline black frame, generous
// whitespace. No ornament, no watermark, no texture; the serrated sage
// seal is the single point of color. Flat ink on white — no shadows, no
// gradients, no glow. Identical in both app themes and on paper.

const PAPER = "#ffffff"; // stark white certificate stock
const INK = "#18181b";
const SAGE = "#5c7250"; // the single accent

/** Print-friendly score ink — same scale the report and PDF use. */
function scoreInk(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#a16207";
  if (score >= 40) return SAGE;
  return "#be123c";
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFormatter.format(d);
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function MonoLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500", className)}>{children}</p>
  );
}

/**
 * Cohort standing for the certified score — aggregate-only from /api/cohort
 * (no PII). Loads quietly; a missing cohort never blocks the credential.
 */
interface CohortData {
  size: number;
  median: number | null;
  best: number | null;
  rank: number | null;
  topPct: number | null;
}

function useCohortStanding(score: number): CohortData | null {
  const [cohort, setCohort] = useState<CohortData | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/cohort?score=${clampScore(score)}`)
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
  return cohort && cohort.size >= 2 && cohort.topPct != null && cohort.rank != null ? cohort : null;
}

/** Overall score dial — thin ink ring, ticked bezel, engraved number. */
function ScoreDial({ score }: { score: number }) {
  const v = clampScore(score);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const filled = (v / 100) * circ;
  const ink = scoreInk(v);
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Overall verified score ${v} out of 100`}
      shapeRendering="geometricPrecision"
      className="h-28 w-28"
    >
      {/* bezel ticks */}
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * 2 * Math.PI;
        const long = i % 5 === 0;
        return (
          <line
            key={i}
            x1={60 + 56.5 * Math.cos(a)}
            y1={60 + 56.5 * Math.sin(a)}
            x2={60 + (long ? 60 : 59) * Math.cos(a)}
            y2={60 + (long ? 60 : 59) * Math.sin(a)}
            stroke="#a1a1aa"
            strokeWidth={long ? 0.9 : 0.55}
          />
        );
      })}
      {/* track + fill */}
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e4e4e7" strokeWidth="7" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={ink}
        strokeWidth="7"
        strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 60 60)"
      />
      {/* inner hairline */}
      <circle cx="60" cy="60" r={r - 7.5} fill="none" stroke="#d4d4d8" strokeWidth="0.7" />
      <text x="60" y="57" textAnchor="middle" fontSize="31" fill={INK} className="font-display">
        {v}
      </text>
      <text
        x="60"
        y="76"
        textAnchor="middle"
        fontSize="7.5"
        letterSpacing="2.5"
        fill="#71717a"
        className="font-mono"
      >
        / 100
      </text>
    </svg>
  );
}

/** Engraved circular sage rosette — pure SVG so it prints crisp. */
function Seal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="SkillProof verification seal"
      shapeRendering="geometricPrecision"
      className={cn("certificate-seal", className)}
    >
      <defs>
        <path
          id="sp-seal-text-ring"
          fill="none"
          d="M50 50 m -36.5 0 a 36.5 36.5 0 1 1 73 0 a 36.5 36.5 0 1 1 -73 0"
        />
      </defs>
      {/* serrated outer edge */}
      <circle cx="50" cy="50" r="49" fill="none" stroke={SAGE} strokeWidth="2.4" strokeDasharray="1.4 2.2" />
      {/* two concentric circles bounding the legend band */}
      <circle cx="50" cy="50" r="45.5" fill="none" stroke={SAGE} strokeWidth="1.1" />
      <circle cx="50" cy="50" r="27.5" fill="none" stroke={SAGE} strokeWidth="1.1" />
      {/* circular legend around the ring */}
      <text className="font-mono" fontSize="6.5" letterSpacing="0.7" fill={SAGE}>
        <textPath href="#sp-seal-text-ring">VERIFIED · SKILLPROOF · VERIFIED · SKILLPROOF ·</textPath>
      </text>
      {/* solid center disc with cream monogram */}
      <circle cx="50" cy="50" r="21.5" fill={SAGE} />
      <text
        className="font-mono"
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13.5"
        fontWeight="600"
        letterSpacing="1"
        fill={PAPER}
      >
        SP
      </text>
    </svg>
  );
}

/** Verification QR — dark ink on transparent, framed like a plate mark. */
function VerifyQr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(url, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#1c1917", light: "#00000000" },
    })
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() => {
        /* leave the plate blank rather than break the sheet */
      });
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div className="inline-block border border-zinc-300 bg-white p-1.5">
      {svg ? (
        <div
          className="size-[86px] [&>svg]:h-full [&>svg]:w-full"
          // qrcode emits a plain <svg> — safe to mount inline
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="size-[86px] animate-pulse bg-zinc-200/60" aria-hidden />
      )}
    </div>
  );
}

/** Scale-ticked proficiency bar — engraved gauge rather than a slab of ink. */
function SkillBar({ name, score, level, assessed }: { name: string; score: number; level?: string | null; assessed: boolean }) {
  const v = clampScore(score);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "truncate font-mono text-[11px] font-medium uppercase tracking-[0.12em]",
              assessed ? "text-zinc-900" : "text-zinc-400"
            )}
          >
            {name}
          </span>
          {assessed && level ? (
            <span className="shrink-0 border border-zinc-300 bg-zinc-100 px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-600">
              {level}
            </span>
          ) : null}
          {!assessed ? (
            <span className="shrink-0 border border-dashed border-zinc-300 px-1.5 py-px font-mono text-[8px] uppercase tracking-[0.08em] text-zinc-500">
              claimed
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 font-display text-lg leading-none",
            assessed ? "text-zinc-900" : "text-zinc-400"
          )}
        >
          {assessed ? `${Math.round(v)}%` : "—"}
        </span>
      </div>
      {assessed ? (
        <div className="relative mt-2 h-[5px] w-full bg-zinc-200/80">
          <div className="h-full bg-zinc-900" style={{ width: `${v}%` }} />
          {/* engraved scale ticks — cream hairlines crossing the fill */}
          {[25, 50, 75].map((t) => (
            <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-white" style={{ left: `${t}%` }} />
          ))}
          {/* sage reading edge */}
          <span aria-hidden className="absolute inset-y-[-2.5px] w-px bg-[#5c7250]" style={{ left: `${v}%` }} />
        </div>
      ) : (
        <div className="mt-[9px] border-t border-dashed border-zinc-300" aria-hidden />
      )}
    </div>
  );
}

export function CertificateView({ data, onBack }: { data: CertificatePayload; onBack: () => void }) {
  // Strongest evidence first; ties keep assessed skills above claimed-only ones.
  const sortedSkills = [...data.skills].sort(
    (a, b) => b.score - a.score || (b.assessed ? 1 : 0) - (a.assessed ? 1 : 0)
  );
  const visibleSkills = sortedSkills.slice(0, 6);
  const hiddenCount = sortedSkills.length - visibleSkills.length;
  const candidateName = data.candidateName.trim() || "Unnamed Candidate";
  const completedLabel = formatDate(data.completedAt ?? data.issuedAt);
  const verifyUrl = typeof window === "undefined" ? `/?cert=${data.code}` : `${window.location.origin}/?cert=${data.code}`;
  const cohort = useCohortStanding(data.overallScore);

  async function copyVerifyLink() {
    const link = `${window.location.origin}/?cert=${data.code}`;
    // cascade: async clipboard → execCommand fallback → error (a clipboard
    // permission denial must still try the fallback before giving up)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = link;
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
    toast.success("Verify link copied to clipboard", { description: link });
  }

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  async function downloadPdf() {
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(data.code)}/pdf`);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-certificate-${data.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Certificate ${data.code} downloaded`);
    } catch {
      toast.error("Could not download the certificate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="certificate-page flex min-h-screen flex-col items-center bg-zinc-200/70 px-4 py-10 dark:bg-zinc-950">
      {/* control bar — screen only */}
      <div className="print:hidden mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 pb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10">
          <ArrowLeft />
          Back
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={copyVerifyLink}
          className="border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
        >
          <Copy className="size-3.5" />
          Copy verify link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadPdf}
          disabled={downloadingPdf}
          className="border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
        >
          <Download className="size-3.5" />
          {downloadingPdf ? "Preparing…" : "Download PDF"}
        </Button>
        <Button size="sm" onClick={() => window.print()} className="sp-press">
          <Printer className="size-3.5" />
          Print / Save PDF
        </Button>
      </div>

      {/* ── the sheet ─────────────────────────────────────────────────────── */}
      <article className="certificate-sheet relative flex w-full max-w-5xl flex-col overflow-hidden rounded-none border border-zinc-900 bg-white p-8 sm:p-10 md:aspect-[297/210] md:p-12">

        {/* letterhead band */}
        <header className="relative flex items-center justify-between gap-4 border-b border-zinc-900 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-[#18181b]">
              <ShieldCheck className="size-4 text-white" strokeWidth={2.2} />
            </span>
            <span>
              <span className="block font-display text-lg leading-tight text-zinc-950">SkillProof</span>
              <span className="block font-mono text-[8px] tracking-[0.16em] text-zinc-500">
                evidence over adjectives
              </span>
            </span>
          </div>
          <MonoLabel className="hidden text-right sm:block">
            Est. 2026 · proctored
            <br />
            skill registry
          </MonoLabel>
        </header>

        {/* body — statement column + registry ledger */}
        <div className="relative flex min-h-0 flex-1 flex-col pt-5 lg:flex-row lg:gap-8">
          {/* ── main column ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* certification statement */}
            <div className="text-center">
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-500 sm:text-[10px]">
                Certificate of Verified Skill Proficiency
              </p>
              <p className="mt-4 font-display text-base italic text-zinc-500 sm:text-lg">This is to certify that</p>
              <p className="mt-3 break-words px-2 font-display text-5xl font-medium leading-[1.05] tracking-tight text-zinc-950 sm:text-7xl">
                {candidateName}
              </p>
              {/* matte flourish — a single black hairline, nothing else */}
              <div aria-hidden className="mx-auto mt-5 h-px w-56 bg-zinc-900" />
              <p className="mx-auto mt-4 max-w-lg font-display text-[13.5px] leading-relaxed text-zinc-700 sm:text-[15px]">
                has completed a proctored, evidence-based skill verification and is hereby recorded as demonstrating
                the proficiencies below.
              </p>
            </div>

            {/* verified proficiencies */}
            <section className="my-auto mt-7 sm:mt-8">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="h-1.5 w-1.5 bg-[#5c7250]" />
                <MonoLabel className="text-[10px] tracking-[0.16em]">Verified Proficiencies</MonoLabel>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-x-9 gap-y-4 sm:grid-cols-2">
                {visibleSkills.map((s) => (
                  <SkillBar key={s.name} name={s.name} score={s.score} level={s.level} assessed={s.assessed} />
                ))}
              </div>
              {hiddenCount > 0 ? (
                <p className="mt-3.5 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  +{hiddenCount} more recorded in the registry
                </p>
              ) : null}
            </section>

            {/* signature + seal */}
            <div className="mt-auto flex flex-wrap items-end justify-between gap-6 pt-7">
              <div>
                <p className="font-display text-[26px] italic leading-none text-zinc-900">{data.issuedBy}</p>
                <div aria-hidden className="mt-2 h-px w-52 max-w-full bg-zinc-900" />
                <MonoLabel className="mt-1.5">Issuing recruiter</MonoLabel>
              </div>
              <Seal className="h-[74px] w-[74px] shrink-0 sm:h-[88px] sm:w-[88px]" />
            </div>
          </div>

          {/* ── registry ledger ── */}
          <aside className="mt-7 flex shrink-0 flex-col border-t border-zinc-200 pt-5 lg:mt-0 lg:w-[264px] lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="h-1.5 w-1.5 bg-[#5c7250]" />
              <MonoLabel className="text-[10px] tracking-[0.16em]">Registry Ledger</MonoLabel>
            </div>

            {/* overall dial + confidence */}
            <div className="mt-3 flex items-center justify-between gap-4 lg:mt-4 lg:flex-col lg:justify-start">
              <ScoreDial score={data.overallScore} />
              <div className="lg:mt-2.5 lg:text-center">
                <span
                  className="inline-block border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em]"
                  style={{ borderColor: scoreInk(data.overallScore), color: scoreInk(data.overallScore) }}
                >
                  confidence · {data.confidence}
                </span>
              </div>
            </div>

            <div aria-hidden className="my-3.5 hidden h-px w-full bg-zinc-200 lg:block" />

            {/* scan-to-verify plate */}
            <div className="flex items-center gap-4 lg:flex-col lg:gap-2 lg:text-center">
              <VerifyQr url={verifyUrl} />
              <div>
                <MonoLabel className="text-[9px]">Scan to verify</MonoLabel>
                <p className="mt-1 font-mono text-[14px] font-medium tracking-[0.12em] text-zinc-950">
                  {data.code}
                </p>
                <p className="mt-0.5 break-all font-mono text-[8px] leading-relaxed text-zinc-500">
                  or open /?cert={data.code}
                </p>
              </div>
            </div>

            <div aria-hidden className="my-3.5 hidden h-px w-full bg-zinc-200 lg:mt-auto lg:block" />

            {/* register rows — dotted leaders, like a ledger page.
                "Cohort" is the live standing; "At issue" is the snapshot frozen
                onto the certificate when it was minted — the credential keeps
                its point-in-time evidence even as the cohort grows. */}
            {(() => {
              const frozen = data.cohort ?? null;
              const fmtTop = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
              const frozenText = frozen ? `top ${fmtTop(frozen.topPct)}% · #${frozen.rank} of ${frozen.size}` : null;
              const liveText = cohort
                ? `top ${Number.isInteger(cohort.topPct!) ? cohort.topPct : cohort.topPct!.toFixed(1)}% · #${cohort.rank} of ${cohort.size}`
                : null;
              const rows: Array<[string, string, boolean]> = [
                ["Issued on", formatDate(data.issuedAt), false],
                ["Completed", completedLabel, false],
                ["Cohort", liveText ?? frozenText ?? "—", !!frozen && !liveText],
                ...(frozenText && liveText ? ([["At issue", frozenText, true]] as Array<[string, string, boolean]>) : []),
                // the internal run id is only present on owner/recruiter views —
                // public verification carries the code alone
                ...(data.assessmentId
                  ? ([["Assessment", data.assessmentId.slice(0, 8).toUpperCase(), false]] as Array<[string, string, boolean]>)
                  : []),
              ];
              return (
                <dl className="space-y-2 lg:pt-0">
                  {rows.map(([label, value, isSnapshot]) => (
                    <div key={label} className="flex items-baseline">
                      <dt>
                        <MonoLabel className="text-[8px]">{label}</MonoLabel>
                      </dt>
                      <span aria-hidden className="mx-2 flex-1 border-b border-dotted border-zinc-400" />
                      <dd
                        className={cn(
                          "font-mono text-[10.5px] tabular-nums",
                          isSnapshot ? "text-zinc-500" : "text-zinc-800"
                        )}
                        title={isSnapshot ? "Standing recorded when this certificate was issued" : undefined}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              );
            })()}
          </aside>
        </div>
      </article>

      {/* caption — screen only */}
      <p className="print:hidden mx-auto mt-6 max-w-xl text-center font-mono text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        This certificate is a machine-verifiable record of a proctored assessment — anyone can verify it with the
        code above.
      </p>
    </div>
  );
}
