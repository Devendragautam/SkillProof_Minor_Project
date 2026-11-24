"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FolderGit2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClaimedLevel } from "@/lib/types";

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
              {done ? <Check className="h-3 w-3 text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={2.5} /> : i + 1}
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
  children,
}: {
  step: number;
  kicker: string;
  title: React.ReactNode;
  note: string;
  children?: React.ReactNode;
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
      {children}
      <div className="mt-4 flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
        <span className="text-right font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{note}</span>
      </div>
    </header>
  );
}

const LEVELS: ClaimedLevel[] = ["Advanced", "Intermediate", "Basic"];

const LEVEL_STYLE: Record<ClaimedLevel, string> = {
  Advanced: "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  Intermediate: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  Basic: "border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
};

export function SkillsStep() {
  const store = useStore();
  const [generating, setGenerating] = useState(false);

  const profile = store.profile;
  const selectedSkills = useMemo(
    () => Object.entries(store.selection).filter(([, v]) => v.selected).map(([k, v]) => ({ skill: k, level: v.level })),
    [store.selection]
  );

  const estimate = useMemo(() => {
    // rough personalized plan preview (mirrors server logic loosely)
    let coding = 0, debugging = 0, mcq = 0;
    for (const s of selectedSkills) {
      const adv = s.level === "Advanced";
      const base = adv ? { c: 2, d: 1, m: 2 } : s.level === "Intermediate" ? { c: 1, d: 1, m: 2 } : { c: 1, d: 0, m: 1 };
      coding += base.c;
      debugging += base.d;
      mcq += base.m;
    }
    const total = Math.min(coding + debugging + mcq, 10);
    return { coding, debugging, mcq, total };
  }, [selectedSkills]);

  const generate = async () => {
    if (selectedSkills.length === 0) {
      toast.error("Select at least one skill to assess");
      return;
    }
    if (store.candidateName.trim().length < 2) {
      toast.error("Add your name in the candidate identity section (previous step)");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // invited candidates reuse their recruiter-created profile
          candidateId: store.candidateId || undefined,
          name: store.candidateName,
          email: store.candidateEmail || undefined,
          resumeText: store.resumeText || undefined,
          resumeFileName: store.resumeFileName || undefined,
          skills: selectedSkills,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create assessment");
      store.setAssessment(data.assessmentId, data.candidateId, data.total);
      store.setQuestion(null);
      store.setCandidateStep("assessment");
      toast.success("Assessment generated", { description: `${data.total} questions across ${data.plan.items.length} skill(s).` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create assessment");
    } finally {
      setGenerating(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <StepHeader
        step={1}
        kicker="Dossier · Step 2 of 4"
        title={
          <>
            Claimed <em className="text-[#5c7250] dark:text-[#a9c29b]">skill</em> profile
          </>
        }
        note="Claim only what you can prove"
      >
        {profile.summary && (
          <p className="mt-3 max-w-xl font-display text-[15px] italic leading-relaxed text-zinc-700 dark:text-zinc-300">
            “{profile.summary}”
          </p>
        )}
      </StepHeader>

      <Card className="rounded-md border-border bg-card shadow-none">
        <CardHeader className="border-b border-zinc-200 dark:border-zinc-700">
          <CardTitle className="font-display text-lg tracking-tight text-zinc-900 dark:text-zinc-100">Extracted skills</CardTitle>
          <CardDescription>Adjust claimed proficiency and select the skills to assess.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto pr-3">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-700">
              {profile.skills.map((s, si) => {
                const sel = store.selection[s.name];
                if (!sel) return null;
                return (
                  <div
                    key={s.name}
                    className={cn(
                      "group flex items-center gap-3 border-l-2 py-2.5 pl-3 pr-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                      sel.selected ? "border-l-[#5c7250]" : "border-l-transparent"
                    )}
                  >
                    <span className="w-5 shrink-0 font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400" aria-hidden>
                      {String(si + 1).padStart(2, "0")}
                    </span>
                    <Checkbox
                      checked={sel.selected}
                      onCheckedChange={() => store.toggleSkill(s.name)}
                      aria-label={`Assess ${s.name}`}
                      className="border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-zinc-950 data-[state=checked]:bg-zinc-950 dark:data-[state=checked]:border-zinc-100 dark:data-[state=checked]:bg-zinc-100"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm text-zinc-900 dark:text-zinc-100",
                          sel.selected ? "font-semibold" : "font-medium text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        {s.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={s.evidence}>{s.evidence}</p>
                    </div>
                    <Select value={sel.level} onValueChange={(v) => store.setSkillLevel(s.name, v as ClaimedLevel)}>
                      <SelectTrigger size="sm" className={cn("w-32 shrink-0 border text-xs sm:w-36", LEVEL_STYLE[sel.level])}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVELS.map((l) => (
                          <SelectItem key={l} value={l}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          {profile.projects.length > 0 && (
            <>
              <p className="mb-3 mt-6 flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span aria-hidden className="inline-block h-2 w-2 bg-[#5c7250]" />
                <FolderGit2 className="h-3.5 w-3.5" /> Detected projects
              </p>
              <div className="flex flex-wrap gap-2">
                {profile.projects.map((p, i) => (
                  <Badge key={i} variant="outline" className="border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-3 py-1.5 text-xs font-normal text-zinc-700 dark:text-zinc-300">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</span>
                    {p.tech.length > 0 && <span className="ml-1.5 text-muted-foreground">· {p.tech.slice(0, 4).join(", ")}</span>}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* confirm & generate — cream certificate-preview panel */}
      <div className="relative mt-6 border border-zinc-300 dark:border-zinc-700 bg-[#faf7f0] dark:bg-zinc-900">
        <div aria-hidden className="pointer-events-none absolute inset-1.5 border border-zinc-300 dark:border-zinc-700" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:p-7">
          <div className="min-w-0">
            <p className="flex items-center gap-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span aria-hidden className="inline-block h-2 w-2 bg-[#5c7250]" /> Confirm &amp; generate
            </p>
            <p className="mt-2 font-display text-xl tracking-tight text-zinc-900 dark:text-zinc-100">
              {selectedSkills.length} skill{selectedSkills.length === 1 ? "" : "s"} · about {estimate.total} questions
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Coding, debugging and conceptual rounds — adaptive to your claimed levels.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">
              <span className="border border-zinc-300 dark:border-zinc-700 px-2.5 py-1">{selectedSkills.length} selected</span>
              <span className="border border-zinc-300 dark:border-zinc-700 px-2.5 py-1">≈ {estimate.total} questions</span>
              <span className="border border-zinc-300 dark:border-zinc-700 px-2.5 py-1">{estimate.coding} coding</span>
              <span className="border border-zinc-300 dark:border-zinc-700 px-2.5 py-1">{estimate.debugging} debugging</span>
              <span className="border border-zinc-300 dark:border-zinc-700 px-2.5 py-1">{estimate.mcq} conceptual</span>
            </div>
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto">
            <Button
              variant="outline"
              onClick={() => store.setCandidateStep("resume")}
              className="flex-1 border-zinc-300 dark:border-zinc-700 bg-transparent hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 sm:flex-none"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button
              onClick={() => void generate()}
              disabled={generating}
              className="sp-press flex-1 font-semibold sm:flex-none"
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Generate assessment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
