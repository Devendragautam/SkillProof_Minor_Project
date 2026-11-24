"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { SAMPLE_RESUME } from "@/lib/sample-resume";
import { toast } from "sonner";
import { ArrowRight, Check, FileText, Loader2, Upload, ClipboardPaste, Wand2, User } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** Hairline progress track with an ink fill and a tiny square marker. */
function InkTrack({ value }: { value: number }) {
  return (
    <div aria-hidden className="relative flex h-2 items-center">
      <span className="absolute h-px w-full bg-zinc-300 dark:bg-zinc-700" />
      <span
        className="absolute h-px bg-zinc-950 dark:bg-zinc-100 transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
      <span
        className="absolute h-2 w-2 -translate-x-1/2 bg-zinc-950 dark:bg-zinc-100 transition-[left] duration-500"
        style={{ left: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function ResumeStep() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Best-effort: candidates rarely fill the identity card first — infer the
  // name from the first meaningful line of the resume text.
  const inferName = (text: string): string => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 3)) {
      const cleaned = line.replace(/[^A-Za-z .'-]/g, "").trim();
      const words = cleaned.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 4 && cleaned.length <= 40) return cleaned;
    }
    return "";
  };

  const handleText = async (text: string, fileName: string) => {
    setExtracting(true);
    setProgress(35);
    try {
      // 1) AI/heuristic skill extraction
      setProgress(60);
      const res = await fetch("/api/skills/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("extraction failed");
      const profile = await res.json();
      setProgress(100);
      store.setResume(text, fileName);
      store.setProfile(profile);
      if (!store.candidateName.trim()) {
        const inferred = inferName(text);
        if (inferred) store.setCandidateInfo(inferred, store.candidateEmail);
      }
      store.setCandidateStep("skills");
      toast.success(
        profile.source === "ai" ? "Resume analyzed — skill profile extracted" : "Resume processed with heuristic extraction",
        { description: `${profile.skills.length} skills identified.` }
      );
    } catch {
      toast.error("Skill extraction failed. Please try again.");
    } finally {
      setExtracting(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  const extractFile = async (file: File) => {
    setExtracting(true);
    setProgress(20);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/resume/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "extraction failed");
      await handleText(data.text, file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read this file");
      setExtracting(false);
      setProgress(0);
    }
  };

  const extractPasted = async () => {
    if (pastedText.trim().length < 60) {
      toast.error("Paste at least a few lines of your resume");
      return;
    }
    await handleText(pastedText, "pasted-resume.txt");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <StepHeader
        step={0}
        kicker="Dossier · Step 1 of 4"
        title={
          <>
            Upload your <em className="text-[#5c7250] dark:text-[#a9c29b]">resume</em>
          </>
        }
        note="Confidential — nothing leaves your assessment context"
      />

      {/* resume already analyzed — on-file card */}
      {store.profile && (
        <div className="mb-8 border border-zinc-300 dark:border-zinc-700 bg-card">
          <p className="border-b border-zinc-200 dark:border-zinc-700 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Already on file — analyzed {store.profile.source === "ai" ? "with AI extraction" : "with keyword heuristics"}
          </p>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-zinc-950 dark:bg-zinc-100">
              <FileText className="h-4.5 w-4.5 text-[#faf7f0] dark:text-zinc-950" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[17px] text-zinc-900 dark:text-zinc-100">{store.resumeFileName || "Pasted resume text"}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                {store.profile.skills.length} skills claimed · continue to review
              </p>
            </div>
            <Button size="sm" onClick={() => store.setCandidateStep("skills")} className="sp-press shrink-0">
              Continue <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className={cn("mb-8 transition-opacity", progress === 0 && "pointer-events-none opacity-0")}>
        <InkTrack value={progress} />
      </div>

      <Card className="rounded-md border-border bg-card shadow-none">
        <CardHeader className="border-b border-zinc-200 dark:border-zinc-700">
          <CardTitle className="flex items-center gap-2.5 font-display text-lg tracking-tight text-zinc-900 dark:text-zinc-100">
            <FileText className="h-4.5 w-4.5 text-zinc-400 dark:text-zinc-400" strokeWidth={1.75} /> Resume source
          </CardTitle>
          <CardDescription>PDF or plain text. Nothing leaves your assessment context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* mode tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mode === "upload" ? "default" : "outline"}
              onClick={() => setMode("upload")}
              className={mode === "upload" ? undefined : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload file
            </Button>
            <Button
              size="sm"
              variant={mode === "paste" ? "default" : "outline"}
              onClick={() => setMode("paste")}
              className={mode === "paste" ? undefined : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"}
            >
              <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Paste text
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("paste");
                setPastedText(SAMPLE_RESUME);
                toast.info("Sample resume loaded", { description: "Rahul Sharma — C++, DSA, Python, DBMS, React & more." });
              }}
              className="group ml-auto inline-flex items-center gap-1.5 px-1 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 dark:text-zinc-300 transition-colors hover:text-zinc-950 dark:hover:text-zinc-100"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span className="relative">
                Use sample resume
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-zinc-300 dark:bg-zinc-700" />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-[#5c7250] transition-transform duration-300 ease-out group-hover:scale-x-100"
                />
              </span>
            </button>
          </div>

          {mode === "upload" ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload resume file"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void extractFile(f);
              }}
              className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border px-6 py-14 text-center transition-colors",
                dragOver ? "border-[#5c7250] bg-[#faf7f0] dark:bg-zinc-900" : "border-zinc-300 dark:border-zinc-700 bg-card hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              )}
            >
              {/* inner hairline of the double frame */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-[5px] rounded-sm border",
                  dragOver ? "border-[#5c7250]/40" : "border-zinc-200 dark:border-zinc-700"
                )}
              />
              {/* folded paper corner */}
              <span
                aria-hidden
                className="pointer-events-none absolute right-0 top-0 h-8 w-8 bg-zinc-100 dark:bg-zinc-800 [clip-path:polygon(0_0,100%_0,100%_100%)]"
              />
              <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-8 w-8">
                <span className="absolute left-0 top-0 h-px w-[45px] origin-top-left rotate-45 bg-zinc-300 dark:bg-zinc-700" />
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void extractFile(f);
                }}
              />
              {extracting ? (
                <Loader2 className="h-9 w-9 animate-spin text-[#5c7250] dark:text-[#a9c29b]" strokeWidth={1.5} />
              ) : (
                <Upload className="h-9 w-9 text-zinc-400 dark:text-zinc-400" strokeWidth={1.5} />
              )}
              <p className="mt-5 font-display text-xl tracking-tight text-zinc-900 dark:text-zinc-100">
                {extracting ? "Extracting resume content…" : "Drop your resume on the tray"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{extracting ? "This takes a moment" : "or click to browse your files"}</p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-400">
                PDF · TXT · MD — max ~60k characters
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Paste your resume text
              </p>
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste your full resume text here — skills, projects, experience, certifications…"
                className="min-h-48 border-zinc-300 dark:border-zinc-700 font-mono text-[13px]"
              />
              <div className="flex justify-end">
                <Button onClick={() => void extractPasted()} disabled={extracting} className="sp-press font-semibold">
                  {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  Analyze resume
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 rounded-md border-border bg-card shadow-none">
        <CardHeader className="border-b border-zinc-200 dark:border-zinc-700">
          <CardTitle className="flex items-center gap-2.5 font-display text-lg tracking-tight text-zinc-900 dark:text-zinc-100">
            <User className="h-4.5 w-4.5 text-zinc-400 dark:text-zinc-400" strokeWidth={1.75} /> Candidate identity
          </CardTitle>
          <CardDescription>Shown on the verified profile reviewed by recruiters.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cand-name">Full name</Label>
            <Input
              id="cand-name"
              value={store.candidateName}
              onChange={(e) => store.setCandidateInfo(e.target.value, store.candidateEmail)}
              placeholder="e.g. Rahul Sharma"
              className="border-zinc-300 dark:border-zinc-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cand-email">Email (optional)</Label>
            <Input
              id="cand-email"
              type="email"
              value={store.candidateEmail}
              onChange={(e) => store.setCandidateInfo(store.candidateName, e.target.value)}
              placeholder="you@example.com"
              className="border-zinc-300 dark:border-zinc-700"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
