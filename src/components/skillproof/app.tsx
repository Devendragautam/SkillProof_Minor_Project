"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Landing } from "@/components/skillproof/landing";
import { ResumeStep } from "@/components/skillproof/resume-step";
import { SkillsStep } from "@/components/skillproof/skills-step";
import { AssessmentStep } from "@/components/skillproof/assessment-step";
import { ResultsStep } from "@/components/skillproof/results-step";
import { RecruiterDashboard } from "@/components/skillproof/recruiter-dashboard";
import { AuthView } from "@/components/skillproof/auth-view";
import { CertificateView } from "@/components/skillproof/certificate-view";
import { MyCredentials } from "@/components/skillproof/my-credentials";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  useStore,
  hydrateSession,
  applyHydrated,
  persistSession,
  isReloadishNavigation,
  clearPersistedSession,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Loader2,
  LogOut,
  MailPlus,
  ShieldCheck,
} from "lucide-react";

const STEPS = [
  { id: "resume", label: "Resume" },
  { id: "skills", label: "Skill profile" },
  { id: "assessment", label: "Assessment" },
  { id: "results", label: "Verified profile" },
] as const;

export function SkillProofApp() {
  const store = useStore();
  const reduceMotion = useReducedMotion();

  // restore session after refresh + keep it persisted
  useEffect(() => {
    // ── auth hydration: resolve the session cookie into a user ──
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json().catch(() => null);
        useStore.getState().setUser(data?.user ?? null);
      } catch {
        useStore.getState().setUser(null);
      } finally {
        useStore.getState().setAuthChecked(true);
      }
    })();

    const params =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;

    // certificate verification link (?cert=<code>) — public, takes precedence:
    // consume the code, fetch the record and open the certificate view
    const certParam = params?.get("cert");
    if (certParam) {
      (async () => {
        try {
          const res = await fetch(`/api/certificates/${encodeURIComponent(certParam)}`);
          const data = await res.json().catch(() => null);
          if (res.ok && data?.certificate) {
            useStore.setState({ view: "certificate", certificate: data.certificate });
            try {
              window.history.replaceState(null, "", window.location.pathname);
            } catch {}
          } else {
            toast.error(data?.error ?? "No certificate found for this code.");
          }
        } catch {
          toast.error("Couldn't verify this certificate — check the code and try again.");
        }
      })();
      // a verification link is a self-contained context — skip flow hydration
      return () => {};
    }

    // recruiter invite link (?invite=<candidateId>) binds the flow to that profile
    const inviteParam = params?.get("invite");
    if (inviteParam) {
      (async () => {
        try {
          const res = await fetch(`/api/candidates/${inviteParam}`);
          const data = await res.json();
          if (res.ok && data?.candidate?.id) {
            useStore
              .getState()
              .setInvite(data.candidate.id, data.candidate.name, data.candidate.email ?? "");
            // consumed — drop the param so a refresh uses the persisted flow state
            try {
              window.history.replaceState(null, "", window.location.pathname);
            } catch {}
          } else {
            toast.error("This invite link is no longer valid — starting a fresh verification.");
          }
        } catch {
          toast.error("Couldn't load the invite — check the link and try again.");
        }
      })();
    }

    // shared report link (?report=<id>&t=<shareToken>) takes precedence over
    // hydration. The share token is a 192-bit random secret — the assessment
    // id alone no longer grants access.
    const reportParam = params?.get("report");
    if (reportParam) {
      const shareToken = params?.get("t");
      (async () => {
        try {
          const qs = shareToken ? `?t=${encodeURIComponent(shareToken)}` : "";
          const res = await fetch(`/api/report/${reportParam}${qs}`);
          const data = await res.json();
          if (!res.ok) {
            // an authenticated owner opening their own link may have dropped
            // the token — retry without it falls back to the same fetch, so
            // surface a clear error instead
            if (res.status === 401 && !shareToken) {
              toast.error("This report link needs its share token — use the full link you were given.");
            }
            return;
          }
          useStore.setState({
            view: "candidate",
            candidateStep: "results",
            report: data,
            resultsAssessmentId: reportParam,
            sharedReport: true,
            sharedReportToken: shareToken,
          });
        } catch {
          // fall through to normal hydration
          const saved = hydrateSession();
          if (saved && (saved.assessmentId || saved.resultsAssessmentId || saved.candidateStep !== "resume")) {
            applyHydrated(saved);
          }
        }
      })();
    } else {
      const saved = hydrateSession();
      if (saved) {
        const reloadish = isReloadishNavigation();
        // an invite binding survives refresh (the candidate shouldn't lose their
        // recruiter link by hitting F5), but a fresh visit starts clean
        const resumable =
          saved.assessmentId ||
          saved.resultsAssessmentId ||
          saved.candidateStep !== "resume" ||
          (Boolean(saved.inviteName) && reloadish);
        if (resumable) {
          if (saved.candidateStep === "results" && !reloadish) {
            // results are transient: a fresh navigation (typed URL, new tab) should
            // land on the marketing page, not resurrect a stale report. Refresh and
            // back navigations still restore. Fall through so persistence stays live.
            clearPersistedSession();
          } else {
            applyHydrated(saved);
          }
        }
      }
    }
    const unsub = useStore.subscribe((state) => persistSession(state));
    return unsub;
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* header — hidden while the exam runner is live: the assessment screen
          swaps in its own test-conducting header (logo, position, countdown,
          finish) so the viewport belongs entirely to the test, like real
          assessment software */}
      {!store.examActive && (
      <header className="sticky top-0 z-40 border-b border-zinc-300 dark:border-zinc-700 bg-background/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <button
            onClick={() => store.setView("landing")}
            className="group flex items-center gap-2.5"
            aria-label="SkillProof home"
          >
            {/* ink square tips toward sage on hover — the masthead's one flourish */}
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-950 dark:bg-zinc-100 transition-[background-color,transform] duration-200 ease-out group-hover:-rotate-3 group-hover:bg-[#5c7250]"
            >
              <ShieldCheck className="h-4 w-4 text-[#faf7f0] dark:text-[#211d16]" strokeWidth={1.8} />
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block font-display text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">SkillProof</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                evidence over adjectives
              </span>
            </span>
          </button>

          <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Main navigation">
            <Button
              size="sm"
              variant={store.view === "candidate" ? "default" : "ghost"}
              onClick={() => {
                // already in the flow? escape results/shared-report view and start fresh
                if (store.view === "candidate" && (store.sharedReport || store.candidateStep === "results")) {
                  store.resetFlow();
                }
                store.setView("candidate");
              }}
              className={cn(
                "h-8 px-2.5 text-xs sm:px-3 sm:text-sm",
                store.view === "candidate"
                  ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                  : "sp-underline-slide text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
              )}
            >
              Candidate flow
            </Button>
            <Button
              size="sm"
              variant={store.view === "recruiter" ? "default" : "ghost"}
              onClick={() => {
                // recruiter workspace is account-gated: recruiters go straight in,
                // everyone else lands on sign-in with a notice
                if (store.user?.role === "recruiter") {
                  store.setView("recruiter");
                } else {
                  store.setAuthMode("login");
                  store.setView("auth");
                }
              }}
              className={cn(
                "h-8 px-2.5 text-xs sm:px-3 sm:text-sm",
                store.view === "recruiter"
                  ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                  : "sp-underline-slide text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
              )}
            >
              Recruiter
            </Button>

            {/* light / dark sheet switch — spatial night toggle */}
            <ThemeToggle />

            {/* account chip / sign-in */}
            {!store.authChecked ? (
              <span className="flex h-8 w-8 items-center justify-center" aria-hidden>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400 dark:text-zinc-400" />
              </span>
            ) : store.user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-8 items-center gap-2 border border-zinc-300 bg-card pl-1 pr-2 transition-[border-color,box-shadow] duration-200 hover:border-zinc-400 hover:ring-1 hover:ring-zinc-950/10 dark:border-zinc-700 dark:hover:border-zinc-500 dark:hover:ring-zinc-100/10"
                    aria-label="Account menu"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-6 w-6 items-center justify-center font-mono text-[10px] font-semibold",
                        store.user.role === "recruiter"
                          ? "bg-[#5c7250] text-[#faf7f0]"
                          : "bg-zinc-950 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950"
                      )}
                    >
                      {store.user.name
                        .split(/\s+/)
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                    <span className="hidden max-w-[10ch] truncate text-xs font-medium text-zinc-800 dark:text-zinc-300 sm:block">
                      {store.user.name.split(/\s+/)[0]}
                    </span>
                    <ChevronDown className="h-3 w-3 text-zinc-400 dark:text-zinc-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-md border-zinc-300 shadow-none dark:border-zinc-700">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{store.user.name}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">{store.user.email}</span>
                    <span
                      className={cn(
                        "mt-1.5 inline-block border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]",
                        store.user.role === "recruiter"
                          ? "border-[#5c7250]/30 bg-[#5c7250]/5 text-[#5c7250] dark:bg-[#5c7250]/15 dark:text-[#a9c29b]"
                          : "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300"
                      )}
                    >
                      {store.user.role}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800" />
                  <DropdownMenuItem
                    className="text-[13px] text-zinc-700 dark:text-zinc-300 focus:bg-zinc-950/5 dark:focus:bg-zinc-100/10 focus:text-zinc-950 dark:focus:text-zinc-100"
                    onClick={async () => {
                      try {
                        await fetch("/api/auth/logout", { method: "POST" });
                      } catch {}
                      store.setUser(null);
                      store.setView("landing");
                      toast("Signed out", { description: "Your session cookie was cleared." });
                    }}
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  store.setAuthMode("login");
                  store.setView("auth");
                }}
                className="sp-press h-8 border-zinc-300 px-2.5 text-xs hover:bg-zinc-950 hover:text-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-100 dark:hover:text-zinc-950 sm:px-3 sm:text-sm"
              >
                Sign in
              </Button>
            )}
          </nav>
        </div>
      </header>
      )}

      {/* main — each view rises softly into place on switch; skipped entirely
          for reduced-motion users via useReducedMotion. flex-col lets the
          assessment runner stretch so its sticky footer pins to the bottom. */}
      <main className="flex flex-1 flex-col">
        <motion.div
          key={store.view}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex flex-1 flex-col"
        >
        {store.view === "landing" && (
          <Landing
            onStart={() => {
              store.resetFlow();
              store.setView("candidate");
            }}
            onRecruiter={() => {
              // same gate as the header: recruiters straight in, others to sign-in
              if (store.user?.role === "recruiter") {
                store.setView("recruiter");
              } else {
                store.setAuthMode("login");
                store.setView("auth");
              }
            }}
            onSignIn={() => {
              store.setAuthMode("login");
              store.setView("auth");
            }}
          />
        )}

        {store.view === "candidate" && (
          <>
            {/* shared-report context banner */}
            {store.sharedReport && (
              <div className="sp-shared-banner border-b border-zinc-300 dark:border-zinc-700 bg-card print:hidden">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300 sm:px-6">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span>
                    You are viewing a <span className="font-semibold text-zinc-900 dark:text-zinc-100">shared verified report</span> — read-only.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                    onClick={() => {
                      store.resetFlow();
                      store.setView("landing");
                    }}
                  >
                    Explore SkillProof
                  </Button>
                </div>
              </div>
            )}
            {/* recruiter-invite context banner */}
            {store.inviteName && !store.sharedReport && (
              <div className="border-b border-zinc-300 dark:border-zinc-700 bg-card print:hidden">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300 sm:px-6">
                  <span className="flex h-5 w-5 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-background">
                    <MailPlus className="h-3 w-3 text-[#5c7250] dark:text-[#a9c29b]" />
                  </span>
                  <span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{store.inviteName}</span>, a recruiter invited you to
                    verify your skills — your results will be attached to{" "}
                    <span className="text-zinc-900 dark:text-zinc-100">their invite</span>. Upload your resume to begin.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-7 px-2.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                    onClick={() => store.resetFlow()}
                  >
                    Decline &amp; start fresh
                  </Button>
                </div>
              </div>
            )}
            {/* signed-in candidate home — issued credentials with PDF download */}
            {store.user?.role === "candidate" && !store.examActive && <MyCredentials />}
            {/* stepper — hidden while the assessment runner is mid-exam: the exam
                bar owns the viewport, like real test-conducting software */}
            {!store.examActive && (
            <div className="border-b border-zinc-300 dark:border-zinc-700 bg-card print:hidden">
              <div className="mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-4 py-2.5 sm:px-6" aria-label="Progress">
                {STEPS.map((s, i) => {
                  const currentIdx = STEPS.findIndex((x) => x.id === store.candidateStep);
                  const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
                  return (
                    <div key={s.id} className="flex shrink-0 items-center">
                      <div
                        className={cn(
                          "flex items-center gap-2 py-1.5 pl-1 pr-2 text-xs",
                          state === "done" && "text-zinc-700 dark:text-zinc-300",
                          state === "current" && "font-semibold text-zinc-950 dark:text-zinc-100",
                          state === "todo" && "text-zinc-400 dark:text-zinc-400"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center border font-mono text-[10px]",
                            state === "done" && "border-zinc-400 bg-zinc-100 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                            state === "current" && "border-zinc-950 bg-zinc-950 text-zinc-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950",
                            state === "todo" && "border-zinc-300 bg-background text-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
                          )}
                          aria-current={state === "current" ? "step" : undefined}
                        >
                          {state === "done" ? <Check className="h-3 w-3" /> : i + 1}
                        </span>
                        <span className="hidden font-medium sm:inline">{s.label}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={cn("mx-1 h-px w-5 sm:w-10", i < currentIdx ? "bg-zinc-500" : "bg-zinc-300 dark:bg-zinc-700")} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Server-side rule: candidate code executes only for
                authenticated owners. Unauthenticated visitors (except shared
                report viewers) must sign in or register before the flow. */}
            {!store.sharedReport && store.authChecked && !store.user ? (
              <AuthView notice="Verifications attach to your identity — sign in or create a candidate account to start. Your code, your evidence and your certificate stay yours." />
            ) : (
              <>
                {store.candidateStep === "resume" && <ResumeStep />}
                {store.candidateStep === "skills" && <SkillsStep />}
                {store.candidateStep === "assessment" && <AssessmentStep />}
                {store.candidateStep === "results" && <ResultsStep />}
              </>
            )}
          </>
        )}

        {store.view === "certificate" && store.certificate && (
          <CertificateView
            data={store.certificate}
            onBack={() => {
              const from = store.certificateFrom;
              if (from && from !== "certificate") {
                store.setView(from);
              } else if (store.user?.role === "recruiter") {
                store.setView("recruiter");
              } else {
                store.setView("landing");
              }
            }}
          />
        )}

        {store.view === "auth" && (
          <AuthView
            notice={
              store.user?.role === "candidate"
                ? "You're signed in as a candidate — sign in with a recruiter account to open the recruiter workspace."
                : undefined
            }
          />
        )}

        {store.view === "recruiter" &&
          (!store.authChecked ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking your session…
              </div>
            </div>
          ) : store.user?.role === "recruiter" ? (
            <RecruiterDashboard />
          ) : (
            <AuthView notice="The recruiter workspace is account-gated. Sign in with your provisioned recruiter ID — recruiter accounts cannot self-register." />
          ))}
        </motion.div>
      </main>

      {/* sticky footer — newspaper double rule on top (1px zinc-300 + 3px air
          + 1px zinc-200); safe-area padding preserved. Suppressed mid-exam:
          the runner fills the viewport with the test surface. */}
      {!store.examActive && (
      <footer className="mt-auto bg-card">
        <div aria-hidden className="h-[3px] border-t border-zinc-300 dark:border-t-zinc-700 border-b border-b-zinc-200 dark:border-b-zinc-800" />
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:flex-row sm:px-6">
          <p className="font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold text-zinc-800 dark:text-zinc-300">SkillProof</span> — evidence-based skill verification for technical hiring
          </p>
          <p className="text-center font-mono text-[11px] text-muted-foreground sm:text-right">
            Scores ship with evidence &amp; confidence levels. AI-assist risk is a signal, never a verdict.
          </p>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="border-t border-zinc-200 pt-2.5 text-center font-mono text-[10px] tracking-[0.02em] text-zinc-400 dark:border-zinc-800 dark:text-zinc-500 sm:text-left">
            Set in Fraunces · Archivo · IBM Plex Mono — every score carries its evidence.
          </p>
        </div>
      </footer>
      )}
    </div>
  );
}
