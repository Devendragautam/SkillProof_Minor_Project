"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Crosshair,
  Gauge,
  Loader2,
  MessagesSquare,
  Radar,
  Route,
  Scale,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useCountUp } from "@/components/skillproof/shared";
import { toast } from "sonner";

const PIPELINE: { label: string; note: string; phase: string }[] = [
  { label: "Resume intake", note: "PDF parsed; claims extracted verbatim", phase: "Intake" },
  { label: "Claimed skill profile", note: "what the candidate says they know", phase: "Intake" },
  { label: "Assessment built from it", note: "questions generated against those exact claims", phase: "Intake" },
  { label: "Live coding", note: "sandboxed execution, real tests, four languages", phase: "Evidence" },
  { label: "Behavior capture", note: "timing, revisions, dead ends — kept as evidence", phase: "Evidence" },
  { label: "Explain-the-code", note: "candidates defend the solution they submitted", phase: "Evidence" },
  { label: "Consistency & AI-assist signals", note: "paste bursts and shallow explanations get flagged", phase: "Evidence" },
  { label: "Verified profile", note: "a verdict with confidence, not a bare score", phase: "Verdict" },
];

const COMPARISON: { dim: string; trad: string; sp: string }[] = [
  { dim: "What's measured", trad: "Keywords and self-description", sp: "Demonstrated process and result" },
  { dim: "Test selection", trad: "The same bank for everyone", sp: "Generated from the candidate's own claims" },
  { dim: "Code review", trad: "Final submission only", sp: "Every draft, run and dead end preserved" },
  { dim: "The score", trad: "A number without context", sp: "A verdict with confidence and risk signals" },
];

const MEASURES: { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Generated, not generic",
    body: "The question set is built from the exact skills the résumé claims. Nobody gets a boilerplate quiz they could have memorized.",
    icon: Crosshair,
  },
  {
    title: "Process, not just product",
    body: "Time-on-task, error and fix cycles, how code evolved between runs. The route to the answer is evidence too.",
    icon: Route,
  },
  {
    title: "Difficulty that adapts",
    body: "Solved quickly? It steps up. Struggling? It diagnoses at the right level instead of wasting both of you.",
    icon: Gauge,
  },
  {
    title: "Explain your own code",
    body: "After submission, candidates walk through their solution. A copied answer survives a compiler; it doesn't survive this.",
    icon: MessagesSquare,
  },
  {
    title: "AI-assist signals",
    body: "Paste bursts, uniform timing, and explanations that don't match the code raise risk flags — visible, never hidden.",
    icon: Radar,
  },
  {
    title: "Confidence-aware scoring",
    body: "Every score ships with an evidence confidence level, so a 7.1 backed by thirty minutes of work reads differently from a 7.1 that isn't.",
    icon: Scale,
  },
];

/** Fallback figures — replaced by live /api/stats counts as soon as they land. */
const STATS_BASE: { v: number; l: string; sub: string; live?: "questions" | "skills" }[] = [
  { v: 12, l: "assessable skills", sub: "mapped from résumé claims", live: "skills" },
  { v: 97, l: "questions in the bank", sub: "coding · debugging · mcq · sql", live: "questions" },
  { v: 8, l: "evidence signals", sub: "behavior, consistency, risk" },
  { v: 0, l: "installs for candidates", sub: "browser-only, by design" },
];

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </p>
  );
}

/** Primary ink CTA — arrow nudges forward on hover. */
function PrimaryCta({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button onClick={onClick} className="group sp-press h-11 px-6 text-sm font-medium">
      {children}
      <ArrowRight
        aria-hidden
        className="ml-2 h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-x-1"
      />
    </Button>
  );
}

/** Secondary editorial link — sage hairline sweeps the underline on hover. */
function TextLink({ onClick, children, href }: { onClick?: () => void; children: React.ReactNode; href?: string }) {
  if (href) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          onClick?.();
        }}
        className="group relative inline-flex h-11 items-center px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 underline decoration-zinc-300 dark:decoration-zinc-600 decoration-1 underline-offset-[6px] transition-colors hover:text-zinc-950 dark:hover:text-zinc-100"
      >
        {children}
        <ArrowUpRight
          aria-hidden
          className="ml-1.5 h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
        <span
          aria-hidden
          className="absolute inset-x-1 bottom-[5px] h-px origin-left scale-x-0 bg-[#5c7250] transition-transform duration-300 ease-out group-hover:scale-x-100"
        />
      </a>
    );
  }
  return (
    <button
      onClick={onClick}
      className="group relative inline-flex h-11 items-center px-1 text-sm font-medium text-zinc-700 dark:text-zinc-300 underline decoration-zinc-300 dark:decoration-zinc-600 decoration-1 underline-offset-[6px] transition-colors hover:text-zinc-950 dark:hover:text-zinc-100"
    >
      {children}
      <ArrowUpRight
        aria-hidden
        className="ml-1.5 h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
      />
      <span
        aria-hidden
        className="absolute inset-x-1 bottom-[5px] h-px origin-left scale-x-0 bg-[#5c7250] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
    </button>
  );
}

/** In-page smooth scroll that respects prefers-reduced-motion. */
function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/**
 * Realistic product preview — the recruiter workspace exactly as a completed
 * verification lands in it: score, confidence, claimed-vs-verified skill
 * evidence, consistency signals and assessment progress. Rendered as an app
 * window (title bar → sidebar → working panel → status bar) so the hero shows
 * the product, not artwork. Static data; purely presentational.
 */
function ProductPreview() {
  const skills = [
    { k: "C++", claim: "Advanced", verified: "Intermediate", score: 72, conf: "High", tone: "ok" },
    { k: "SQL", claim: "Intermediate", verified: "Intermediate", score: 81, conf: "High", tone: "ok" },
    { k: "System design", claim: "Advanced", verified: "Basic", score: 48, conf: "Moderate", tone: "gap" },
  ] as const;
  const nav = ["Overview", "Candidates", "Question bank", "Live monitor", "Certificates"];
  return (
    <figure
      className="relative border border-zinc-300 dark:border-zinc-700 bg-card"
      aria-label="Preview of the SkillProof recruiter workspace showing a verified candidate profile"
    >
      {/* app title bar */}
      <figcaption className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-4 w-4 items-center justify-center bg-zinc-950 dark:bg-zinc-100"
          >
            <ShieldCheck className="h-2.5 w-2.5 text-[#faf7f0] dark:text-[#211d16]" strokeWidth={2} />
          </span>
          SkillProof · Recruiter
        </span>
        <span className="hidden sm:inline">Verified profile · SP-4471</span>
      </figcaption>

      <div className="flex">
        {/* workspace sidebar — the navigation the product actually ships */}
        <nav aria-hidden className="hidden w-[8.5rem] shrink-0 flex-col gap-px border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/40 py-2.5 md:flex">
          {nav.map((item, i) => (
            <span
              key={item}
              className={
                i === 1
                  ? "border-l-2 border-[#5c7250] bg-zinc-100 dark:bg-zinc-800 py-1.5 pl-2.5 pr-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-900 dark:text-zinc-100"
                  : "border-l-2 border-transparent py-1.5 pl-2.5 pr-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-400"
              }
            >
              {item}
            </span>
          ))}
          <span className="mt-auto px-2.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-300 dark:text-zinc-600">
            proctor stream · live
          </span>
        </nav>

        {/* working panel */}
        <div className="min-w-0 flex-1 px-4 py-4">
          {/* candidate head — score first, like the real dossier */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">Neha Verma</p>
              <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                Backend engineer · assessed Oct 2
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-[2.1rem] leading-none tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 tabular-nums">
                88
              </p>
              <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
                verification score
              </p>
            </div>
          </div>

          {/* status chips — confidence, coverage, risk */}
          <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em]">
            <span className="border border-emerald-700/25 bg-emerald-700/[0.07] dark:border-emerald-500/40 dark:bg-emerald-950/40 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-400">
              Confidence · high
            </span>
            <span className="border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-300">
              3/4 skills verified
            </span>
            <span className="border border-emerald-700/25 bg-emerald-700/[0.07] dark:border-emerald-500/40 dark:bg-emerald-950/40 px-1.5 py-0.5 text-emerald-800 dark:text-emerald-400">
              AI-assist risk · low
            </span>
          </div>

          {/* skill evidence — claimed vs verified, the central promise */}
          <div className="mt-3.5 border-t border-zinc-200 dark:border-zinc-700 pt-2.5">
            <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-400">
              Skill evidence — claimed vs verified
            </p>
            <ul className="mt-1.5 space-y-2">
              {skills.map((s) => (
                <li key={s.k}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="min-w-0 truncate text-[12px] font-medium text-zinc-800 dark:text-zinc-300">{s.k}</p>
                    <p className="shrink-0 font-mono text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {s.score}
                      <span
                        className={
                          s.conf === "High"
                            ? "ml-1.5 text-[8.5px] font-medium uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400"
                            : "ml-1.5 text-[8.5px] font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400"
                        }
                      >
                        {s.conf}
                      </span>
                    </p>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-400">
                      {s.claim} → {s.verified}
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                      <span
                        className={`block h-full ${s.tone === "ok" ? "bg-zinc-800 dark:bg-zinc-300" : "bg-amber-700/70"}`}
                        style={{ width: `${s.score}%` }}
                      />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* signals + progress — the two live feeds a recruiter acts on */}
          <div className="mt-3.5 grid gap-3 border-t border-zinc-200 dark:border-zinc-700 pt-3 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-400">
                Consistency signals
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                Explain-code consistent · steady revision cycles ·{' '}
                <span className="text-zinc-900 dark:text-zinc-100">1 paste burst — reviewed</span>
              </p>
            </div>
            <div>
              <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-400">
                Assessment progress
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                <span className="tabular-nums">18/22 answered</span>
                <span className="shrink-0 text-emerald-700 dark:text-emerald-400">autosaved</span>
              </div>
              <span className="mt-1.5 block h-1.5 bg-zinc-200 dark:bg-zinc-800">
                <span className="block h-full w-[82%] bg-[#5c7250]" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* status bar */}
      <p className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        Every score drillable to its evidence · signals require review, never auto-verdicts
      </p>
    </figure>
  );
}

/** One ledger cell of the stats band — count-up numeral + sage hairline reveal. */
function StatCell({
  value,
  label,
  sub,
  className = "",
}: {
  value: number;
  label: string;
  sub: string;
  className?: string;
}) {
  const n = useCountUp(value);
  return (
    <div className={`group relative px-5 py-8 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60 sm:px-6 ${className}`}>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-[#5c7250] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
      <p className="font-display text-4xl leading-none tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 tabular-nums sm:text-5xl">
        {n}
      </p>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-[10px] tracking-[0.02em] text-zinc-400 dark:text-zinc-400">{sub}</p>
    </div>
  );
}

export function Landing({
  onStart,
  onRecruiter: _onRecruiter,
  onSignIn,
}: {
  onStart: () => void;
  onRecruiter: () => void;
  onSignIn?: () => void;
}) {
  // Real figures from the live question bank — the counters visibly tick up
  // when the value arrives, which reads as "this product is alive".
  const [live, setLive] = useState<{ questions: number | null; skills: number | null }>({
    questions: null,
    skills: null,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && typeof d.questions === "number" && typeof d.skills === "number") {
          setLive({ questions: d.questions, skills: d.skills });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const STATS = STATS_BASE.map((s) =>
    s.live && live[s.live] != null ? { ...s, v: live[s.live] as number } : s,
  );

  return (
    <div className="sp-grid-bg">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-24">
        <div className="grid items-end gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="relative lg:col-span-7">
            {/* oversized print ornament — a section mark, like the §1/§2/§3 labels below */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-12 right-0 -z-10 hidden select-none font-display text-[13rem] italic leading-none text-zinc-200/70 dark:text-zinc-800 lg:block"
            >
              §
            </span>

            <motion.h1
              {...fadeUp}
              className="font-display text-[2.6rem] leading-[1.05] tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 sm:text-6xl"
            >
              Verify what candidates
              <br />
              <span className="italic">
                can <span className="text-[#5c7250] dark:text-[#a9c29b]">actually</span> do.
              </span>
            </motion.h1>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="mt-6 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground sm:text-base"
            >
              SkillProof turns resume claims into practical evidence through adaptive assessment,
              live coding, behavioral signals and explain-the-code verification. What reaches you
              is evidence — not adjectives.
            </motion.p>
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.15 }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3"
            >
              <PrimaryCta onClick={onStart}>Start verification</PrimaryCta>
              <TextLink href="#how-it-works" onClick={() => scrollToId("how-it-works")}>
                See how it works
              </TextLink>
            </motion.div>
          </div>

          {/* the product itself — recruiter workspace preview, on a second sheet */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.2 }}
            className="relative lg:col-span-5"
          >
            {/* offset sheet behind — layered paper */}
            <div
              aria-hidden
              className="absolute inset-0 translate-x-2 translate-y-2 border border-zinc-200 dark:border-zinc-700 bg-[#f2efe8]"
            />
            <ProductPreview />
          </motion.div>
        </div>
      </section>

      {/* ── Stats band — engraved ledger ─────────────────────────────────── */}
      <section className="border-y border-zinc-300 dark:border-zinc-700 bg-card">
        <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4" aria-label="Product figures">
          {STATS.map((s, i) => (
            <StatCell
              key={s.l}
              value={s.v}
              label={s.l}
              sub={s.sub}
              className={
                i === 1
                  ? "border-l border-zinc-200 dark:border-zinc-700"
                  : i === 2
                    ? "border-t border-zinc-200 dark:border-zinc-700 sm:border-l sm:border-t-0"
                    : i === 3
                      ? "border-l border-t border-zinc-200 dark:border-zinc-700 sm:border-t-0"
                      : ""
              }
            />
          ))}
        </div>
      </section>

      {/* ── §1 Pipeline ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6 sm:py-24">
        <motion.div {...fadeUp} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-300 dark:border-zinc-700 pb-4">
          <h2 className="font-display text-3xl text-zinc-900 dark:text-zinc-100 sm:text-4xl">The verification pipeline</h2>
          <MicroLabel>§1 — eight stages, one chain of evidence</MicroLabel>
        </motion.div>
        <div className="mt-2 grid md:grid-cols-2 md:gap-x-12">
          {PIPELINE.map((step, i) => (
            <motion.div
              key={step.label}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.04 }}
              className="group -mx-2 flex items-baseline gap-4 rounded-sm border-b border-zinc-200 dark:border-zinc-700 px-2 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
            >
              <span className="font-mono text-xs font-semibold text-[#5c7250] dark:text-[#a9c29b]">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{step.label}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{step.note}</p>
              </div>
              <span
                aria-hidden
                className="ml-auto hidden self-center shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-300 dark:text-zinc-600 transition-colors duration-300 group-hover:text-zinc-400 dark:group-hover:text-zinc-500 sm:block"
              >
                {step.phase}
              </span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── §2 Comparison ───────────────────────────────────────────────── */}
      <section className="border-y border-zinc-300 bg-card dark:border-zinc-700">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <motion.div {...fadeUp} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-300 dark:border-zinc-700 pb-4">
          <h2 className="font-display text-3xl text-zinc-900 dark:text-zinc-100 sm:text-4xl">A traditional screen, side by side</h2>
          <MicroLabel>§2 — where the difference shows up</MicroLabel>
        </motion.div>
        <motion.div {...fadeUp} className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[560px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="w-40 py-3 pr-4 font-medium">Dimension</th>
                <th className="py-3 pr-8 font-medium">A traditional screen</th>
                <th className="border-l border-zinc-200 dark:border-zinc-700 bg-[#f7f3ea] dark:bg-zinc-800/40 py-3 pl-4 pr-6 font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-1.5 w-1.5 bg-[#5c7250]" />
                    SkillProof
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.dim} className="group border-b border-zinc-200 dark:border-zinc-700 align-top transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <td className="py-3.5 pr-4 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">{row.dim}</td>
                  <td className="py-3.5 pr-8 text-muted-foreground">
                    <span aria-hidden className="mr-2 inline-block font-mono text-zinc-300 dark:text-zinc-600 transition-colors group-hover:text-zinc-400 dark:group-hover:text-zinc-400">
                      ×
                    </span>
                    {row.trad}
                  </td>
                  <td className="border-l border-zinc-200 dark:border-zinc-700 bg-[#f7f3ea] dark:bg-zinc-800/40 py-3.5 pl-4 pr-6 text-zinc-900 dark:text-zinc-100">
                    <span
                      aria-hidden
                      className="mr-2 inline-block font-mono text-[#5c7250] dark:text-[#a9c29b] transition-transform duration-300 ease-out group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                    {row.sp}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
        </div>
      </section>

      {/* ── §3 What the engine measures ──────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <motion.div {...fadeUp} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-300 dark:border-zinc-700 pb-4">
          <h2 className="font-display text-3xl text-zinc-900 dark:text-zinc-100 sm:text-4xl">What the engine actually measures</h2>
          <MicroLabel>§3 — six mechanisms, no mystery</MicroLabel>
        </motion.div>
        <div className="mt-2 grid md:grid-cols-2 md:gap-x-12">
          {MEASURES.map((u, i) => (
            <motion.div
              key={u.title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.04 }}
              className="group flex items-start gap-4 border-b border-zinc-200 dark:border-zinc-700 py-5 sm:gap-5"
            >
              <span
                aria-hidden
                className="mt-0.5 shrink-0 font-display text-3xl italic leading-none text-zinc-300 dark:text-zinc-600 transition-colors duration-300 group-hover:text-[#5c7250] dark:group-hover:text-[#a9c29b]"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                aria-hidden
                className="mt-[1.1rem] hidden h-px w-7 shrink-0 bg-zinc-200 dark:bg-zinc-700 transition-all duration-300 ease-out group-hover:w-10 group-hover:bg-[#5c7250]/60 sm:block"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  <span className="relative after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-[#5c7250] after:content-[''] after:transition-transform after:duration-300 after:ease-out group-hover:after:scale-x-100">
                    {u.title}
                  </span>
                  <u.icon
                    aria-hidden
                    strokeWidth={1.5}
                    className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600 transition-colors duration-300 group-hover:text-zinc-500 dark:group-hover:text-zinc-400"
                  />
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{u.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Closing note ─────────────────────────────────────────────────── */}
      <section className="border-t border-zinc-300 dark:border-zinc-700 bg-card">
        <motion.div
          {...fadeUp}
          className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between"
        >
          <div className="max-w-2xl">
            <p className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              <span aria-hidden className="h-2 w-2 bg-[#5c7250]" />
              The operating principle
            </p>
            <p className="mt-3 font-display text-2xl italic leading-snug text-zinc-900 dark:text-zinc-100 sm:text-[1.75rem]">
              Hiring doesn&apos;t need more intuition. It needs better evidence — and a place to
              get it.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              — how every assessment here is run
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
            <PrimaryCta onClick={onStart}>Run a verification</PrimaryCta>
            {onSignIn && <TextLink onClick={onSignIn}>Recruiter? Sign in</TextLink>}
          </div>
        </motion.div>
      </section>

      {/* ── Certificate verification desk ─────────────────────────────────── */}
      <CertificateVerifyDesk />
    </div>
  );
}

/**
 * Public certificate verification — anyone holding a SkillProof certificate
 * (or its SP-XXXX-XXXX code) can check authenticity here.
 */
function CertificateVerifyDesk() {
  const store = useStore();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.certificate) {
        toast.error(data?.error ?? "No certificate found for this code.");
        return;
      }
      toast.success(`Certificate verified — ${data.certificate.candidateName}`, {
        description: `Issued by ${data.certificate.issuedBy} · code ${data.certificate.code}`,
      });
      store.setCertificate(data.certificate);
      setCode("");
    } catch {
      toast.error("Couldn't verify this certificate — check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t-[3px] border-double border-zinc-300 dark:border-zinc-700 bg-card">
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* faint ghost stamp — large screens only */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-10 hidden -rotate-1 select-none items-center border-2 border-zinc-200 dark:border-zinc-800 px-6 py-2.5 font-mono text-sm font-semibold uppercase tracking-[0.32em] text-zinc-200 dark:text-zinc-800 lg:inline-flex"
        >
          <span aria-hidden className="absolute inset-[3px] border border-zinc-200 dark:border-zinc-800" />
          Authentic
        </span>

        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-md">
            <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ShieldCheck aria-hidden strokeWidth={1.5} className="h-4 w-4 text-[#5c7250] dark:text-[#a9c29b]" />
              Verification desk — public register
            </p>
            <p className="mt-3 font-display text-2xl italic leading-snug text-zinc-900 dark:text-zinc-100">
              Hold a SkillProof certificate? Check it&apos;s genuine.
            </p>
          </div>
          <div className="w-full max-w-md">
            <form onSubmit={verify} className="flex w-full items-center gap-2" aria-label="Verify a certificate">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SP-XXXX-XXXX"
                aria-label="Certificate code"
                className="h-10 flex-1 border-zinc-300 dark:border-zinc-700 font-mono text-sm uppercase tracking-[0.12em] placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
              />
              <Button type="submit" disabled={busy || !code.trim()} className="sp-press h-10 px-4 text-sm font-medium">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="mr-2 h-4 w-4" />}
                Verify
              </Button>
            </form>
            <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
              Codes ship with every issued certificate · look-up is public
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
