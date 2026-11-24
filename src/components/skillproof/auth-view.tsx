"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore, type AuthMode } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowRight, BriefcaseBusiness, Loader2, Lock, ShieldCheck, UserRound } from "lucide-react";

/**
 * Auth screen — sign in (provisioned recruiter / candidate) or create a
 * candidate account. Recruiter accounts cannot self-register: the single
 * provisioned recruiter signs in with their registered recruiter ID (name)
 * or email. Editorial "ink on paper" styling: hairline borders, serif
 * display, mono labels, one sage accent.
 */

/**
 * Demo credentials autofill — ONLY surfaced when the deployment explicitly
 * enables demo mode (NEXT_PUBLIC_DEMO_MODE=1). Production builds never ship
 * working demo credentials in the bundle.
 */
const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "1";
const DEMO_CANDIDATE = {
  email: process.env.NEXT_PUBLIC_DEMO_CANDIDATE_EMAIL || "candidate@skillproof.io",
  password: process.env.NEXT_PUBLIC_DEMO_CANDIDATE_PASSWORD || "",
  name: process.env.NEXT_PUBLIC_DEMO_CANDIDATE_NAME || "Dev Sharma",
};

type SigninRole = "recruiter" | "candidate";

export function AuthView({ notice }: { notice?: string }) {
  const store = useStore();
  const [mode, setMode] = useState<AuthMode>(store.authMode);
  const [signinRole, setSigninRole] = useState<SigninRole>("recruiter");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(m: AuthMode) {
    setMode(m);
    setError(null);
    store.setAuthMode(m);
  }

  function switchSigninRole(r: SigninRole) {
    setSigninRole(r);
    setError(null);
  }

  function applyDemoCandidate() {
    if (!DEMO_ENABLED) return;
    switchMode("login");
    setSigninRole("candidate");
    setEmail(DEMO_CANDIDATE.email);
    setPassword(DEMO_CANDIDATE.password);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? // both roles sign in with an identifier: recruiter ID (name) or email
              { identifier: (signinRole === "recruiter" ? identifier : email).trim(), password }
            : // registration is candidate-only — the recruiter account is provisioned
              { name, email, password, role: "candidate" }
        ),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.user) {
        setError(data?.error ?? "Something went wrong — try again.");
        return;
      }
      store.setUser(data.user);
      if (data.user.role === "recruiter") {
        toast.success(`Signed in as ${data.user.name}`, { description: "Recruiter workspace unlocked." });
        store.setView("recruiter");
      } else {
        // candidate identity carries into the verification flow
        if (!store.candidateName) store.setCandidateInfo(data.user.name, data.user.email);
        toast.success(`Signed in as ${data.user.name}`, { description: "Your verifications now attach to this account." });
        store.setView("candidate");
      }
      setIdentifier("");
      setEmail("");
      setPassword("");
      setName("");
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-grid-bg">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-12 lg:gap-14">
        {/* ── Left: statement ─────────────────────────────────────────── */}
        <div className="lg:col-span-5">
          {/* oversized quotation glyph — a faint printer's mark on the paper */}
          <p aria-hidden className="-mb-4 -ml-1 hidden select-none font-display text-[96px] italic leading-none text-zinc-200 dark:text-zinc-800 lg:block">
            “
          </p>
          {notice && (
            <p className="mb-6 flex items-center gap-2 border border-zinc-300 dark:border-zinc-700 bg-card px-3.5 py-2.5 text-[13px] text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[#5c7250] dark:text-[#a9c29b]" />
              {notice}
            </p>
          )}
          <h1 className="font-display text-4xl leading-[1.08] tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 sm:text-[2.75rem]">
            {mode === "login" ? (
              <>
                Welcome back to
                <br />
                <span className="italic">the evidence desk.</span>
              </>
            ) : (
              <>
                An account for
                <br />
                <span className="italic">your proof of work.</span>
              </>
            )}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[14px] leading-relaxed text-muted-foreground">
            {mode === "login"
              ? "Sign in to reach your workspace — recruiters manage the pipeline and question bank; candidates keep every verification they run attached to one profile."
              : "Create a candidate account and every verification you run — resume, coding, SQL — belongs to you, not to a browser tab."}
          </p>

          <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-300 dark:border-zinc-700">
            {[
              { icon: BriefcaseBusiness, k: "Recruiter", v: "Provisioned access — pipeline, question bank, PDF imports and certificate issuing." },
              { icon: UserRound, k: "Candidate", v: "Run verifications; your reports stay linked to your identity and email." },
            ].map((r, i) => (
              <li key={r.k} className="flex gap-3.5 py-3.5 transition-colors first:pt-4 last:pb-4 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60">
                <span aria-hidden className="w-4 shrink-0 pt-2 font-mono text-[9px] text-zinc-300 dark:text-zinc-600">0{i + 1}</span>
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-card">
                  <r.icon className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-300" strokeWidth={1.8} />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium text-zinc-900 dark:text-zinc-100">{r.k}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{r.v}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* demo candidate — explorable one click away (demo mode only) */}
          {DEMO_ENABLED && (
          <div className="mt-8 border border-zinc-300 dark:border-zinc-700 bg-card">
            <p className="border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Demo candidate · one-click fill
            </p>
            <div className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] text-zinc-800 dark:text-zinc-300">{DEMO_CANDIDATE.email}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Candidate · {DEMO_CANDIDATE.name}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                onClick={applyDemoCandidate}
              >
                Fill
              </Button>
            </div>
          </div>
          )}

          {/* the provisioned recruiter — a provisioned register entry, shown never fillable */}
          <div className="mt-3 border border-l-2 border-l-[#5c7250] border-zinc-300 dark:border-zinc-700 bg-card p-[3px]">
            <div className="relative border border-zinc-200 dark:border-zinc-700 bg-card">
              <p className="border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Recruiter access · provisioned register
              </p>
              <div className="flex items-center gap-3 px-4 py-2.5 sm:pr-14">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40">
                  <Lock className="h-3.5 w-3.5 text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Devendra Gautam — provisioned recruiter</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
                    sign in with your recruiter ID · no self sign-up
                  </p>
                </div>
              </div>
              {/* hairline rosette seal — outline only, a seal awaiting ink */}
              <span aria-hidden className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block">
                <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                  <circle cx="19" cy="19" r="17.5" stroke="#e4e4e7" strokeWidth="1" strokeDasharray="1.6 2.2" />
                  <circle cx="19" cy="19" r="13" stroke="#e4e4e7" strokeWidth="1" />
                  <circle cx="19" cy="19" r="1.8" fill="#5c7250" fillOpacity="0.5" />
                </svg>
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: the form ─────────────────────────────────────────── */}
        <div className="lg:col-span-7">
          <div className="border border-zinc-300 dark:border-zinc-700 bg-card">
            {/* mode toggle */}
            <div className="grid grid-cols-2 divide-x divide-zinc-300 dark:divide-zinc-700 border-b border-zinc-300 dark:border-zinc-700" role="tablist" aria-label="Authentication mode">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    "relative h-11 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                    mode === m
                      ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  {m === "login" ? "Sign in" : "Create account"}
                  {mode === m && <span aria-hidden className="absolute right-1.5 top-1.5 h-1 w-1 bg-[#5c7250]" />}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-5 px-5 py-6 sm:px-7 sm:py-7">
              {mode === "login" ? (
                <>
                  {/* sign-in role: the provisioned recruiter signs in by ID, candidates by email */}
                  <div>
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Sign in as
                    </p>
                    <div
                      className="grid grid-cols-2 divide-x divide-zinc-300 dark:divide-zinc-700 border border-zinc-300 dark:border-zinc-700"
                      role="group"
                      aria-label="Sign-in role"
                    >
                      {(["recruiter", "candidate"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={signinRole === r}
                          onClick={() => switchSigninRole(r)}
                          className={cn(
                            "relative h-10 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                            signinRole === r
                              ? "bg-zinc-950 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-950"
                              : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                          )}
                        >
                          {r === "recruiter" ? "Recruiter" : "Candidate"}
                          {signinRole === r && <span aria-hidden className="absolute right-1.5 top-1.5 h-1 w-1 bg-[#5c7250]" />}
                        </button>
                      ))}
                    </div>
                    {signinRole === "recruiter" && (
                      <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                        Recruiter access is restricted to the provisioned account — sign in with your registered recruiter ID.
                      </p>
                    )}
                  </div>

                  {signinRole === "recruiter" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-identifier" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Recruiter ID
                      </Label>
                      <Input
                        id="auth-identifier"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. Devendra Gautam"
                        autoComplete="username"
                        required
                        className="h-10 border-zinc-300 dark:border-zinc-700 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-email" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Email
                      </Label>
                      <Input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        autoComplete="email"
                        required
                        className="h-10 border-zinc-300 dark:border-zinc-700 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* candidate-only registration — recruiters are provisioned, never self-registered */}
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-950 dark:text-zinc-100">
                      Create a candidate account
                    </p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      Recruiter accounts are provisioned by SkillProof — if you hire on this platform, sign in with your recruiter ID instead.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="auth-name" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Full name
                    </Label>
                    <Input
                      id="auth-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Priya Nair"
                      autoComplete="name"
                      required
                      minLength={2}
                      className="h-10 border-zinc-300 dark:border-zinc-700 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="auth-email" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      required
                      className="h-10 border-zinc-300 dark:border-zinc-700 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="auth-password" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  className="h-10 border-zinc-300 dark:border-zinc-700 focus-visible:border-[#5c7250] focus-visible:ring-[#5c7250]/25"
                />
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 border border-rose-300/80 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-[13px] text-rose-700 dark:text-rose-400">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-rose-600" />
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy} className="group sp-press h-11 w-full text-sm font-medium">
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === "login" ? "Signing in…" : "Creating account…"}
                  </>
                ) : (
                  <>
                    {mode === "login" ? "Sign in" : "Create account"}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>

              <p className="text-center text-[12.5px] text-muted-foreground">
                {mode === "login" ? (
                  <>
                    New here?{" "}
                    <button type="button" onClick={() => switchMode("register")} className="font-medium text-zinc-900 dark:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:decoration-[#5c7250]">
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already registered?{" "}
                    <button type="button" onClick={() => switchMode("login")} className="font-medium text-zinc-900 dark:text-zinc-100 underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:decoration-[#5c7250]">
                      Sign in instead
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Sessions are cookie-based · sign out any time from the header
          </p>
        </div>
      </div>
    </div>
  );
}
