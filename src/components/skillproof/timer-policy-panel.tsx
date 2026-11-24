"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Timer, RotateCcw, Save, SlidersHorizontal, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Recruiter-configurable, section-wise assessment timer policy.
 * Debugging minutes / DSA minutes by difficulty / MCQ seconds — applied by the
 * assessment engine when a question is dealt (auto-submit at zero client-side).
 * Plus per-skill overrides: replace the section limit for every question of
 * one skill (recruiter knows SQL joins need more desk time than the default).
 */

interface TimerPolicyValues {
  debuggingMin: number;
  dsaEasyMin: number;
  dsaMediumMin: number;
  dsaHardMin: number;
  mcqSec: number;
  skillOverrides: Record<string, number>;
  pasteWarnChars: number;
  pasteRiskChars: number;
  explainWarnPct: number;
}

const DEFAULTS: TimerPolicyValues = {
  debuggingMin: 5,
  dsaEasyMin: 20,
  dsaMediumMin: 30,
  dsaHardMin: 45,
  mcqSec: 45,
  skillOverrides: {},
  pasteWarnChars: 80,
  pasteRiskChars: 200,
  explainWarnPct: 70,
};

type TimerFieldKey = Exclude<
  keyof TimerPolicyValues,
  "skillOverrides" | "pasteWarnChars" | "pasteRiskChars" | "explainWarnPct"
>;

const FIELDS: Array<{
  key: TimerFieldKey;
  label: string;
  hint: string;
  unit: "min" | "sec";
  min: number;
  max: number;
}> = [
  { key: "debuggingMin", label: "Debugging", hint: "per buggy-fix question", unit: "min", min: 1, max: 180 },
  { key: "dsaEasyMin", label: "DSA · Easy", hint: "arrays, strings, warm-ups", unit: "min", min: 1, max: 180 },
  { key: "dsaMediumMin", label: "DSA · Medium", hint: "graphs, DP, windows", unit: "min", min: 1, max: 180 },
  { key: "dsaHardMin", label: "DSA · Hard", hint: "hard interviews grade", unit: "min", min: 1, max: 180 },
  { key: "mcqSec", label: "MCQ", hint: "per conceptual question", unit: "sec", min: 10, max: 3600 },
];

/** One editable per-skill override row ("" = no override for this skill). */
type OverrideDraft = Record<string, number | "">;

export function TimerPolicyPanel() {
  const [values, setValues] = useState<TimerPolicyValues>(DEFAULTS);
  const [saved, setSaved] = useState<{ updatedBy: string | null; updatedAt: string | null }>({ updatedBy: null, updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankSkills, setBankSkills] = useState<Array<{ skill: string; count: number }>>([]);
  const [drafts, setDrafts] = useState<OverrideDraft>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/timer-policy")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data) => {
        if (!alive) return;
        const loaded = { ...DEFAULTS, ...data.policy } as TimerPolicyValues;
        setValues(loaded);
        setDrafts({ ...loaded.skillOverrides });
        setSaved({ updatedBy: data.updatedBy ?? null, updatedAt: data.updatedAt ?? null });
      })
      .catch(() => toast.error("Could not load the timer policy"))
      .finally(() => alive && setLoading(false));
    // skill list from the bank (public, includes per-skill counts)
    fetch("/api/questions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const rows = Array.isArray(d.questions) ? d.questions : [];
        const counts = new Map<string, number>();
        for (const q of rows) {
          if (typeof q?.skill === "string" && q.skill) counts.set(q.skill, (counts.get(q.skill) ?? 0) + 1);
        }
        const skills = Array.isArray(d.skills)
          ? Array.from(new Set([...d.skills.filter((s: unknown) => typeof s === "string"), ...counts.keys()]))
          : Array.from(counts.keys());
        setBankSkills(
          (skills as string[])
            .sort((a, b) => a.localeCompare(b))
            .map((skill) => ({ skill, count: counts.get(skill) ?? 0 }))
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // draft "" entries mean "no override"
      const overrides: Record<string, number> = {};
      for (const [skill, v] of Object.entries(drafts)) {
        const n = Math.round(Number(v));
        if (v !== "" && Number.isFinite(n) && n > 0) overrides[skill] = n;
      }
      const res = await fetch("/api/timer-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, skillOverrides: overrides }),
      });
      if (res.status === 401 || res.status === 403) {
        toast.error("Recruiter sign-in required to change the timer policy");
        return;
      }
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      const loaded = { ...DEFAULTS, ...data.policy } as TimerPolicyValues;
      setValues(loaded);
      setDrafts({ ...loaded.skillOverrides });
      setSaved({ updatedBy: data.updatedBy ?? null, updatedAt: data.updatedAt ?? null });
      toast.success("Timer policy updated — applies to newly dealt questions");
    } catch {
      toast.error("Could not save the timer policy");
    } finally {
      setSaving(false);
    }
  };

  const activeOverrides = useMemo(
    () => Object.entries(drafts).filter(([, v]) => v !== "" && Number(v) > 0),
    [drafts]
  );
  const dirty =
    FIELDS.some((f) => values[f.key] !== DEFAULTS[f.key]) ||
    values.pasteWarnChars !== DEFAULTS.pasteWarnChars ||
    values.pasteRiskChars !== DEFAULTS.pasteRiskChars ||
    values.explainWarnPct !== DEFAULTS.explainWarnPct ||
    JSON.stringify(activeOverrides.map(([k, v]) => [k, Number(v)]).sort()) !==
      JSON.stringify(Object.entries(values.skillOverrides).sort());

  const setDraft = (skill: string, v: number | "") => setDrafts((d) => ({ ...d, [skill]: v }));

  return (
    <Card className="mb-6 rounded-md border-zinc-300 dark:border-zinc-700 shadow-none">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 bg-[#5c7250]" aria-hidden />
              <Timer className="h-3.5 w-3.5 text-[#5c7250] dark:text-[#a9c29b]" aria-hidden />
              Assessment timer policy
            </p>
            <h2 className="mt-2 font-display text-xl text-zinc-950 dark:text-zinc-100">
              Section-wise time limits, <span className="italic text-zinc-700 dark:text-zinc-300">set at the recruiter desk</span>
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              Every dealt question counts down from the limit for its section — auto-submit applies at zero.
              Changes take effect for questions dealt from now on; running questions keep their limit.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
            onClick={() => {
              setValues(DEFAULTS);
              setDrafts({});
            }}
            disabled={loading || saving}
          >
            <RotateCcw className="h-3 w-3" />
            Spec defaults
          </Button>
        </div>

        {loading ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {FIELDS.map((f) => (
              <div key={f.key} className="h-[86px] animate-pulse rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Timer policy fields">
              {FIELDS.map((f) => (
                <label key={f.key} className="block border border-zinc-200 dark:border-zinc-700 bg-background p-3 transition-colors focus-within:border-zinc-500">
                  <span className="flex items-baseline justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    {f.label}
                    <span className="text-zinc-400 dark:text-zinc-400">{f.unit}</span>
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={f.min}
                    max={f.max}
                    value={values[f.key]}
                    aria-label={`${f.label} time limit in ${f.unit}`}
                    onChange={(e) => {
                      const raw = e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value)));
                      setValues((v) => ({ ...v, [f.key]: raw === "" ? ("" as unknown as number) : raw }));
                    }}
                    onBlur={() => {
                      setValues((v) => ({
                        ...v,
                        [f.key]: Math.min(f.max, Math.max(f.min, Math.round(Number(v[f.key]) || f.min))),
                      }));
                    }}
                    className="mt-1.5 h-9 border-0 bg-transparent px-0 font-mono text-lg tabular-nums shadow-none focus-visible:ring-0"
                  />
                  <span className="mt-1 block text-[10.5px] leading-tight text-zinc-400 dark:text-zinc-400">{f.hint}</span>
                </label>
              ))}
            </div>

            {/* ── per-skill overrides ─────────────────────────────────── */}
            <div className="mt-5 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" aria-hidden />
                  Per-skill overrides
                  {activeOverrides.length > 0 && (
                    <span className="border border-[#5c7250]/40 bg-[#5c7250]/5 dark:bg-[#5c7250]/15 px-1.5 py-0.5 text-[9px] tabular-nums text-[#5c7250] dark:text-[#a9c29b]">
                      {activeOverrides.length} active
                    </span>
                  )}
                </p>
                {activeOverrides.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100"
                    onClick={() => setDrafts({})}
                    disabled={saving}
                  >
                    <X className="h-3 w-3" />
                    Clear all
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Replace the section limit for every question of one skill — minutes per question. Leave a skill
                blank to keep its section default.
              </p>

              {bankSkills.length === 0 ? (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                  · question bank loading…
                </p>
              ) : (
                <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Per-skill timer overrides">
                  {bankSkills.map(({ skill, count }) => {
                    const active = drafts[skill] !== undefined && drafts[skill] !== "" && Number(drafts[skill]) > 0;
                    return (
                      <label
                        key={skill}
                        className={cn(
                          "flex items-center gap-2.5 border bg-background px-2.5 py-1.5 transition-colors focus-within:border-zinc-500",
                          active ? "border-[#5c7250]/50 bg-[#5c7250]/[0.03] dark:bg-[#5c7250]/10" : "border-zinc-200 dark:border-zinc-700"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn("h-1.5 w-1.5 shrink-0", active ? "bg-[#5c7250]" : "bg-zinc-300 dark:bg-zinc-700")}
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.06em] text-zinc-700 dark:text-zinc-300" title={skill}>
                          {skill}
                        </span>
                        {count > 0 && (
                          <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-400 dark:text-zinc-400" title={`${count} question${count === 1 ? "" : "s"} in the bank`}>
                            ×{count}
                          </span>
                        )}
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={180}
                          placeholder="—"
                          value={drafts[skill] ?? ""}
                          aria-label={`${skill} override in minutes per question`}
                          onChange={(e) => {
                            const raw = e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value)));
                            setDraft(skill, raw);
                          }}
                          onBlur={() => {
                            const cur = drafts[skill];
                            if (cur === "" || cur === undefined) return;
                            setDraft(skill, Math.min(180, Math.max(1, Math.round(Number(cur)))));
                          }}
                          className="h-7 w-16 shrink-0 border border-zinc-200 dark:border-zinc-700 bg-background px-2 font-mono text-[12px] tabular-nums shadow-none focus-visible:ring-0"
                        />
                        <span className="shrink-0 font-mono text-[9px] uppercase text-zinc-400 dark:text-zinc-400">min</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── proctor severity thresholds ─────────────────────────── */}
            <div className="mt-5 border-t border-dashed border-zinc-300 dark:border-zinc-700 pt-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 dark:text-zinc-400">
                <ShieldAlert className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-400" aria-hidden />
                Proctor severity thresholds
              </p>
              <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Where the live monitoring stream escalates a candidate signal. Pastes are quiet at or below the warn
                line, flagged <span className="font-medium text-amber-700 dark:text-amber-400">warn</span> above it and{" "}
                <span className="font-medium text-rose-700 dark:text-rose-400">risk</span> above the risk line; explain-code
                consistency below the mark reads as a warning.
              </p>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="Proctor severity thresholds">
                {(
                  [
                    { key: "pasteWarnChars", label: "Paste · warn", unit: "chars", min: 10, max: 10_000, hint: "at or below → info" },
                    { key: "pasteRiskChars", label: "Paste · risk", unit: "chars", min: 20, max: 50_000, hint: "held at warn + 10 minimum" },
                    { key: "explainWarnPct", label: "Explain · warn", unit: "%", min: 0, max: 100, hint: "consistency below → warn" },
                  ] as Array<{ key: "pasteWarnChars" | "pasteRiskChars" | "explainWarnPct"; label: string; unit: string; min: number; max: number; hint: string }>
                ).map((f) => (
                  <label key={f.key} className="border border-zinc-200 dark:border-zinc-700 bg-background px-3 py-2.5 transition-colors focus-within:border-zinc-500">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">{f.label}</span>
                      <span className="font-mono text-[9px] uppercase text-zinc-400 dark:text-zinc-400">{f.unit}</span>
                    </span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={f.min}
                      max={f.max}
                      value={values[f.key]}
                      aria-label={`${f.label} threshold in ${f.unit}`}
                      onChange={(e) => {
                        const raw = e.target.value === "" ? "" : Math.max(0, Math.round(Number(e.target.value)));
                        setValues((v) => ({ ...v, [f.key]: raw === "" ? ("" as unknown as number) : raw }));
                      }}
                      onBlur={() => {
                        setValues((v) => {
                          const next = {
                            ...v,
                            [f.key]: Math.min(f.max, Math.max(f.min, Math.round(Number(v[f.key]) || f.min))),
                          };
                          // keep the paste ladder coherent live: risk never below warn + 10
                          if (next.pasteRiskChars < next.pasteWarnChars + 10) {
                            next.pasteRiskChars = next.pasteWarnChars + 10;
                          }
                          return next;
                        });
                      }}
                      className="mt-1.5 h-9 border-0 bg-transparent px-0 font-mono text-lg tabular-nums shadow-none focus-visible:ring-0"
                    />
                    <span className="mt-1 block text-[10.5px] leading-tight text-zinc-400 dark:text-zinc-400">{f.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={saving} className="sp-press">
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save timer policy"}
              </Button>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                {dirty
                  ? "· unsaved changes"
                  : activeOverrides.length > 0
                    ? `· ${activeOverrides.length} skill override${activeOverrides.length === 1 ? "" : "s"} active`
                    : "· matching spec defaults"}
              </p>
              {saved.updatedBy && (
                <p className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                  Last updated by {saved.updatedBy}
                  {saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
