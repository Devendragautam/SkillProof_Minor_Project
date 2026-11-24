"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProctorTranscriptCard } from "@/components/skillproof/proctor-transcript-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { LiveMonitor } from "@/components/skillproof/live-monitor";
import { InsightsPanel } from "@/components/skillproof/insights-panel";
import { QuestionBankPanel } from "@/components/skillproof/question-bank";
import { TimerPolicyPanel } from "@/components/skillproof/timer-policy-panel";
import { useStore } from "@/lib/store";
import {
  ConfidenceBadge,
  EvidenceBar,
  ProofGraph,
  RadarChart,
  RiskBadge,
  ScoreRing,
  scoreColor,
  useCountUp,
} from "@/components/skillproof/shared";
import { CodeEvolutionIfOpen } from "@/components/skillproof/code-evolution";
import {
  getProctorStatusSnapshot,
  subscribeProctorStatus,
  type ProctorStatus,
} from "@/lib/proctor";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Award,
  Bell,
  BookOpen,
  Bug,
  Check,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CircleSlash,
  Cog,
  Copy,
  Crown,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  FolderDown,
  GitCompareArrows,
  GitMerge,
  Handshake,
  History,
  Hourglass,
  Layers,
  LayoutDashboard,
  LineChart,
  Link2,
  Loader2,
  Clock,
  LogOut,
  MailPlus,
  Palette,
  Pencil,
  Radio,
  Route,
  RotateCcw,
  Scale,
  ScanSearch,
  Search,
  SearchCode,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  StickyNote,
  Tag,
  Target,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wrench,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AttemptRecord } from "@/app/api/attempts/route";
import type { AuthUser } from "@/lib/store";
import type { AssessmentReport, BreakdownItem, CategoryScores, SkillResult } from "@/lib/types";
import type { PipelineMeta } from "@/lib/pipeline-meta";
import { pipelineMetaSummary } from "@/lib/pipeline-meta";

export interface CandidateRow {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  claimedSkills: Array<{ skill: string; level: string }>;
  assessmentId: string | null;
  completedAt: string | null;
  overall: number | null;
  confidence: string | null;
  aiRisk: number | null;
  aiRiskConfidence: string | null;
  skills: Array<{ skill: string; score: number; confidence: string; assessed: boolean }>;
  categories: CategoryScores | null;
  difficultyMix: {
    easy: { n: number; score: number | null };
    medium: { n: number; score: number | null };
    hard: { n: number; score: number | null };
  } | null;
  notes: string;
  tags: string[];
  archived: boolean;
  invited: boolean;
  attemptCount: number;
  /** Verification code if the completed assessment already carries an issued certificate */
  certificateCode: string | null;
  /** Recruiter pipeline decision: "shortlisted" | "interview" | "offer" | "rejected" | null */
  pipelineStatus: string | null;
  pipelineNote: string | null;
  /** Structured decision metadata: interview {scheduledAt, panel} / offer {comp, startDate} */
  pipelineMeta: PipelineMeta | null;
  pipelineUpdatedAt: string | null;
  /** All completed verification runs (oldest → newest) for trend charts/sparklines */
  completedRuns: Array<{ date: string; overall: number; confidence: string | null }>;
}

interface AttemptSummary {
  assessmentId: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  overall: number | null;
  confidence: string | null;
}

const COMPARE_COLORS = ["#059669", "#d97706", "#e11d48", "#0d9488", "#db2777"];
const MAX_COMPARE = 5;

/** Live-tab connection dot — reflects the real proctor socket state. */
function LiveTabDot() {
  const status: ProctorStatus = useSyncExternalStore(
    subscribeProctorStatus,
    getProctorStatusSnapshot,
    () => "connecting"
  );
  const color =
    status === "live" ? "bg-emerald-600" : status === "offline" ? "bg-rose-500" : "bg-amber-500";
  const label =
    status === "live"
      ? "Proctor stream connected"
      : status === "offline"
        ? "Proctor stream offline — reconnecting"
        : "Connecting to proctor stream";
  return (
    <span
      className={cn("sp-live-dot h-1.5 w-1.5 rounded-full", color)}
      role="status"
      aria-label={label}
      title={label}
    />
  );
}

type SortKey = "recent" | "score-desc" | "score-asc" | "risk-asc" | "name-asc" | "hard-desc";

type DiffFilter = "all" | "attempted-hard" | "strong-hard" | "weak-hard";

/** Difficulty-performance filter over the report breakdown mix */
function matchesDiffFilter(r: CandidateRow, f: DiffFilter): boolean {
  if (f === "all") return true;
  const hard = r.difficultyMix?.hard;
  if (!hard || hard.n === 0) return false;
  if (f === "attempted-hard") return true;
  if (f === "strong-hard") return (hard.score ?? -1) >= 70;
  if (f === "weak-hard") return (hard.score ?? 101) < 50;
  return true;
}

// ─── Role-fit weights ───────────────────────────────────────────────────────

type CategoryKey = keyof CategoryScores;

const CATEGORY_KEYS: CategoryKey[] = [
  "problemSolving",
  "debugging",
  "efficiency",
  "codeQuality",
  "explanation",
  "timeManagement",
  "consistency",
];

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  problemSolving: "Problem solving",
  debugging: "Debugging",
  efficiency: "Efficiency",
  codeQuality: "Code quality",
  explanation: "Explanation",
  timeManagement: "Time management",
  consistency: "Consistency",
};

export type FitWeights = Record<CategoryKey, number>;

export interface RolePreset {
  id: string;
  label: string;
  blurb: string;
  weights: FitWeights;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "balanced",
    label: "Balanced",
    blurb: "Default verification weights",
    weights: { problemSolving: 30, debugging: 15, efficiency: 15, codeQuality: 15, explanation: 5, timeManagement: 5, consistency: 15 },
  },
  {
    id: "backend",
    label: "Backend engineer",
    blurb: "Algorithms, efficiency, robust debugging",
    weights: { problemSolving: 35, debugging: 15, efficiency: 20, codeQuality: 15, explanation: 5, timeManagement: 5, consistency: 5 },
  },
  {
    id: "frontend",
    label: "Frontend engineer",
    blurb: "Code quality, communication, consistency",
    weights: { problemSolving: 20, debugging: 10, efficiency: 10, codeQuality: 30, explanation: 15, timeManagement: 5, consistency: 10 },
  },
  {
    id: "fullstack",
    label: "Full-stack engineer",
    blurb: "Even spread with quality emphasis",
    weights: { problemSolving: 25, debugging: 15, efficiency: 15, codeQuality: 20, explanation: 10, timeManagement: 5, consistency: 10 },
  },
  {
    id: "qa",
    label: "QA / debugger",
    blurb: "Bug-finding depth and clean fixes",
    weights: { problemSolving: 15, debugging: 35, efficiency: 10, codeQuality: 20, explanation: 10, timeManagement: 5, consistency: 5 },
  },
  {
    id: "platform",
    label: "Platform / data",
    blurb: "Performance-critical problem solving",
    weights: { problemSolving: 30, debugging: 10, efficiency: 30, codeQuality: 15, explanation: 5, timeManagement: 5, consistency: 5 },
  },
];

/** Weighted fit 0-100 from raw category scores; null when no verified categories */
export function computeFitFromCategories(
  categories: CategoryScores | null | undefined,
  weights: FitWeights
): number | null {
  if (!categories) return null;
  const totalW = CATEGORY_KEYS.reduce((a, k) => a + weights[k], 0);
  if (totalW <= 0) return null;
  const acc = CATEGORY_KEYS.reduce((a, k) => a + (categories[k] ?? 0) * weights[k], 0);
  return Math.round(acc / totalW);
}

export function computeFit(r: CandidateRow, weights: FitWeights): number | null {
  return computeFitFromCategories(r.categories, weights);
}

// ─── Recruiter workspace shell ──────────────────────────────────────────────
// App-shell layout: sticky left sidebar (lg+) + main column with a workspace
// top bar. Navigation stays real Radix Tabs (controlled, so the top-bar search
// and notification menu can switch tabs programmatically); the vertical
// sidebar list and the flat mobile bar are two TabsLists over the same values.

type RecruiterTab =
  | "overview"
  | "candidates"
  | "assessments"
  | "questions"
  | "live"
  | "reports"
  | "certificates"
  | "settings";

const NAV_ITEMS: Array<{ value: RecruiterTab; label: string; icon: LucideIcon }> = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "candidates", label: "Candidates", icon: Users },
  { value: "assessments", label: "Assessments", icon: ClipboardList },
  { value: "questions", label: "Question Bank", icon: BookOpen },
  { value: "live", label: "Live Monitoring", icon: Radio },
  { value: "reports", label: "Reports", icon: FileText },
  { value: "certificates", label: "Certificates", icon: Award },
  { value: "settings", label: "Settings", icon: Cog },
];

const TABLE_HEAD = "h-9 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** One-line mono reasons a completed run deserves recruiter attention. */
function reviewReasons(r: CandidateRow): string[] {
  const reasons: string[] = [];
  if ((r.aiRisk ?? 0) >= 40) reasons.push(`AI risk ${Math.round(r.aiRisk ?? 0)} · review advised`);
  if (r.confidence === "LOW") reasons.push("Low confidence evidence");
  if (r.pipelineStatus == null) reasons.push("Awaiting pipeline decision");
  return reasons;
}

/** Notification + overview rule: completed run AND (risk ≥ 40 OR low confidence OR undecided). */
function needsReview(r: CandidateRow): boolean {
  return r.assessmentId != null && r.overall != null && !r.archived && reviewReasons(r).length > 0;
}

/** Compact mono timestamp for registers. */
function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact page header replacing the old double-rule masthead — mono kicker, display title, one muted line. */
function PageHeader({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 bg-[#5c7250]" />
        {kicker}
      </p>
      <h1 className="mt-1.5 font-display text-2xl tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/** Mono uppercase section heading with a trailing hairline rule. */
function SectionRule({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> : null}
        {children}
      </h2>
      <div aria-hidden className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export function RecruiterDashboard() {
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [tab, setTab] = useState<RecruiterTab>("overview");
  const [search, setSearch] = useState("");

  // Shared /api/attempts register — fetched lazily on the first Assessments or
  // Reports visit, cached for the session, retryable after a failure.
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const attemptsRequestedRef = useRef(false);

  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const setView = useStore((s) => s.setView);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/candidates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.candidates);
    } catch {
      toast.error("Failed to load candidates");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAttempts = useCallback(async () => {
    setAttemptsLoading(true);
    setAttemptsError(null);
    try {
      const res = await fetch("/api/attempts");
      const data = (await res.json().catch(() => null)) as { attempts?: AttemptRecord[]; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Failed to load the assessment register");
      const list = data?.attempts ?? [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setAttempts(list);
    } catch (e) {
      setAttemptsError(e instanceof Error ? e.message : "Failed to load the assessment register");
    } finally {
      setAttemptsLoading(false);
    }
  }, []);

  // Lazy one-time fetch — the register powers both Assessments and Reports.
  useEffect(() => {
    if ((tab === "assessments" || tab === "reports") && !attemptsRequestedRef.current) {
      attemptsRequestedRef.current = true;
      void loadAttempts();
    }
  }, [tab, loadAttempts]);

  const reviewList = useMemo(
    () =>
      (rows ?? [])
        .filter(needsReview)
        .sort(
          (a, b) =>
            (b.aiRisk ?? 0) - (a.aiRisk ?? 0) ||
            new Date(b.completedAt ?? b.createdAt).getTime() -
              new Date(a.completedAt ?? a.createdAt).getTime()
        ),
    [rows]
  );

  // Typing in the global search signals intent to work the register — jump to
  // Candidates (only when there is something to search for).
  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q);
      if (q.trim() !== "" && tab !== "candidates") setTab("candidates");
    },
    [tab]
  );

  // Same logout pattern as the app header's account menu.
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    setView("landing");
    toast("Signed out", { description: "Your session cookie was cleared." });
  }, [setUser, setView]);

  const candidateCount = rows?.length ?? 0;
  const reviewPreview = reviewList.slice(0, 8);
  const ledgerDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as RecruiterTab)}
      className="flex min-h-[calc(100vh-3.5rem)] flex-row gap-0"
    >
      {/* ── sidebar — the workspace register (lg+) ── */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 self-start border-r border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 lg:flex lg:flex-col">
        <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 rounded-none bg-transparent p-3">
          {NAV_ITEMS.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              aria-label={item.label}
              className="group flex h-8 flex-none items-center justify-start gap-2 rounded-sm px-3 text-left text-[13px] font-medium text-zinc-600 dark:text-zinc-300 shadow-none transition-colors hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100 data-[state=active]:bg-zinc-950 data-[state=active]:text-zinc-50 data-[state=active]:shadow-[inset_2px_0_0_#5c7250] dark:data-[state=active]:bg-zinc-100 dark:data-[state=active]:text-zinc-950"
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">{item.label}</span>
              {item.value === "candidates" && (
                <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">
                  {String(candidateCount).padStart(2, "0")}
                </span>
              )}
              {item.value === "live" && <LiveTabDot />}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* signed-in identity — the mono ledger folio */}
        <div className="mt-auto border-t border-zinc-200 dark:border-zinc-700 p-3">
          <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-300">{user?.name ?? "Signed in recruiter"}</p>
          <p className="mt-1 font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
            {user?.role ?? "recruiter"}
            <br />
            ledger opened · {ledgerDate}
          </p>
        </div>
      </aside>

      {/* ── main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-6xl">
            {/* mobile nav — flat scrollable register bar (below lg) */}
            <TabsList className="mb-4 flex h-10 w-full max-w-full items-center justify-start gap-1 overflow-x-auto rounded-none border-b border-zinc-200 dark:border-zinc-700 bg-card p-0 px-2 [scrollbar-width:none] sm:px-3 lg:hidden [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  aria-label={item.label}
                  className="flex h-full flex-none items-center gap-1.5 rounded-none border-0 bg-transparent px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 shadow-none transition-colors hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-950 dark:hover:text-zinc-100 data-[state=active]:bg-transparent data-[state=active]:text-zinc-950 data-[state=active]:shadow-[inset_0_-2px_0_0_#5c7250] dark:data-[state=active]:text-zinc-100"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
                  <span className="hidden sm:inline">{item.label}</span>
                  {item.value === "candidates" && (
                    <span className="hidden font-mono text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400 sm:inline">
                      {String(candidateCount).padStart(2, "0")}
                    </span>
                  )}
                  {item.value === "live" && <LiveTabDot />}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* workspace top bar — global search · review alerts · account */}
            <div className="mb-6 flex h-10 items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 sm:gap-3">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search candidates…"
                  aria-label="Search candidates"
                  className="h-8 border-zinc-300 dark:border-zinc-700 bg-card pl-8 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
              </div>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                {/* review notifications — completed runs that need a look */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="relative flex h-8 w-8 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-card transition-colors hover:border-zinc-400 dark:hover:border-zinc-500"
                      aria-label={
                        reviewList.length > 0
                          ? `Notifications — ${reviewList.length} candidates need review`
                          : "Notifications — nothing needs review"
                      }
                    >
                      <Bell className="h-4 w-4 text-zinc-700 dark:text-zinc-300" strokeWidth={1.5} aria-hidden />
                      {reviewList.length > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-0.5 font-mono text-[9px] font-semibold leading-none tabular-nums text-zinc-700 dark:text-zinc-300">
                          {reviewList.length}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 rounded-md border-zinc-300 dark:border-zinc-700 shadow-none">
                    <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Needs review
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800" />
                    {reviewList.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-muted-foreground">Nothing needs review right now.</p>
                    ) : (
                      <>
                        {reviewPreview.map((r) => (
                          <DropdownMenuItem
                            key={r.id}
                            onClick={() => setTab("candidates")}
                            className="flex-col items-start gap-0.5 py-2 focus:bg-zinc-950/5 dark:focus:bg-zinc-100/10"
                          >
                            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{r.name}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                              {reviewReasons(r)[0]}
                            </span>
                          </DropdownMenuItem>
                        ))}
                        {reviewList.length > reviewPreview.length && (
                          <p className="border-t border-zinc-200 dark:border-zinc-700 px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            +{reviewList.length - reviewPreview.length} more in Candidates
                          </p>
                        )}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* account chip — mirrors the app header's account menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex h-8 items-center gap-2 border border-zinc-300 dark:border-zinc-700 bg-card pl-1 pr-2 transition-[border-color,box-shadow] duration-200 hover:border-zinc-400 dark:hover:border-zinc-500 hover:ring-1 hover:ring-zinc-950/10 dark:hover:ring-zinc-100/10"
                      aria-label="Workspace account menu"
                    >
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center bg-[#5c7250] font-mono text-[10px] font-semibold text-[#faf7f0]"
                      >
                        {initialsOf(user?.name ?? "SP")}
                      </span>
                      <span className="hidden max-w-[10ch] truncate text-xs font-medium text-zinc-800 dark:text-zinc-300 sm:block">
                        {(user?.name ?? "Workspace").split(/\s+/)[0]}
                      </span>
                      <ChevronDown className="h-3 w-3 text-zinc-400 dark:text-zinc-400" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-md border-zinc-300 dark:border-zinc-700 shadow-none">
                    <DropdownMenuLabel className="font-normal">
                      <span className="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                        {user?.name ?? "Signed in recruiter"}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {user?.email ?? "—"}
                      </span>
                      <span className="mt-1.5 inline-block border border-[#5c7250]/30 bg-[#5c7250]/5 dark:bg-[#5c7250]/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#5c7250] dark:text-[#a9c29b]">
                        {user?.role ?? "recruiter"}
                      </span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800" />
                    <DropdownMenuItem
                      className="text-[13px] text-zinc-700 dark:text-zinc-300 focus:bg-zinc-950/5 dark:focus:bg-zinc-100/10 focus:text-zinc-950 dark:focus:text-zinc-100"
                      onClick={() => void signOut()}
                    >
                      <LogOut className="mr-2 h-3.5 w-3.5" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <TabsContent value="overview" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Overview"
                title="Evidence, weighed for decisions."
                description="A decision-first read of the cohort — start with what needs review, then compare verified runs."
              />
              <OverviewSection rows={rows} reviewList={reviewList} onOpenCandidates={() => setTab("candidates")} />
            </TabsContent>

            <TabsContent value="candidates" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Candidates"
                title="Candidates"
                description="Every candidate with their latest verified evidence — search, filter, compare and decide."
              />
              <CandidateBoard rows={rows} reload={load} searchQuery={search} onSearchQueryChange={handleSearch} />
            </TabsContent>

            <TabsContent value="assessments" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Assessments"
                title="Assessments"
                description="The full register of assessment runs across every candidate — completed, in progress or stalled."
              />
              <AssessmentsSection
                attempts={attempts}
                loading={attemptsLoading}
                error={attemptsError}
                onRetry={() => void loadAttempts()}
                onOpenCandidates={() => setTab("candidates")}
              />
            </TabsContent>

            <TabsContent value="questions" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Question bank"
                title="Question Bank"
                description="Curated and recruiter-authored questions behind the adaptive assessments."
              />
              <QuestionBankPanel />
            </TabsContent>

            <TabsContent value="live" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Live monitoring"
                title="Live Monitoring"
                description="Disclosed, real-time activity from assessments in progress."
              />
              <LiveMonitor />
            </TabsContent>

            <TabsContent value="reports" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Reports"
                title="Reports"
                description="Completed verification reports — open one, export its PDF, or bundle the whole register."
              />
              <ReportsSection
                attempts={attempts}
                loading={attemptsLoading}
                error={attemptsError}
                onRetry={() => void loadAttempts()}
                onOpenCandidates={() => setTab("candidates")}
              />
            </TabsContent>

            <TabsContent value="certificates" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Certificates"
                title="Certificates"
                description="Issue and manage verifiable skill certificates with public proof pages."
              />
              <CertificatesPanel rows={rows} reload={load} />
            </TabsContent>

            <TabsContent value="settings" className="mt-0">
              <PageHeader
                kicker="Recruiter workspace · Settings"
                title="Settings"
                description="Workspace identity and the org-wide assessment policy."
              />
              <SettingsSection user={user} />
            </TabsContent>
          </div>
        </div>
      </div>
    </Tabs>
  );
}

// ─── Overview tab — decision-first summary ──────────────────────────────────

/** Flat stat block for the hairline KPI grid. */
function KpiCell({ label, value, sub, mono, className }: { label: string; value: string; sub: string; mono?: boolean; className?: string }) {
  return (
    <div className={cn("bg-card p-4", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-3xl leading-none tabular-nums text-zinc-900 dark:text-zinc-100", mono ? "font-mono" : "font-display")}>
        {value}
      </p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{sub}</p>
    </div>
  );
}

function OverviewSection({
  rows,
  reviewList,
  onOpenCandidates,
}: {
  rows: CandidateRow[] | null;
  reviewList: CandidateRow[];
  onOpenCandidates: () => void;
}) {
  const all = useMemo(() => rows ?? [], [rows]);
  const completedCount = useMemo(() => all.filter((r) => r.overall != null).length, [all]);
  const activeCompleted = useMemo(
    () => all.filter((r) => r.overall != null && !r.archived),
    [all]
  );

  const completionPct = all.length > 0 ? Math.round((completedCount / all.length) * 100) : 0;
  const avgScore = completedCount
    ? (all.reduce((a, r) => a + (r.overall ?? 0), 0) / completedCount).toFixed(1)
    : null;
  const highConfCount = activeCompleted.filter((r) => r.confidence === "HIGH").length;
  const pendingPipeline = activeCompleted.filter((r) => r.pipelineStatus == null).length;
  const archivedCount = all.filter((r) => r.archived).length;

  const needsReviewRows = useMemo(() => reviewList.slice(0, 5), [reviewList]);
  const topVerified = useMemo(
    () => [...activeCompleted].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).slice(0, 5),
    [activeCompleted]
  );

  return (
    <div className="space-y-10">
      {/* KPI strip — one flat hairline grid, not separate cards */}
      <section aria-label="Workspace totals">
        <div className="grid grid-cols-2 gap-px border border-zinc-200 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-800 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCell label="Candidates" value={String(all.length)} sub={`${archivedCount} archived in the register`} />
          <KpiCell
            label="Assessment completion"
            value={`${completionPct}%`}
            sub={`${completedCount} of ${all.length} candidates completed`}
          />
          <KpiCell
            label="Avg verification score"
            value={avgScore ?? "—"}
            sub={`across ${completedCount} verified run${completedCount === 1 ? "" : "s"}`}
            mono
          />
          <KpiCell
            label="High confidence"
            value={String(highConfCount)}
            sub={`${Math.max(activeCompleted.length - highConfCount, 0)} at medium or low confidence`}
          />
          <KpiCell
            className="col-span-2 sm:col-span-2 lg:col-span-1"
            label="Requires review"
            value={String(reviewList.length)}
            sub={pendingPipeline > 0 ? `${pendingPipeline} awaiting pipeline decision` : "every run has a decision"}
          />
        </div>
      </section>

      {/* needs review first — the triage queue */}
      <section aria-label="Needs review first">
        <SectionRule>Needs review first</SectionRule>
        {needsReviewRows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            {completedCount === 0
              ? "No completed verifications yet — evidence will collect here as candidates finish."
              : "All reviewed candidates have a pipeline decision."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-200 dark:border-zinc-700 hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>Candidate</TableHead>
                <TableHead className={TABLE_HEAD}>Score</TableHead>
                <TableHead className={TABLE_HEAD}>Confidence</TableHead>
                <TableHead className={cn(TABLE_HEAD, "hidden md:table-cell")}>AI risk</TableHead>
                <TableHead className={cn(TABLE_HEAD, "hidden lg:table-cell")}>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {needsReviewRows.map((r) => (
                <TableRow
                  key={r.id}
                  tabIndex={0}
                  onClick={onOpenCandidates}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenCandidates();
                    }
                  }}
                  aria-label={`${r.name} needs review — open the candidates register`}
                  className="cursor-pointer border-zinc-200 dark:border-zinc-700 outline-none transition-colors hover:bg-zinc-950/[0.03] dark:hover:bg-zinc-100/[0.06] focus-visible:bg-zinc-950/5 dark:focus-visible:bg-zinc-100/10"
                >
                  <TableCell className="h-10 py-2">
                    <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{r.name}</span>
                    {r.email && (
                      <span className="ml-2 hidden font-mono text-[10px] text-zinc-400 dark:text-zinc-400 xl:inline">{r.email}</span>
                    )}
                  </TableCell>
                  <TableCell
                    className="h-10 py-2 font-mono text-sm tabular-nums"
                    style={{ color: r.overall != null ? scoreColor(r.overall) : undefined }}
                  >
                    {r.overall ?? "—"}
                  </TableCell>
                  <TableCell className="h-10 py-2">
                    <ConfidenceBadge level={r.confidence} />
                  </TableCell>
                  <TableCell className="hidden h-10 py-2 md:table-cell">
                    {r.aiRisk != null ? <RiskBadge risk={r.aiRisk} /> : <span className="font-mono text-xs text-zinc-400 dark:text-zinc-400">—</span>}
                  </TableCell>
                  <TableCell className="hidden h-10 py-2 text-xs text-muted-foreground lg:table-cell">
                    {reviewReasons(r).join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* top verified — the strongest evidence in the cohort */}
      <section aria-label="Top verified">
        <SectionRule>Top verified</SectionRule>
        {topVerified.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No verified runs yet — scores appear once candidates complete an assessment.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-200 dark:border-zinc-700 hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>Candidate</TableHead>
                <TableHead className={TABLE_HEAD}>Score</TableHead>
                <TableHead className={TABLE_HEAD}>Evidence</TableHead>
                <TableHead className={cn(TABLE_HEAD, "hidden sm:table-cell")}>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topVerified.map((r) => (
                <TableRow
                  key={r.id}
                  tabIndex={0}
                  onClick={onOpenCandidates}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenCandidates();
                    }
                  }}
                  aria-label={`${r.name} verified ${r.overall} — open the candidates register`}
                  className="cursor-pointer border-zinc-200 dark:border-zinc-700 outline-none transition-colors hover:bg-zinc-950/[0.03] dark:hover:bg-zinc-100/[0.06] focus-visible:bg-zinc-950/5 dark:focus-visible:bg-zinc-100/10"
                >
                  <TableCell className="h-10 py-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{r.name}</TableCell>
                  <TableCell
                    className="h-10 py-2 font-mono text-sm tabular-nums"
                    style={{ color: scoreColor(r.overall ?? 0) }}
                  >
                    {r.overall}
                  </TableCell>
                  <TableCell className="h-10 w-40 py-2 lg:w-64">
                    <EvidenceBar score={r.overall ?? 0} height="h-1.5" />
                  </TableCell>
                  <TableCell className="hidden h-10 py-2 sm:table-cell">
                    <ConfidenceBadge level={r.confidence} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">How to read this page — </span>
        Score, confidence and AI-assistance risk are evidence summaries compiled from each proctored run. They
        focus your review; they are never auto-verdicts. Open a candidate for the full report before deciding.
      </p>

      {/* deeper analytics — the former Insights tab, preserved in place */}
      <section aria-label="Deeper analytics">
        <SectionRule icon={LineChart}>Deeper analytics</SectionRule>
        <InsightsPanel rows={rows} />
      </section>
    </div>
  );
}

// ─── Assessments tab — the full run register ────────────────────────────────

/** Small mono status badge: completed = emerald, in-progress = amber, anything else = zinc. */
function statusBadge(status: string) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-400">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        completed
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        in progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
      {status.replace(/_/g, " ") || "unknown"}
    </span>
  );
}

function RegisterSkeleton() {
  return (
    <div role="status" aria-label="Loading the register">
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-zinc-200 dark:border-zinc-700 py-3.5">
            <Skeleton className="h-3.5 w-44 shrink-0" />
            <Skeleton className="h-3.5 w-28 shrink-0" />
            <Skeleton className="h-3.5 w-20 shrink-0" />
            <Skeleton className="ml-auto hidden h-3.5 w-24 shrink-0 sm:block" />
          </div>
        ))}
      </div>
      <p className="sr-only">Loading the register…</p>
    </div>
  );
}

function RegisterErrorState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-card p-8 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Register unavailable</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        The register could not be loaded{error ? ` — ${error}` : ""}. Your session may have expired.
      </p>
      <Button size="sm" variant="outline" className="mt-4 border-zinc-300 dark:border-zinc-700" onClick={onRetry}>
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Retry
      </Button>
    </div>
  );
}

function AssessmentsSection({
  attempts,
  loading,
  error,
  onRetry,
  onOpenCandidates,
}: {
  attempts: AttemptRecord[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenCandidates: () => void;
}) {
  if (loading) return <RegisterSkeleton />;
  if (error) return <RegisterErrorState error={error} onRetry={onRetry} />;

  const list = attempts ?? [];

  if (list.length === 0) {
    return (
      <div className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-card p-10 text-center">
        <ClipboardList className="mx-auto h-7 w-7 text-zinc-400 dark:text-zinc-400" strokeWidth={1.5} aria-hidden />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          No assessment runs yet — invite a candidate from the Candidates tab and their run registers here the
          moment it starts.
        </p>
        <Button size="sm" variant="outline" className="mt-4 border-zinc-300 dark:border-zinc-700" onClick={onOpenCandidates}>
          Go to Candidates
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-200 dark:border-zinc-700 hover:bg-transparent">
            <TableHead className={TABLE_HEAD}>Assessment</TableHead>
            <TableHead className={TABLE_HEAD}>Candidate</TableHead>
            <TableHead className={TABLE_HEAD}>Status</TableHead>
            <TableHead className={cn(TABLE_HEAD, "hidden md:table-cell")}>Created</TableHead>
            <TableHead className={cn(TABLE_HEAD, "hidden lg:table-cell")}>Completed</TableHead>
            <TableHead className={cn(TABLE_HEAD, "text-right")}>Score</TableHead>
            <TableHead className={cn(TABLE_HEAD, "hidden sm:table-cell")}>Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((a) => (
            <TableRow key={a.assessmentId} className="border-zinc-200 dark:border-zinc-700 hover:bg-zinc-950/[0.03] dark:hover:bg-zinc-100/[0.06]">
              <TableCell className="h-10 py-2">
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300" title={`Assessment ${a.assessmentId}`}>
                  {a.assessmentId}
                </span>
              </TableCell>
              <TableCell className="h-10 py-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{a.candidateName}</TableCell>
              <TableCell className="h-10 py-2">{statusBadge(a.status)}</TableCell>
              <TableCell className="hidden h-10 py-2 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400 md:table-cell">
                {fmtStamp(a.createdAt)}
              </TableCell>
              <TableCell className="hidden h-10 py-2 font-mono text-xs tabular-nums text-zinc-500 dark:text-zinc-400 lg:table-cell">
                {a.completedAt ? fmtStamp(a.completedAt) : "—"}
              </TableCell>
              <TableCell
                className="h-10 py-2 text-right font-mono text-sm tabular-nums"
                style={{ color: a.overall != null ? scoreColor(a.overall) : undefined }}
              >
                {a.overall ?? "—"}
              </TableCell>
              <TableCell className="hidden h-10 py-2 sm:table-cell">
                <ConfidenceBadge level={a.confidence} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {list.length} run{list.length === 1 ? "" : "s"} · newest first
      </p>
    </div>
  );
}

// ─── Reports tab — completed verification reports ───────────────────────────

function ReportsSection({
  attempts,
  loading,
  error,
  onRetry,
  onOpenCandidates,
}: {
  attempts: AttemptRecord[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenCandidates: () => void;
}) {
  const [exporting, setExporting] = useState(false);

  // Only runs with a completed report can be opened or exported — the API's
  // report join yields `overall` exactly when a report exists.
  const reported = useMemo(
    () =>
      (attempts ?? [])
        .filter((a) => a.status === "completed" && a.overall != null)
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.createdAt).getTime() -
            new Date(a.completedAt ?? a.createdAt).getTime()
        ),
    [attempts]
  );

  const exportZip = async () => {
    const ids = Array.from(new Set(reported.map((a) => a.candidateId)));
    if (ids.length === 0) {
      toast.error("No completed reports to export yet");
      return;
    }
    const capped = ids.slice(0, 30);
    if (ids.length > capped.length) {
      toast.info(`Bundle export is capped at 30 reports — exporting the ${capped.length} most recent`);
    }
    setExporting(true);
    try {
      const res = await fetch("/api/report/pdf-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: capped }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Bundle export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${capped.length} branded PDF report${capped.length === 1 ? "" : "s"} as a zip bundle`,
        { description: "Each PDF matches the single-report export, with verified share links in the footer." }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bundle export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <RegisterSkeleton />;
  if (error) return <RegisterErrorState error={error} onRetry={onRetry} />;

  if (reported.length === 0) {
    return (
      <div className="border border-dashed border-zinc-300 dark:border-zinc-700 bg-card p-10 text-center">
        <FileText className="mx-auto h-7 w-7 text-zinc-400 dark:text-zinc-400" strokeWidth={1.5} aria-hidden />
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          No completed reports yet — reports appear here when candidates finish their assessment.
        </p>
        <Button size="sm" variant="outline" className="mt-4 border-zinc-300 dark:border-zinc-700" onClick={onOpenCandidates}>
          Go to Candidates
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {reported.length} completed report{reported.length === 1 ? "" : "s"}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting}
          onClick={() => void exportZip()}
          className="h-8 border-zinc-300 dark:border-zinc-700 bg-card font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950 dark:hover:bg-zinc-100 hover:text-zinc-50 dark:hover:text-zinc-950"
        >
          {exporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <FolderDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Export all (ZIP)
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-zinc-200 dark:border-zinc-700 hover:bg-transparent">
            <TableHead className={TABLE_HEAD}>Candidate</TableHead>
            <TableHead className={cn(TABLE_HEAD, "hidden md:table-cell")}>Assessment</TableHead>
            <TableHead className={TABLE_HEAD}>Score</TableHead>
            <TableHead className={cn(TABLE_HEAD, "hidden sm:table-cell")}>Confidence</TableHead>
            <TableHead className={cn(TABLE_HEAD, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reported.map((a) => (
            <TableRow key={a.assessmentId} className="border-zinc-200 dark:border-zinc-700 hover:bg-zinc-950/[0.03] dark:hover:bg-zinc-100/[0.06]">
              <TableCell className="h-10 py-2 text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{a.candidateName}</TableCell>
              <TableCell className="hidden h-10 py-2 md:table-cell">
                <span className="font-mono text-xs text-zinc-600 dark:text-zinc-300" title={`Assessment ${a.assessmentId}`}>
                  {a.assessmentId}
                </span>
              </TableCell>
              <TableCell
                className="h-10 py-2 font-mono text-sm tabular-nums"
                style={{ color: a.overall != null ? scoreColor(a.overall) : undefined }}
              >
                {a.overall ?? "—"}
              </TableCell>
              <TableCell className="hidden h-10 py-2 sm:table-cell">
                <ConfidenceBadge level={a.confidence} />
              </TableCell>
              <TableCell className="h-10 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 border-zinc-300 dark:border-zinc-700 px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950 dark:hover:bg-zinc-100 hover:text-zinc-50 dark:hover:text-zinc-950"
                  >
                    <a href={`/?report=${a.assessmentId}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-1 h-3 w-3" aria-hidden />
                      Open report
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 border-zinc-300 dark:border-zinc-700 px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950 dark:hover:bg-zinc-100 hover:text-zinc-50 dark:hover:text-zinc-950"
                  >
                    <a
                      href={`/api/report/${a.assessmentId}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Download the PDF report for ${a.candidateName}`}
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden />
                      PDF
                    </a>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Settings tab — workspace identity + org-wide policy ────────────────────

function SettingsSection({ user }: { user: AuthUser | null }) {
  const items: Array<{ term: string; value: string }> = [
    { term: "Signed in", value: user?.name ?? "Signed in recruiter" },
    { term: "Email", value: user?.email ?? "—" },
    { term: "Role", value: user?.role ?? "recruiter" },
  ];

  return (
    <div className="space-y-10">
      <section aria-label="Workspace">
        <SectionRule>Workspace</SectionRule>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-700 bg-card">
          {items.map((it) => (
            <div key={it.term} className="flex items-baseline gap-4 px-4 py-2.5">
              <dt className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {it.term}
              </dt>
              <dd className="min-w-0 truncate text-sm text-zinc-900 dark:text-zinc-100">{it.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-2xl font-mono text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
          Assessment timer policy and proctoring severity thresholds below apply org-wide — they shape every
          future candidate run.
        </p>
      </section>

      <section aria-label="Assessment policy">
        <SectionRule>Assessment policy</SectionRule>
        <TimerPolicyPanel />
      </section>
    </div>
  );
}

// ─── Certificates panel — issue verifiable skill certificates ───────────────

interface IssuedCertificate {
  code: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  assessmentId: string;
  overall: number;
  confidence: string;
  issuedBy: string;
  issuedAt: string;
}

/**
 * Certificates tab: the single place recruiters go to issue verifiable skill
 * certificates (Tata-NQT-style proficiency scorecards). Two sections —
 * "Ready to issue" (completed verifications without a certificate, one click
 * each) and "Issued" (the registry, with view + verify-link actions).
 */
function CertificatesPanel({ rows, reload }: { rows: CandidateRow[] | null; reload: () => Promise<void> }) {
  const setCertificate = useStore((s) => s.setCertificate);
  const [issued, setIssued] = useState<IssuedCertificate[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadIssued = async () => {
    try {
      const res = await fetch("/api/certificates/list");
      if (res.status === 401 || res.status === 403) {
        toast.error("Sign in as a recruiter to manage certificates");
        setIssued([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIssued(data.certificates);
    } catch {
      toast.error("Failed to load issued certificates");
      setIssued([]);
    }
  };

  useEffect(() => {
    void loadIssued();
  }, []);

  /** Completed verifications that can receive a certificate right now */
  const ready = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.assessmentId && r.overall != null && !r.certificateCode && !r.archived)
        .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)),
    [rows]
  );

  /** One-click issue — idempotent on the server (one certificate per assessment) */
  const issue = async (r: CandidateRow) => {
    if (!r.assessmentId) return;
    setBusyId(r.id);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: r.assessmentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Failed to issue certificate");
      toast.success(
        data.created
          ? `Certificate issued to ${r.name} — verification code ${data.certificate.code}`
          : `Certificate already issued — code ${data.certificate.code}`,
        { description: "Share the verify link — anyone can check authenticity with the code." }
      );
      await reload();
      await loadIssued();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue certificate");
    } finally {
      setBusyId(null);
    }
  };

  /** Open the aesthetic certificate sheet for a code */
  const view = async (code: string) => {
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Certificate not found");
      setCertificate(data.certificate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the certificate");
    }
  };

  const copyLink = async (code: string) => {
    const url = `${window.location.origin}/?cert=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Verify link copied", { description: url });
    } catch {
      toast.error("Could not copy — link: " + url);
    }
  };

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Certificate issuance
        </p>
        <h2 className="mt-1.5 font-display text-2xl tracking-tight text-zinc-900 dark:text-zinc-100">
          Award verified proficiency, <em className="italic text-zinc-600 dark:text-zinc-300">like a placement scorecard</em>
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Certificates carry the candidate&apos;s name, per-skill percentages and a public verification
          code. One per completed assessment — issue with a single click below.
        </p>
      </div>

      {/* ── Ready to issue ── */}
      <Card className="rounded-md py-0">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 py-4">
          <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 bg-[#5c7250]" aria-hidden /> Ready to issue
          </CardTitle>
          <Badge variant="outline" className="ml-auto border-zinc-300 dark:border-zinc-700 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
            {rows === null ? "…" : ready.length}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {rows === null ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : ready.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center gap-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 px-6 py-8 text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Register clear</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">Every completed verification already has its certificate.</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">New completions appear here automatically.</p>
              </div>
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-y-auto">
              {ready.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                    <p className="truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {r.completedAt ? `completed ${fmtDate(r.completedAt)}` : "completed"}
                      {r.confidence ? ` · ${r.confidence.toLowerCase()} confidence` : ""}
                    </p>
                  </div>
                  <span
                    className="font-mono text-base font-bold"
                    style={{ color: scoreColor(r.overall ?? 0) }}
                    title="Overall verified score"
                  >
                    {r.overall}
                    <span className="text-xs font-normal text-zinc-400 dark:text-zinc-400">/100</span>
                  </span>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void issue(r)}
                    title={`Issue a verifiable skill certificate for ${r.name}`}
                    className="sp-press bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                  >
                    {busyId === r.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Award className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Issue certificate
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Issued registry ── */}
      <Card className="rounded-md py-0">
        <CardHeader className="relative flex flex-row items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 py-4">
          <CardTitle className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 bg-[#5c7250]" aria-hidden /> Issued certificates
          </CardTitle>
          {/* ghost AUTHENTIC stamp — echoes the wax stamp on the certificate sheet */}
          <span
            aria-hidden
            className="ml-auto hidden -rotate-3 select-none items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-zinc-200 sm:flex dark:text-zinc-600"
          >
            <ShieldCheck className="h-3 w-3" /> Authentic
          </span>
          <Badge variant="outline" className="ml-0 border-zinc-300 dark:border-zinc-700 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 sm:ml-2">
            {issued === null ? "…" : issued.length}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {issued === null ? (
            <div className="space-y-2 p-4">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : issued.length === 0 ? (
            <div className="p-4">
              <div className="flex flex-col items-center gap-1.5 border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 px-6 py-8 text-center">
                <Award className="h-5 w-5 text-zinc-400 dark:text-zinc-400" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">No entries</p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">No certificates issued yet.</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Issue one above, or from any candidate&apos;s verified report.
                </p>
              </div>
            </div>
          ) : (
            <ul className="max-h-96 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-y-auto">
              {issued.map((c) => (
                <li key={c.code} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.candidateName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="rounded-sm border border-zinc-200 dark:border-zinc-700 bg-[#faf7f0] px-1.5 py-px font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{c.code}</span>
                      issued {fmtDate(c.issuedAt)} · by {c.issuedBy}
                    </p>
                  </div>
                  <span
                    className="font-mono text-sm font-bold"
                    style={{ color: scoreColor(c.overall) }}
                    title="Overall score snapshotted at issue time"
                  >
                    {c.overall}
                    <span className="text-xs font-normal text-zinc-400 dark:text-zinc-400">/100</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void view(c.code)}
                      className="h-8 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void copyLink(c.code)}
                      aria-label={`Copy verify link for ${c.candidateName} (${c.code})`}
                      title="Copy public verify link"
                      className="h-8 w-8 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Candidates board — filters, compare, table, CSV, notes/tags ───────────

/**
 * Recruiter invite dialog: create a placeholder profile and share the link.
 * The candidate opens /?invite=<id>, uploads their resume, and their verified
 * results land on this profile.
 */
function InviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setNote("");
    setCreated(null);
    setCopied(false);
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Enter the candidate's name");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/candidates/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create the invite");
      setCreated(data.candidate);
      onCreated();
      toast.success(`Invite ready for ${data.candidate.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create the invite");
    } finally {
      setBusy(false);
    }
  };

  const inviteUrl = created
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?invite=${created.id}`
    : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Invite link copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select the link and copy manually");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Invite ready for {created.name}
              </DialogTitle>
              <DialogDescription>
                Send this link to the candidate. When they open it, the flow is bound to their profile — resume,
                attempts and the verified report all land here.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2">
                <Link2 className="ml-1 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <input
                  readOnly
                  value={inviteUrl}
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full bg-transparent font-mono text-xs text-emerald-800 dark:text-emerald-400 outline-none"
                />
                <Button size="sm" onClick={copy} className="sp-press h-7 shrink-0 bg-zinc-950 dark:bg-zinc-100 text-xs text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300">
                  {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 underline-offset-4 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Preview the invite flow
                </a>
                <Button size="sm" variant="outline" onClick={() => reset()} className="border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10">
                  Invite someone else
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MailPlus className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Invite a candidate
              </DialogTitle>
              <DialogDescription>
                Create a placeholder profile and share its verification link. No email is sent — copy the link into
                your own message.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="invite-name" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Candidate name <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Patel"
                  className="h-9 border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="invite-email" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Email <span className="text-zinc-500 dark:text-zinc-400">(optional)</span>
                </label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="candidate@company.com"
                  className="h-9 border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="invite-note" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Note <span className="text-zinc-500 dark:text-zinc-400">(optional — saved on the profile)</span>
                </label>
                <Textarea
                  id="invite-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Backend role — please verify Java + SQL before Friday"
                  className="min-h-16 border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => close(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void submit()} disabled={busy} className="sp-press bg-zinc-950 dark:bg-zinc-100 font-medium text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300">
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <MailPlus className="mr-1.5 h-3.5 w-3.5" />}
                  Create invite
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Pipeline decision dialog — shortlist / interview / reject with a note ─

type PipelineDecision = "shortlisted" | "interview" | "offer" | "rejected" | null;

/** Shared stage metadata — pills, dialog options, funnel and timeline all use it */
export const PIPELINE_STAGES: Record<
  "shortlisted" | "interview" | "offer" | "rejected" | "cleared",
  { label: string; icon: React.ReactNode; pillClass: string; iconClass: string }
> = {
  shortlisted: {
    label: "Shortlisted",
    icon: <Star className="h-3 w-3" />,
    pillClass: "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  interview: {
    label: "Interview",
    icon: <CalendarClock className="h-3 w-3" />,
    pillClass: "border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40",
    iconClass: "text-violet-600 dark:text-violet-400",
  },
  offer: {
    label: "Offer",
    icon: <Handshake className="h-3 w-3" />,
    pillClass: "border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40",
    iconClass: "text-teal-600 dark:text-teal-400",
  },
  rejected: {
    label: "Rejected",
    icon: <XCircle className="h-3 w-3" />,
    pillClass: "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40",
    iconClass: "text-rose-600 dark:text-rose-400",
  },
  cleared: {
    label: "Decision cleared",
    icon: <Eraser className="h-3 w-3" />,
    pillClass: "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
    iconClass: "text-zinc-500 dark:text-zinc-400",
  },
};

/** Short date label from an ISO yyyy-mm-dd string — "Oct 2" (empty when unparseable). */
function metaDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PipelineDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: CandidateRow | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const [decision, setDecision] = useState<PipelineDecision>(null);
  const [note, setNote] = useState("");
  const [meta, setMeta] = useState<Required<Pick<PipelineMeta, "scheduledAt" | "panel" | "comp" | "startDate">>>({
    scheduledAt: "",
    panel: "",
    comp: "",
    startDate: "",
  });
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; status: string; meta: PipelineMeta | null; createdAt: string }>>([]);

  // previous decision snapshots (reschedule history) — lazy fetch per dialog open
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setHistory([]);
    (async () => {
      try {
        const res = await fetch(`/api/candidates/${target.id}/timeline`);
        const data = await res.json();
        if (!res.ok || cancelled) return;
        setHistory(
          ((data.timeline?.events ?? []) as Array<{ id: string; status: string; meta: PipelineMeta | null; createdAt: string }>)
        );
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  /** Distinct meta summaries for a stage, newest → oldest (max 4). First = the live decision. */
  const metaHistoryLines = (stage: "interview" | "offer"): string[] => {
    const lines: string[] = [];
    for (const e of [...history].reverse()) {
      if (e.status !== stage || !e.meta) continue;
      const s = pipelineMetaSummary(e.meta);
      if (s && !lines.includes(s)) lines.push(s);
      if (lines.length >= 4) break;
    }
    return lines;
  };

  useEffect(() => {
    if (target) {
      setDecision((target.pipelineStatus as PipelineDecision) ?? null);
      setNote(target.pipelineNote ?? "");
      setMeta({
        scheduledAt: target.pipelineMeta?.scheduledAt ?? "",
        panel: target.pipelineMeta?.panel ?? "",
        comp: target.pipelineMeta?.comp ?? "",
        startDate: target.pipelineMeta?.startDate ?? "",
      });
    }
  }, [target]);

  /** Only send the stage-relevant, non-empty meta fields (empty object → null). */
  const cleanedMeta = (): PipelineMeta | null => {
    if (decision === "interview") {
      const m: PipelineMeta = {};
      const panel = (meta.panel ?? "").trim();
      if (meta.scheduledAt) m.scheduledAt = meta.scheduledAt;
      if (panel) m.panel = panel;
      return Object.keys(m).length ? m : null;
    }
    if (decision === "offer") {
      const m: PipelineMeta = {};
      const comp = (meta.comp ?? "").trim();
      if (comp) m.comp = comp;
      if (meta.startDate) m.startDate = meta.startDate;
      return Object.keys(m).length ? m : null;
    }
    return null;
  };

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineStatus: decision,
          ...(decision ? { pipelineNote: note, pipelineMeta: cleanedMeta() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(
        decision === "shortlisted"
          ? `${target.name} shortlisted`
          : decision === "interview"
            ? meta.scheduledAt
              ? `${target.name} moved to interview — ${new Date(`${meta.scheduledAt}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : `${target.name} moved to interview`
            : decision === "offer"
              ? meta.comp
                ? `Offer extended to ${target.name} — ${meta.comp}`
                : `Offer extended to ${target.name}`
              : decision === "rejected"
                ? `${target.name} marked as rejected`
                : `Pipeline decision cleared for ${target.name}`
      );
      onOpenChange(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the decision");
    } finally {
      setBusy(false);
    }
  };

  const options: Array<{ value: "shortlisted" | "interview" | "offer" | "rejected" | "none"; label: string; icon: React.ReactNode; hint: string }> = [
    { value: "shortlisted", label: "Shortlisted", icon: <Star className="h-3.5 w-3.5" />, hint: "Move forward — strong verified evidence" },
    { value: "interview", label: "Interview", icon: <CalendarClock className="h-3.5 w-3.5" />, hint: "Schedule the technical round" },
    { value: "offer", label: "Offer", icon: <Handshake className="h-3.5 w-3.5" />, hint: "Offer extended — final win stage" },
    { value: "rejected", label: "Rejected", icon: <XCircle className="h-3.5 w-3.5" />, hint: "Not moving forward with this profile" },
    { value: "none", label: "No decision", icon: <CircleSlash className="h-3.5 w-3.5" />, hint: "Clear the decision and note" },
  ];

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" /> Pipeline decision — {target?.name}
          </DialogTitle>
          <DialogDescription>
            Record where this candidate stands in your hiring pipeline. Decisions are private to your team and
            export with the CSV.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup
            value={decision ?? "none"}
            onValueChange={(v) =>
              setDecision(v === "none" ? null : (v as "shortlisted" | "interview" | "offer" | "rejected"))
            }
            className="gap-2"
          >
            {options.map((o) => (
              <Label
                key={o.value}
                htmlFor={`pipeline-${o.value}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  (decision ?? "none") === o.value
                    ? o.value === "shortlisted"
                      ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40"
                      : o.value === "interview"
                        ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40"
                        : o.value === "offer"
                          ? "border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40"
                          : o.value === "rejected"
                            ? "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40"
                            : "border-zinc-400 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800"
                    : "border-zinc-200 dark:border-zinc-700 bg-transparent hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                )}
              >
                <RadioGroupItem
                  id={`pipeline-${o.value}`}
                  value={o.value}
                  className={cn(
                    "mt-0.5 border-zinc-400 dark:border-zinc-600",
                    o.value === "shortlisted" && "data-[state=checked]:border-amber-600 data-[state=checked]:bg-amber-100 data-[state=checked]:text-amber-800 dark:data-[state=checked]:bg-amber-900/40 dark:data-[state=checked]:text-amber-300",
                    o.value === "interview" && "data-[state=checked]:border-violet-600 data-[state=checked]:bg-violet-100 data-[state=checked]:text-violet-800 dark:data-[state=checked]:bg-violet-900/40 dark:data-[state=checked]:text-violet-300",
                    o.value === "offer" && "data-[state=checked]:border-teal-600 data-[state=checked]:bg-teal-100 data-[state=checked]:text-teal-800 dark:data-[state=checked]:bg-teal-900/40 dark:data-[state=checked]:text-teal-300",
                    o.value === "rejected" && "data-[state=checked]:border-rose-600 data-[state=checked]:bg-rose-100 data-[state=checked]:text-rose-800 dark:data-[state=checked]:bg-rose-900/40 dark:data-[state=checked]:text-rose-300",
                    o.value === "none" && "data-[state=checked]:border-zinc-600 data-[state=checked]:bg-zinc-200 data-[state=checked]:text-zinc-700 dark:data-[state=checked]:bg-zinc-700 dark:data-[state=checked]:text-zinc-300"
                  )}
                />
                <span className="space-y-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    <span
                      className={cn(
                        o.value === "shortlisted" && "text-amber-600 dark:text-amber-400",
                        o.value === "interview" && "text-violet-600 dark:text-violet-400",
                        o.value === "offer" && "text-teal-600 dark:text-teal-400",
                        o.value === "rejected" && "text-rose-600 dark:text-rose-400",
                        o.value === "none" && "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {o.icon}
                    </span>
                    {o.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {decision === "interview" && (
            <div className="space-y-1.5 rounded-lg border border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40 p-3">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">
                <CalendarClock className="h-3 w-3" /> Schedule details
                <span className="text-[10px] normal-case tracking-normal text-zinc-500 dark:text-zinc-400">optional — shows on the pill, timeline &amp; CSV</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Interview date</span>
                  <Input
                    type="date"
                    value={meta.scheduledAt ?? ""}
                    onChange={(e) => setMeta((m) => ({ ...m, scheduledAt: e.target.value }))}
                    className="h-8 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                    aria-label="Interview date"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Panel / interviewers</span>
                  <Input
                    value={meta.panel ?? ""}
                    onChange={(e) => setMeta((m) => ({ ...m, panel: e.target.value }))}
                    placeholder="e.g. Panel of 2 — Priya + Arjun"
                    maxLength={120}
                    className="h-8 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    aria-label="Panel or interviewer names"
                  />
                </label>
              </div>
              {metaHistoryLines("interview").length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                  <History className="h-3 w-3 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  <span className="text-zinc-500 dark:text-zinc-400">Schedule history:</span>
                  {metaHistoryLines("interview").map((line, i) => (
                    <span
                      key={line}
                      title={i === 0 ? "Current schedule" : "Earlier schedule"}
                      className={cn(
                        "rounded-full px-1.5 py-px font-mono text-[10px]",
                        i === 0
                          ? "border border-violet-300 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-400"
                          : "border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {line}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
          {decision === "offer" && (
            <div className="space-y-1.5 rounded-lg border border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 p-3">
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">
                <Handshake className="h-3 w-3" /> Offer details
                <span className="text-[10px] normal-case tracking-normal text-zinc-500 dark:text-zinc-400">optional — shows on the pill, timeline &amp; CSV</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Compensation</span>
                  <Input
                    value={meta.comp ?? ""}
                    onChange={(e) => setMeta((m) => ({ ...m, comp: e.target.value }))}
                    placeholder="e.g. 24 LPA · 90k/mo"
                    maxLength={120}
                    className="h-8 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                    aria-label="Offer compensation"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Start date</span>
                  <Input
                    type="date"
                    value={meta.startDate ?? ""}
                    onChange={(e) => setMeta((m) => ({ ...m, startDate: e.target.value }))}
                    className="h-8 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs"
                    aria-label="Offer start date"
                  />
                </label>
              </div>
              {metaHistoryLines("offer").length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                  <History className="h-3 w-3 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
                  <span className="text-zinc-500 dark:text-zinc-400">Offer history:</span>
                  {metaHistoryLines("offer").map((line, i) => (
                    <span
                      key={line}
                      title={i === 0 ? "Current offer" : "Earlier offer"}
                      className={cn(
                        "rounded-full px-1.5 py-px font-mono text-[10px]",
                        i === 0
                          ? "border border-teal-300 dark:border-teal-700 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-400"
                          : "border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {line}
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
          {decision && (
            <div className="space-y-1.5">
              <label htmlFor="pipeline-note" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Decision note <span className="text-zinc-500 dark:text-zinc-400">(optional — shows on hover, exports with CSV)</span>
              </label>
              <Textarea
                id="pipeline-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  decision === "shortlisted"
                    ? "e.g. Strong debugging evidence — move forward"
                    : decision === "interview"
                      ? "e.g. Schedule the system design round — panel of 2"
                      : decision === "offer"
                        ? "e.g. Offer sent — 90k, expecting a response this week"
                        : "e.g. Code quality below bar for the senior role"
                }
                className="min-h-16 border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={busy}
              className={cn(
                "sp-press font-medium",
                decision === "rejected"
                  ? "bg-rose-600 text-white hover:bg-rose-700"
                  : decision === "shortlisted"
                    ? "bg-amber-500 text-amber-950 hover:bg-amber-600"
                    : decision === "interview"
                      ? "bg-violet-600 text-white hover:bg-violet-700"
                      : decision === "offer"
                        ? "bg-teal-600 text-white hover:bg-teal-700"
                        : "bg-zinc-950 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
              )}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
              Save decision
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate journey dialog — full audit timeline from the PipelineEvents ─

interface JourneyData {
  id: string;
  name: string;
  invited: boolean;
  createdAt: string;
  resumes: Array<{ id: string; fileName: string; createdAt: string }>;
  attempts: Array<{ id: string; createdAt: string; completedAt: string | null; status: string; overall: number | null; confidence: string | null }>;
  events: Array<{ id: string; status: string; note: string | null; meta: PipelineMeta | null; createdAt: string }>;
}

const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function JourneyDialog({
  target,
  onOpenChange,
}: {
  target: CandidateRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [data, setData] = useState<JourneyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!target) {
      // close/reset — deferred to a microtask so the effect body stays
      // synchronous (react-hooks/set-state-in-effect)
      void Promise.resolve().then(() => {
        if (alive) {
          setData(null);
          setError(null);
          setLoading(false);
        }
      });
      return () => {
        alive = false;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (alive) {
          setLoading(true);
          setError(null);
        }
      })
      .then(() =>
        target
          ? fetch(`/api/candidates/${target.id}/timeline`)
          : Promise.reject(new Error("No candidate selected"))
      )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Journey lookup failed"))))
      .then((d) => {
        if (alive) setData(d.timeline);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Journey lookup failed");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [target]);

  /** Merge resumes, attempts and pipeline events into one date-sorted feed */
  const feed = useMemo<Array<{ key: string; at: string; node: React.ReactNode }>>(() => {
    if (!data) return [];
    // interview events whose scheduled date differs from the previous booking → "rescheduled" marker
    let prevBooking: string | null = null;
    const rescheduledFrom = new Map<string, string>();
    for (const ev of [...data.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (ev.status === "interview" && ev.meta?.scheduledAt) {
        if (prevBooking && prevBooking !== ev.meta.scheduledAt) rescheduledFrom.set(ev.id, prevBooking);
        prevBooking = ev.meta.scheduledAt;
      }
    }
    const nodes: Array<{ key: string; at: string; node: React.ReactNode }> = [];
    nodes.push({
      key: "created",
      at: data.createdAt,
      node: (
        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          <UserPlus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Profile created
          {data.invited && <span className="text-[10px] font-normal text-emerald-700 dark:text-emerald-400">via recruiter invite</span>}
        </span>
      ),
    });
    for (const r of data.resumes) {
      nodes.push({
        key: `resume-${r.id}`,
        at: r.createdAt,
        node: (
          <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <FileText className="h-3.5 w-3.5 text-sky-700" />
            Resume uploaded <span className="max-w-40 truncate text-xs text-zinc-500 dark:text-zinc-400">{r.fileName}</span>
          </span>
        ),
      });
    }
    for (const a of data.attempts) {
      const done = a.status === "completed";
      nodes.push({
        key: `attempt-${a.id}`,
        at: a.completedAt ?? a.createdAt,
        node: (
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Hourglass className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            )}
            Verification run {done ? "completed" : "started"}
            {a.overall != null && (
              <span className="rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                {Math.round(a.overall)}
              </span>
            )}
            {a.confidence && <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{a.confidence.toLowerCase()} confidence</span>}
          </span>
        ),
      });
    }
    for (const ev of data.events) {
      const stage = PIPELINE_STAGES[ev.status as keyof typeof PIPELINE_STAGES] ?? PIPELINE_STAGES.cleared;
      const metaText = pipelineMetaSummary(ev.meta);
      const wasDate = rescheduledFrom.get(ev.id);
      nodes.push({
        key: `event-${ev.id}`,
        at: ev.createdAt,
        node: (
          <span className="space-y-0.5">
            <span className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <span className={stage.iconClass}>{stage.icon}</span>
              {stage.label}
              {metaText && (
                <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-1.5 py-px font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                  {metaText}
                </span>
              )}
              {wasDate && (
                <span
                  title={`Rescheduled — the previous booking was ${metaDateShort(wasDate) || wasDate}`}
                  className="rounded-full border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:text-amber-400"
                >
                  <History className="mr-1 inline h-2.5 w-2.5" aria-hidden />
                  rescheduled · was {metaDateShort(wasDate) || wasDate}
                </span>
              )}
              {ev.note && <span className="max-w-56 truncate text-xs text-zinc-500 dark:text-zinc-400" title={ev.note}>“{ev.note}”</span>}
            </span>
          </span>
        ),
      });
    }
    return nodes.sort((a, b) => a.at.localeCompare(b.at));
  }, [data]);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-h-[85vh] border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Journey — {target?.name}
          </DialogTitle>
          <DialogDescription>
            Every step on record: profile creation, resume uploads, verification runs and pipeline decisions.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[56vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3 p-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="sp-shimmer h-10 w-full bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : error ? (
            <p className="p-4 text-center text-sm text-rose-700 dark:text-rose-400">{error}</p>
          ) : feed.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-zinc-200 dark:border-zinc-700 pl-5">
              {feed.map((n, i) => (
                <motion.li
                  key={n.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.3 }}
                  className="relative"
                >
                  <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full ring-4 ring-card",
                        i === feed.length - 1 ? "bg-emerald-600" : "bg-zinc-400 dark:bg-zinc-600"
                      )}
                    />
                  </span>
                  <div className="space-y-0.5">
                    {n.node}
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">{fmtDT(n.at)}</p>
                  </div>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pipeline funnel — clickable stage overview with conversion rates ──────

function FunnelStrip({
  total,
  verified,
  shortlisted,
  interview,
  offer,
  rejected,
  activeFilter,
  hideInProgress,
  onStage,
}: {
  total: number;
  verified: number;
  shortlisted: number;
  interview: number;
  offer: number;
  rejected: number;
  activeFilter: string;
  hideInProgress: boolean;
  onStage: (stage: "all" | "verified" | "shortlisted" | "interview" | "offer" | "rejected" | "none") => void;
}) {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const stages = [
    { key: "all" as const, label: "Candidates", count: total, tint: "text-zinc-700 dark:text-zinc-300", bar: "bg-zinc-500 dark:bg-zinc-400" },
    { key: "verified" as const, label: "Verified", count: verified, tint: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-600" },
    { key: "shortlisted" as const, label: "Shortlisted", count: shortlisted, tint: "text-amber-800 dark:text-amber-400", bar: "bg-amber-500" },
    { key: "interview" as const, label: "Interview", count: interview, tint: "text-violet-700 dark:text-violet-400", bar: "bg-violet-400" },
    { key: "offer" as const, label: "Offer", count: offer, tint: "text-teal-700 dark:text-teal-400", bar: "bg-teal-400" },
  ];
  // conversion connectors between consecutive stages
  const conv = [
    { from: "Candidates", to: "Verified", value: pct(verified, total) },
    { from: "Verified", to: "Shortlisted", value: pct(shortlisted, verified) },
    { from: "Shortlisted", to: "Interview", value: pct(interview, shortlisted) },
    { from: "Interview", to: "Offer", value: pct(offer, interview) },
  ];
  const isActive = (key: string) =>
    key === "all"
      ? activeFilter === "all" && !hideInProgress
      : key === "verified"
        ? hideInProgress && activeFilter === "all"
        : !hideInProgress && activeFilter === key;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            <GitCompareArrows className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Pipeline funnel
          </p>
          <button
            type="button"
            onClick={() => onStage("rejected")}
            aria-pressed={isActive("rejected")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
              isActive("rejected")
                ? "border-rose-300 dark:border-rose-700 bg-rose-100 dark:bg-rose-900/40 text-rose-200"
                : "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
            )}
            title="Show only rejected candidates"
          >
            <XCircle className="h-2.5 w-2.5" /> {rejected} rejected
          </button>
        </div>
        <div className="flex items-stretch gap-1 md:gap-1.5">
          {stages.map((s, i) => (
            <div key={s.key} className="flex min-w-0 flex-1 items-center gap-1 md:gap-1.5">
              <button
                type="button"
                onClick={() => onStage(s.key)}
                aria-pressed={isActive(s.key)}
                title={`Show only ${s.label.toLowerCase()}${i > 0 ? ` — ${conv[i - 1].value}% of ${conv[i - 1].from.toLowerCase()} advance` : ""}`}
                className={cn(
                  "group min-w-0 flex-1 rounded-lg border p-2 text-left transition-colors",
                  isActive(s.key)
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                    : "border-border bg-zinc-50 dark:bg-zinc-800/40 hover:border-emerald-300 dark:hover:border-emerald-700"
                )}
              >
                <p className={cn("truncate text-[10px] font-medium uppercase tracking-wide", s.tint)}>{s.label}</p>
                <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums leading-tight sm:text-lg">{s.count}</p>
                {/* mini proportional bar */}
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <span
                    className={cn("block h-full rounded-full transition-all duration-500", s.bar)}
                    style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
                  />
                </span>
              </button>
              {i < stages.length - 1 && (
                <span
                  className="hidden shrink-0 flex-col items-center px-0.5 md:flex"
                  title={`${conv[i].value}% of ${conv[i].from.toLowerCase()} advance to ${conv[i].to.toLowerCase()}`}
                >
                  <ChevronRight className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                  <span className="font-mono text-[9px] text-zinc-500 dark:text-zinc-400">{conv[i].value}%</span>
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-zinc-600 dark:text-zinc-300">
          Click a stage to filter the table · conversion rates show how many candidates advance between stages
        </p>
      </CardContent>
    </Card>
  );
}

function CandidateBoard({
  rows,
  reload,
  searchQuery,
  onSearchQueryChange,
}: {
  rows: CandidateRow[] | null;
  reload: () => Promise<void> | void;
  /** Controlled search text from the workspace top bar (optional — local state is the fallback) */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
}) {
  const setCertificate = useStore((s) => s.setCertificate);
  // Controlled from the top bar when the shell passes `searchQuery`; otherwise
  // the board keeps its own local query. Both paths share `query`/`setQuery`.
  const [localQuery, setLocalQuery] = useState("");
  const query = searchQuery ?? localQuery;
  const setQuery = (q: string) => {
    setLocalQuery(q);
    onSearchQueryChange?.(q);
  };
  const [confFilter, setConfFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<string>("0");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
  const [pipelineFilter, setPipelineFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [hideInProgress, setHideInProgress] = useState(false);
  // archive view
  const [showArchived, setShowArchived] = useState(false);
  // role-fit weights
  const [roleFitOpen, setRoleFitOpen] = useState(false);
  const [roleMatchOpen, setRoleMatchOpen] = useState(false);
  const [fitWeights, setFitWeights] = useState<FitWeights>(ROLE_PRESETS[0].weights);
  const [fitPresetId, setFitPresetId] = useState<string>(ROLE_PRESETS[0].id);
  const [fitOrder, setFitOrder] = useState(false);
  // bulk management
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportingAttempts, setExportingAttempts] = useState(false);
  const [exportingStandings, setExportingStandings] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CandidateRow | null>(null);
  // pipeline decision dialog + exports
  const [pipelineTarget, setPipelineTarget] = useState<CandidateRow | null>(null);
  const [journeyTarget, setJourneyTarget] = useState<CandidateRow | null>(null);
  const [exportingBundle, setExportingBundle] = useState(false);

  // persisted role-fit weights
  useEffect(() => {
    try {
      const raw = localStorage.getItem("skillproof:role-fit");
      if (raw) {
        const parsed = JSON.parse(raw) as { weights: FitWeights; presetId: string };
        if (parsed.weights && CATEGORY_KEYS.every((k) => typeof parsed.weights[k] === "number")) {
          setFitWeights(parsed.weights);
          // Sanitize: "__saved__" is dialog-local and unresolvable after a
          // reload; built-in ids and saved-preset cuids pass through (saved
          // cuids resolve to names via the server list inside the dialog).
          const stored = parsed.presetId ?? "custom";
          setFitPresetId(stored === "__saved__" ? "custom" : stored);
        }
      }
    } catch {}
  }, []);

  const applyFitWeights = (w: FitWeights, presetId: string) => {
    setFitWeights(w);
    setFitPresetId(presetId);
    try {
      localStorage.setItem("skillproof:role-fit", JSON.stringify({ weights: w, presetId }));
    } catch {}
  };

  const verified = useMemo(() => (rows ?? []).filter((r) => r.overall != null && !r.archived), [rows]);
  const avg = verified.length ? Math.round(verified.reduce((a, r) => a + (r.overall ?? 0), 0) / verified.length) : 0;
  const highConf = verified.filter((r) => r.confidence === "HIGH").length;
  const avgRisk = verified.length ? Math.round(verified.reduce((a, r) => a + (r.aiRisk ?? 0), 0) / verified.length) : 0;
  const archivedCount = (rows ?? []).filter((r) => r.archived).length;
  const allTags = useMemo(
    () => Array.from(new Set((rows ?? []).flatMap((r) => r.tags))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const filtered = useMemo(() => {
    let list = rows ?? [];
    list = showArchived ? list.filter((r) => r.archived) : list.filter((r) => !r.archived);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (confFilter !== "all") list = list.filter((r) => r.confidence === confFilter);
    if (tagFilter !== "all") list = list.filter((r) => r.tags.includes(tagFilter));
    if (diffFilter !== "all") list = list.filter((r) => matchesDiffFilter(r, diffFilter));
    if (pipelineFilter === "shortlisted") list = list.filter((r) => r.pipelineStatus === "shortlisted");
    else if (pipelineFilter === "interview") list = list.filter((r) => r.pipelineStatus === "interview");
    else if (pipelineFilter === "offer") list = list.filter((r) => r.pipelineStatus === "offer");
    else if (pipelineFilter === "rejected") list = list.filter((r) => r.pipelineStatus === "rejected");
    else if (pipelineFilter === "none") list = list.filter((r) => r.pipelineStatus == null);
    const min = Number(minScore) || 0;
    if (min > 0) list = list.filter((r) => (r.overall ?? -1) >= min);
    if (hideInProgress) list = list.filter((r) => r.overall != null);
    const sorted = [...list];
    if (fitOrder) {
      sorted.sort(
        (a, b) =>
          (computeFit(b, fitWeights) ?? -1) - (computeFit(a, fitWeights) ?? -1) ||
          (b.overall ?? -1) - (a.overall ?? -1)
      );
      return sorted;
    }
    switch (sortBy) {
      case "score-desc":
        sorted.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
        break;
      case "score-asc":
        sorted.sort((a, b) => (a.overall ?? 999) - (b.overall ?? 999));
        break;
      case "risk-asc":
        sorted.sort((a, b) => (a.aiRisk ?? 999) - (b.aiRisk ?? 999));
        break;
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "hard-desc":
        sorted.sort(
          (a, b) =>
            (b.difficultyMix?.hard?.score ?? -1) - (a.difficultyMix?.hard?.score ?? -1) ||
            (b.difficultyMix?.hard?.n ?? 0) - (a.difficultyMix?.hard?.n ?? 0) ||
            (b.overall ?? -1) - (a.overall ?? -1)
        );
        break;
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return sorted;
  }, [rows, query, confFilter, minScore, tagFilter, diffFilter, pipelineFilter, sortBy, hideInProgress, showArchived, fitOrder, fitWeights]);

  const shortlistedCount = (rows ?? []).filter((r) => r.pipelineStatus === "shortlisted").length;
  const interviewCount = (rows ?? []).filter((r) => r.pipelineStatus === "interview").length;
  const offerCount = (rows ?? []).filter((r) => r.pipelineStatus === "offer").length;
  const rejectedCount = (rows ?? []).filter((r) => r.pipelineStatus === "rejected").length;

  const compareRows = useMemo(
    () => compareIds.map((id) => (rows ?? []).find((r) => r.id === id)).filter((r): r is CandidateRow => !!r),
    [compareIds, rows]
  );

  const toggleCompare = (r: CandidateRow) => {
    setCompareIds((cur) => {
      if (cur.includes(r.id)) return cur.filter((id) => id !== r.id);
      if (cur.length >= MAX_COMPARE) {
        toast.warning(`Compare supports up to ${MAX_COMPARE} candidates`);
        return cur;
      }
      return [...cur, r.id];
    });
  };

  // ── bulk selection & actions ──
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.id));
  const toggleSelectAll = () => {
    setSelectedIds(() => (allVisibleSelected ? [] : filtered.map((r) => r.id)));
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const runBulk = async (
    action: "tag" | "untag" | "delete" | "archive" | "restore" | "shortlist" | "interview" | "offer" | "reject" | "clear-pipeline",
    tag?: string
  ) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds, tag }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === "tag") toast.success(`Tagged ${data.affected} candidate${data.affected === 1 ? "" : "s"} with “${tag}”`);
      else if (action === "untag") toast.success(`Removed “${tag}” from ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "archive") toast.success(`Archived ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "restore") toast.success(`Restored ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "shortlist") toast.success(`Shortlisted ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "interview") toast.success(`Moved ${data.affected} candidate${data.affected === 1 ? "" : "s"} to interview`);
      else if (action === "offer") toast.success(`Extended offers to ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "reject") toast.success(`Rejected ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else if (action === "clear-pipeline") toast.success(`Cleared decisions for ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      else toast.success(`Deleted ${data.affected} candidate${data.affected === 1 ? "" : "s"}`);
      setSelectedIds([]);
      setBulkTag("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  };

  /** Toggle a single candidate's pipeline decision straight from the row. */
  const togglePipeline = async (r: CandidateRow, status: "shortlisted" | "rejected") => {
    const next = r.pipelineStatus === status ? null : status;
    try {
      const res = await fetch(`/api/candidates/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStatus: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(
        next === "shortlisted"
          ? `${r.name} shortlisted`
          : next === "rejected"
            ? `${r.name} marked as rejected`
            : `Decision cleared for ${r.name}`
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the decision");
    }
  };

  /** Issue a verifiable skill certificate for a completed candidate (one click). */
  const issueCertificateForRow = async (r: CandidateRow) => {
    if (!r.assessmentId) return;
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: r.assessmentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Failed to issue certificate");
      toast.success(
        data.created
          ? `Certificate issued to ${r.name} — verification code ${data.certificate.code}`
          : `Certificate already issued — code ${data.certificate.code}`,
        { description: "Share the verify link — anyone can check authenticity with the code." }
      );
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue certificate");
    }
  };

  /** Open the certificate sheet for an already-issued code. */
  const viewCertificateForRow = async (code: string) => {
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Certificate not found");
      setCertificate(data.certificate);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the certificate");
    }
  };

  /** Export EVERY assessment across all candidates (attempt-level dataset). */
  const exportAllAttempts = async () => {
    setExportingAttempts(true);
    try {
      const res = await fetch("/api/attempts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const attempts: Array<{
        candidateName: string;
        assessmentId: string;
        createdAt: string;
        completedAt: string | null;
        status: string;
        overall: number | null;
        confidence: string | null;
        aiRisk: number | null;
        categories: CategoryScores | null;
      }> = data.attempts;
      if (!attempts.length) {
        toast.error("No attempts recorded yet");
        return;
      }
      const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Candidate", "Assessment ID", "Created", "Completed", "Status", "Overall", "Confidence", "AI Risk %", "Role Fit"];
      const lines = attempts.map((a) =>
        [
          esc(a.candidateName),
          esc(a.assessmentId),
          esc(a.createdAt),
          esc(a.completedAt ?? ""),
          esc(a.status),
          esc(a.overall != null ? Math.round(a.overall) : ""),
          esc(a.confidence ?? ""),
          esc(a.aiRisk != null ? Math.round(a.aiRisk) : ""),
          esc(computeFitFromCategories(a.categories, fitWeights) ?? ""),
        ].join(",")
      );
      const csv = [header, ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-all-attempts-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} across all candidates`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attempts export failed");
    } finally {
      setExportingAttempts(false);
    }
  };

  /** Per-run cohort standings export — live rank against the current cohort
   *  plus the frozen certificate snapshot when one was issued. */
  const exportStandingsCsv = async () => {
    setExportingStandings(true);
    try {
      const res = await fetch("/api/cohort/standings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const rows: Array<{
        candidateName: string;
        email: string | null;
        assessmentId: string;
        completedAt: string | null;
        overall: number;
        confidence: string | null;
        liveStanding: { size: number; median: number; best: number; rank: number; topPct: number } | null;
        certificate: { code: string; issuedAt: string; standing: { size: number; rank: number; topPct: number } | null } | null;
      }> = data.rows;
      if (!rows.length) {
        toast.error("No completed verification runs to rank yet");
        return;
      }
      const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = [
        "Candidate",
        "Email",
        "Assessment ID",
        "Completed",
        "Overall",
        "Confidence",
        "Live Rank",
        "Cohort Size",
        "Top %",
        "Cohort Median",
        "Cert Rank",
        "Cert Top %",
        "Cert Code",
      ];
      const lines = rows.map((r) =>
        [
          esc(r.candidateName),
          esc(r.email ?? ""),
          esc(r.assessmentId),
          esc(r.completedAt ?? ""),
          esc(Math.round(r.overall)),
          esc(r.confidence ?? ""),
          esc(r.liveStanding?.rank ?? ""),
          esc(r.liveStanding?.size ?? ""),
          esc(r.liveStanding ? r.liveStanding.topPct.toFixed(1) : ""),
          esc(r.liveStanding?.median ?? ""),
          esc(r.certificate?.standing?.rank ?? ""),
          esc(r.certificate?.standing ? r.certificate.standing.topPct.toFixed(1) : ""),
          esc(r.certificate?.code ?? ""),
        ].join(",")
      );
      const csv = [header, ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-cohort-standings-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported standings for ${rows.length} verified run${rows.length === 1 ? "" : "s"} · cohort of ${data.cohortSize}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Standings export failed");
    } finally {
      setExportingStandings(false);
    }
  };

  const deleteSingle = async (r: CandidateRow) => {
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/candidates/${r.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Deleted profile for ${r.name}`);
      setCompareIds((cur) => cur.filter((id) => id !== r.id));
      setSelectedIds((cur) => cur.filter((id) => id !== r.id));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBulkBusy(false);
      setDeleteTarget(null);
    }
  };

  const toggleArchiveSingle = async (r: CandidateRow) => {
    try {
      const res = await fetch(`/api/candidates/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !r.archived }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(r.archived ? `Restored ${r.name}` : `Archived ${r.name}`);
      setCompareIds((cur) => cur.filter((id) => id !== r.id));
      setSelectedIds((cur) => cur.filter((id) => id !== r.id));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Archive action failed");
    }
  };

  const exportCsv = () => {
    if (!rows || rows.length === 0) {
      toast.error("No candidates to export");
      return;
    }
    const allSkills = Array.from(new Set(rows.flatMap((r) => r.skills.filter((s) => s.assessed).map((s) => s.skill))));
    const header = [
      "Name",
      "Email",
      "Created",
      "Verified At",
      "Overall",
      "Confidence",
      "AI Risk %",
      "Risk Confidence",
      "Role Fit",
      "Hard Avg",
      "Invited",
      "Archived",
      "Pipeline",
      "Pipeline Detail",
      "Tags",
      "Notes",
      "Pipeline Note",
      "Claimed Skills",
      ...allSkills.map((s) => `Skill: ${s}`),
    ];
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        esc(r.name),
        esc(r.email ?? ""),
        esc(new Date(r.createdAt).toISOString().slice(0, 10)),
        esc(r.completedAt ? new Date(r.completedAt).toISOString().slice(0, 10) : ""),
        esc(r.overall ?? ""),
        esc(r.confidence ?? ""),
        esc(r.aiRisk ?? ""),
        esc(r.aiRiskConfidence ?? ""),
        esc(computeFit(r, fitWeights) ?? ""),
        esc(r.difficultyMix?.hard?.score ?? ""),
        esc(r.invited ? "yes" : "no"),
        esc(r.archived ? "yes" : "no"),
        esc(r.pipelineStatus ?? ""),
        esc(pipelineMetaSummary(r.pipelineMeta)),
        esc(r.tags.join("; ")),
        esc(r.notes),
        esc(r.pipelineNote ?? ""),
        esc(r.claimedSkills.map((c) => `${c.skill} (${c.level})`).join("; ")),
        ...allSkills.map((s) => {
          const found = r.skills.find((x) => x.skill === s && x.assessed);
          return esc(found ? found.score : "");
        }),
      ].join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillproof-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} candidate${rows.length === 1 ? "" : "s"} to CSV`);
  };

  /** Export a zip of branded PDF reports for every verified candidate in the current filtered view. */
  const exportPdfBundle = async () => {
    const targets = filtered.filter((r) => r.overall != null && r.assessmentId);
    if (targets.length === 0) {
      toast.error("No verified candidates in the current view to export");
      return;
    }
    if (targets.length > 30) {
      toast.info("Bundle export is capped at 30 reports — narrow the filters and export in batches");
    }
    const ids = targets.slice(0, 30).map((r) => r.id);
    setExportingBundle(true);
    try {
      const res = await fetch("/api/report/pdf-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Bundle export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `skillproof-reports-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${ids.length} branded PDF report${ids.length === 1 ? "" : "s"} as a zip bundle`,
        { description: "Each PDF matches the single-report export, with verified share links in the footer." }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bundle export failed");
    } finally {
      setExportingBundle(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { icon: <Users className="h-4 w-4" />, label: "Candidates", value: String(rows?.length ?? 0), sub: undefined as string | undefined, accent: undefined as string | undefined },
          { icon: <ShieldCheck className="h-4 w-4" />, label: "Verified profiles", value: String(verified.length), sub: undefined, accent: undefined },
          { icon: <BarChart3 className="h-4 w-4" />, label: "Avg score", value: String(avg), sub: undefined, accent: undefined },
          { icon: <Trophy className="h-4 w-4" />, label: "High conf.", value: String(highConf), sub: `${avgRisk}% avg risk`, accent: undefined },
          { icon: <Star className="h-4 w-4" />, label: "Shortlisted", value: String(shortlistedCount), sub: rejectedCount > 0 ? `${rejectedCount} rejected` : undefined, accent: "text-amber-600 dark:text-amber-400" },
          { icon: <CalendarClock className="h-4 w-4" />, label: "In interview", value: String(interviewCount), sub: undefined, accent: "text-violet-600 dark:text-violet-400" },
          { icon: <Handshake className="h-4 w-4" />, label: "Offers", value: String(offerCount), sub: undefined, accent: "text-teal-600 dark:text-teal-400" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <StatCard icon={s.icon} label={s.label} value={s.value} sub={s.sub} accent={s.accent} />
          </motion.div>
        ))}
      </div>

      {/* pipeline funnel — click a stage to filter the table */}
      {rows && rows.length > 0 && !showArchived && (
        <FunnelStrip
          total={rows.length}
          verified={verified.length}
          shortlisted={shortlistedCount}
          interview={interviewCount}
          offer={offerCount}
          rejected={rejectedCount}
          activeFilter={pipelineFilter}
          hideInProgress={hideInProgress}
          onStage={(stage) => {
            if (stage === "all") {
              setPipelineFilter("all");
              setHideInProgress(false);
            } else if (stage === "verified") {
              setHideInProgress(true);
              setPipelineFilter("all");
            } else {
              setHideInProgress(false);
              setPipelineFilter(stage);
            }
          }}
        />
      )}

      {compareRows.length >= 2 && (
        <ComparePanel rows={compareRows} fitWeights={fitWeights} onClear={() => setCompareIds([])} />
      )}

      {/* active role-fit chip */}
      {fitOrder && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Target className="h-3 w-3" />
            Sorted by role fit · {ROLE_PRESETS.find((p) => p.id === fitPresetId)?.label ?? "Custom weights"}
            <button
              onClick={() => setFitOrder(false)}
              aria-label="Clear role-fit sorting"
              className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      {/* overall comparison bars */}
      {verified.length > 0 && compareRows.length < 2 && (
        <Card className="mb-6 border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Overall comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[...verified]
              .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
              .map((r, i) => (
                <motion.div
                  key={r.id}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.35 }}
                >
                  <span className="w-32 truncate text-sm text-zinc-700 dark:text-zinc-300" title={r.name}>{r.name}</span>
                  <div className="flex-1">
                    <EvidenceBar score={r.overall ?? 0} />
                  </div>
                  <span className="w-10 text-right font-mono text-sm" style={{ color: scoreColor(r.overall ?? 0) }}>
                    {r.overall}
                  </span>
                </motion.div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* toolbar */}
      <Card className="mb-4 border-border bg-card">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              className="h-9 border-zinc-300 dark:border-zinc-700 bg-transparent pl-8 text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              aria-label="Search candidates"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={confFilter} onValueChange={setConfFilter}>
              <SelectTrigger className="h-9 w-[150px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs" aria-label="Filter by confidence">
                <SelectValue placeholder="Confidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All confidence</SelectItem>
                <SelectItem value="HIGH">High confidence</SelectItem>
                <SelectItem value="MEDIUM">Medium confidence</SelectItem>
                <SelectItem value="LOW">Low confidence</SelectItem>
              </SelectContent>
            </Select>
            <Select value={minScore} onValueChange={setMinScore}>
              <SelectTrigger className="h-9 w-[130px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs" aria-label="Filter by minimum score">
                <SelectValue placeholder="Min score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Any score</SelectItem>
                <SelectItem value="40">≥ 40</SelectItem>
                <SelectItem value="60">≥ 60</SelectItem>
                <SelectItem value="80">≥ 80</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter} disabled={allTags.length === 0}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[130px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs",
                  tagFilter !== "all" ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by tag"
              >
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={diffFilter} onValueChange={(v) => setDiffFilter(v as DiffFilter)}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[160px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs",
                  diffFilter !== "all" ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by hard-question performance"
              >
                <SelectValue placeholder="Difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any difficulty</SelectItem>
                <SelectItem value="attempted-hard">Tried hard questions</SelectItem>
                <SelectItem value="strong-hard">Strong on hard (≥70)</SelectItem>
                <SelectItem value="weak-hard">Struggled on hard (&lt;50)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger
                className={cn(
                  "h-9 w-[140px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs",
                  pipelineFilter === "shortlisted"
                    ? "border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-400"
                    : pipelineFilter === "interview"
                      ? "border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400"
                      : pipelineFilter === "offer"
                        ? "border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400"
                        : pipelineFilter === "rejected"
                          ? "border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-400"
                          : pipelineFilter === "none"
                            ? "border-zinc-400 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300"
                            : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                )}
                aria-label="Filter by pipeline decision"
              >
                <SelectValue placeholder="Pipeline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All decisions</SelectItem>
                <SelectItem value="shortlisted">Shortlisted</SelectItem>
                <SelectItem value="interview">In interview</SelectItem>
                <SelectItem value="offer">Offer extended</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="none">No decision</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-9 w-[140px] border-zinc-300 dark:border-zinc-700 bg-transparent text-xs" aria-label="Sort candidates">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Most recent</SelectItem>
                <SelectItem value="score-desc">Score ↓</SelectItem>
                <SelectItem value="score-asc">Score ↑</SelectItem>
                <SelectItem value="risk-asc">Lowest AI risk</SelectItem>
                <SelectItem value="hard-desc">Hard-question score ↓</SelectItem>
                <SelectItem value="name-asc">Name A–Z</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHideInProgress((v) => !v)}
              aria-pressed={hideInProgress}
              className={cn(
                "h-9 border text-xs",
                hideInProgress
                  ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              {hideInProgress ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
              Hide in-progress
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRoleFitOpen(true)}
              aria-pressed={fitOrder}
              className={cn(
                "h-9 border text-xs",
                fitOrder
                  ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Target className="mr-1.5 h-3.5 w-3.5" /> Role fit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRoleMatchOpen(true)}
              title="Paste a job description — AI extracts the required skills and ranks verified candidates against their frozen skill evidence"
              className="h-9 border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Role match
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              className={cn(
                "h-9 border text-xs",
                showArchived
                  ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400"
                  : "border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDupOpen(true)}
              className="h-9 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Duplicates
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInviteOpen(true)}
              className="sp-press h-9 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
              <MailPlus className="mr-1.5 h-3.5 w-3.5" /> Invite
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              title="Export the candidates table (latest run per profile)"
              className="h-9 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportAllAttempts()}
              disabled={exportingAttempts}
              title="Export every verification attempt across all candidates (one row per run)"
              className="h-9 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              {exportingAttempts ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <History className="mr-1.5 h-3.5 w-3.5" />}
              Attempts CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportStandingsCsv()}
              disabled={exportingStandings}
              title="Export per-run cohort standings — live rank/top-% plus the frozen certificate snapshot"
              className="h-9 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              {exportingStandings ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trophy className="mr-1.5 h-3.5 w-3.5" />}
              Standings CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportPdfBundle()}
              disabled={exportingBundle}
              title="Download a zip of branded PDF reports for the verified candidates in the current view"
              className="h-9 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
            >
              {exportingBundle ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FolderDown className="mr-1.5 h-3.5 w-3.5" />}
              PDF bundle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* bulk action bar */}
      {selectedIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="sticky top-[64px] z-20"
        >
          <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-3 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-400">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
                {selectedIds.length}
              </span>
              selected
            </p>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                placeholder="Tag name…"
                className="h-8 w-32 border-emerald-300 dark:border-emerald-700 bg-transparent text-xs placeholder:text-zinc-500"
                aria-label="Tag to apply to selected candidates"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && bulkTag.trim()) void runBulk("tag", bulkTag.trim());
                }}
              />
              <Button
                size="sm"
                disabled={!bulkTag.trim() || bulkBusy}
                onClick={() => void runBulk("tag", bulkTag.trim())}
                className="h-8 bg-zinc-950 dark:bg-zinc-100 text-xs text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
              >
                <Tag className="mr-1 h-3 w-3" /> Tag
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkTag.trim() || bulkBusy}
                onClick={() => void runBulk("untag", bulkTag.trim())}
                className="h-8 border-emerald-300 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
                <X className="mr-1 h-3 w-3" /> Untag
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("shortlist")}
                className="h-8 border-amber-300 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                <Star className="mr-1 h-3 w-3" /> Shortlist
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("interview")}
                className="h-8 border-violet-300 dark:border-violet-700 text-xs text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40"
              >
                <CalendarClock className="mr-1 h-3 w-3" /> Interview
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("offer")}
                className="h-8 border-teal-300 dark:border-teal-700 text-xs text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40"
              >
                <Handshake className="mr-1 h-3 w-3" /> Offer
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("reject")}
                className="h-8 border-rose-300 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                <XCircle className="mr-1 h-3 w-3" /> Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("clear-pipeline")}
                className="h-8 border-zinc-300 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              >
                <Eraser className="mr-1 h-3 w-3" /> Clear decision
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk(showArchived ? "restore" : "archive")}
                className="h-8 border-amber-300 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              >
                {showArchived ? <ArchiveRestore className="mr-1 h-3 w-3" /> : <Archive className="mr-1 h-3 w-3" />}
                {showArchived ? "Restore" : "Archive"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => void runBulk("delete")}
                className="h-8 border-rose-300 dark:border-rose-700 text-xs text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/40"
              >
                {bulkBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Trash2 className="mr-1 h-3 w-3" />} Delete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
                className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Clear
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* table */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {rows === null ? (
            <div className="space-y-3 p-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="sp-shimmer h-12 w-full bg-zinc-100 dark:bg-zinc-800" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <div className="flex flex-col items-center gap-2 border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40 px-6 py-12 text-center">
                <Users className="h-7 w-7 text-zinc-400 dark:text-zinc-400" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  {showArchived ? "Archive" : "No entries"}
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                {showArchived
                  ? rows.length === 0
                    ? "No candidates yet. Archived profiles will appear here."
                    : "No archived candidates."
                  : rows.length === 0
                    ? "No candidates yet. Run a verification from the candidate flow to populate this dashboard."
                    : "No candidates match the current filters."}
                </p>
                {rows.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    onClick={() => {
                      setQuery("");
                      setConfFilter("all");
                      setMinScore("0");
                      setTagFilter("all");
                      setDiffFilter("all");
                      setPipelineFilter("all");
                    }}
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" /> Clear filters
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="sr-only">Select to compare</span>
                      <GitCompareArrows className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    </TableHead>
                    <TableHead className="w-10 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <Checkbox
                        checked={allVisibleSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all visible candidates"
                        className="border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:text-zinc-50 data-[state=indeterminate]:border-zinc-950 data-[state=indeterminate]:bg-zinc-950/70 dark:data-[state=checked]:border-zinc-100 dark:data-[state=checked]:bg-zinc-100 dark:data-[state=checked]:text-zinc-950 dark:data-[state=indeterminate]:border-zinc-100 dark:data-[state=indeterminate]:bg-zinc-100/70"
                      />
                    </TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Candidate</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Verified skills</TableHead>
                    <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <span
                        className={cn("inline-flex items-center gap-1", fitOrder ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500 dark:text-zinc-400")}
                        title="Role fit — how well each verified profile matches your current role-fit weights (tune via the Role fit button)"
                      >
                        <Target className="h-3 w-3" /> Fit
                      </span>
                    </TableHead>
                    <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Overall</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Confidence</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">AI risk</TableHead>
                    <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Report</TableHead>
                    <TableHead className="w-14 text-right font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="sr-only">Archive and delete actions</span>
                      <Archive className="ml-auto mr-1 inline h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                      <Trash2 className="inline h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const selected = compareIds.includes(r.id);
                    const checked = selectedIds.includes(r.id);
                    const fit = computeFit(r, fitWeights);
                    return (
                      <TableRow
                        key={r.id}
                        className={cn(
                          "border-border transition-colors",
                          checked
                            ? "bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
                            : selected
                              ? "bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40"
                              : "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/60",
                          r.archived && !checked && !selected && "opacity-55",
                          // pipeline decision edge-tint (kept subtle so both
                          // compare & bulk tints always win when active)
                          !checked && !selected && r.pipelineStatus === "shortlisted" && "shadow-[inset_2px_0_0_0_rgba(217,119,6,0.5)]",
                          !checked && !selected && r.pipelineStatus === "interview" && "shadow-[inset_2px_0_0_0_rgba(124,58,237,0.45)]",
                          !checked && !selected && r.pipelineStatus === "offer" && "shadow-[inset_2px_0_0_0_rgba(13,148,136,0.45)]",
                          !checked && !selected && r.pipelineStatus === "rejected" && "shadow-[inset_2px_0_0_0_rgba(225,29,72,0.40)]",
                          // sage register-tick on hover — undecided rows only
                          !checked && !selected && !r.pipelineStatus && "hover:shadow-[inset_2px_0_0_0_#5c7250]"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected}
                            disabled={r.overall == null && !selected}
                            onCheckedChange={() => toggleCompare(r)}
                            aria-label={`Compare ${r.name}`}
                            className="border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:text-zinc-50"
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={`Select ${r.name} for bulk actions`}
                            className="border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:text-zinc-50"
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.email ?? "no email"} · {new Date(r.createdAt).toLocaleDateString()}
                          </p>
                          {(r.tags.length > 0 || r.notes || r.archived || r.pipelineStatus || (r.invited && r.overall == null)) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {r.archived && (
                                <span className="rounded-full border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-400">
                                  Archived
                                </span>
                              )}
                              {r.pipelineStatus === "shortlisted" && (
                                <button
                                  type="button"
                                  onClick={() => setPipelineTarget(r)}
                                  title={r.pipelineNote ? `Shortlisted — ${r.pipelineNote}` : "Shortlisted — click to edit the decision"}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-400 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                >
                                  <Star className="h-2.5 w-2.5 fill-current" /> Shortlisted
                                </button>
                              )}
                              {r.pipelineStatus === "interview" && (
                                <button
                                  type="button"
                                  onClick={() => setPipelineTarget(r)}
                                  title={`Interview${r.pipelineMeta ? ` — ${pipelineMetaSummary(r.pipelineMeta)}` : ""}${r.pipelineNote ? ` — ${r.pipelineNote}` : ""} — click to edit`}
                                  className="inline-flex items-center gap-1 rounded-full border border-violet-200 dark:border-violet-800/60 bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-400 transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/40"
                                >
                                  <CalendarClock className="h-2.5 w-2.5" /> Interview
                                  {metaDateShort(r.pipelineMeta?.scheduledAt) && (
                                    <span className="font-mono text-[9px] text-violet-600 dark:text-violet-400">· {metaDateShort(r.pipelineMeta?.scheduledAt)}</span>
                                  )}
                                </button>
                              )}
                              {r.pipelineStatus === "offer" && (
                                <button
                                  type="button"
                                  onClick={() => setPipelineTarget(r)}
                                  title={`Offer${r.pipelineMeta ? ` — ${pipelineMetaSummary(r.pipelineMeta)}` : ""}${r.pipelineNote ? ` — ${r.pipelineNote}` : ""} — click to edit`}
                                  className="inline-flex items-center gap-1 rounded-full border border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-400 transition-colors hover:bg-teal-100 dark:hover:bg-teal-900/40"
                                >
                                  <Handshake className="h-2.5 w-2.5" /> Offer
                                  {(metaDateShort(r.pipelineMeta?.startDate) || r.pipelineMeta?.comp) && (
                                    <span className="font-mono text-[9px] text-teal-600 dark:text-teal-400">
                                      · {metaDateShort(r.pipelineMeta?.startDate) || r.pipelineMeta?.comp}
                                    </span>
                                  )}
                                </button>
                              )}
                              {r.pipelineStatus === "rejected" && (
                                <button
                                  type="button"
                                  onClick={() => setPipelineTarget(r)}
                                  title={r.pipelineNote ? `Rejected — ${r.pipelineNote}` : "Rejected — click to edit the decision"}
                                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/40"
                                >
                                  <XCircle className="h-2.5 w-2.5" /> Rejected
                                </button>
                              )}
                              {r.pipelineStatus && r.pipelineNote && (
                                <span title={r.pipelineNote} className="flex items-center gap-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                  <StickyNote className="h-3 w-3" /> decision note
                                </span>
                              )}
                              {r.invited && r.overall == null && (
                                <span
                                  title="Created via recruiter invite — waiting for the candidate to verify"
                                  className="rounded-full border border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                                >
                                  Invited
                                </span>
                              )}
                              {r.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                                >
                                  {t}
                                </span>
                              ))}
                              {r.notes && (
                                <span title={r.notes} className="flex items-center gap-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                                  <StickyNote className="h-3 w-3" /> note
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5">
                            {r.skills
                              .filter((s) => s.assessed)
                              .slice(0, 4)
                              .map((s) => (
                                <Badge
                                  key={s.skill}
                                  variant="outline"
                                  className="border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-0.5 text-xs"
                                >
                                  {s.skill}{" "}
                                  <span className="ml-1 font-mono tabular-nums" style={{ color: scoreColor(s.score) }}>
                                    {s.score}
                                  </span>
                                </Badge>
                              ))}
                            {r.skills.length === 0 && <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {fit != null ? (
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={`Role fit ${fit}% against your current weights${fitOrder ? " — sorted by fit" : ""}`}
                            >
                              <span className="font-mono text-sm font-bold tabular-nums" style={{ color: scoreColor(fit) }}>
                                {fit}
                              </span>
                              <span className="hidden h-1 w-10 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 md:block">
                                <span
                                  className="block h-full rounded-full transition-all duration-500"
                                  style={{ width: `${fit}%`, backgroundColor: scoreColor(fit) }}
                                />
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400" title="Fit needs a completed assessment">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.overall != null ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-mono text-base font-bold tabular-nums" style={{ color: scoreColor(r.overall) }}>
                                {r.overall}
                              </span>
                              {r.completedRuns.length > 1 && <AttemptSparkline runs={r.completedRuns} />}
                              {r.attemptCount > r.completedRuns.length && (
                                <span
                                  className="text-[10px] text-zinc-600 dark:text-zinc-300"
                                  title="Started but unfinished assessment runs"
                                >
                                  +{r.attemptCount - r.completedRuns.length} unfinished
                                </span>
                              )}
                            </div>
                          ) : r.attemptCount > 0 ? (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">in progress</span>
                          ) : r.invited ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-400">invite sent</span>
                          ) : (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">not started</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <ConfidenceBadge level={r.confidence} />
                        </TableCell>
                        <TableCell>
                          {r.aiRisk != null ? <RiskBadge risk={r.aiRisk} /> : <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.assessmentId && <ReportSheet assessmentId={r.assessmentId} name={r.name} row={r} onSaved={reload} />}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.assessmentId && r.overall != null && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  r.certificateCode
                                    ? void viewCertificateForRow(r.certificateCode)
                                    : void issueCertificateForRow(r)
                                }
                                aria-label={
                                  r.certificateCode
                                    ? `View ${r.name}'s issued certificate (${r.certificateCode})`
                                    : `Issue skill certificate for ${r.name}`
                                }
                                title={
                                  r.certificateCode
                                    ? `Certificate issued — ${r.certificateCode} (click to view)`
                                    : "Issue certificate — verifiable skill scorecard"
                                }
                                className={cn(
                                  "h-7 w-7",
                                  r.certificateCode
                                    ? "text-[#5c7250] dark:text-[#a9c29b] hover:bg-[#5c7250]/10 dark:hover:bg-[#5c7250]/20"
                                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-[#5c7250]"
                                )}
                              >
                                <Award className={cn("h-3.5 w-3.5", r.certificateCode && "fill-current")} />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setJourneyTarget(r)}
                              aria-label={`View ${r.name}'s journey timeline`}
                              title="Journey — profile, runs & decision history"
                              className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void togglePipeline(r, "shortlisted")}
                              aria-label={
                                r.pipelineStatus === "shortlisted" ? `Remove ${r.name} from shortlist` : `Shortlist ${r.name}`
                              }
                              title={
                                r.pipelineStatus === "shortlisted"
                                  ? "Remove from shortlist"
                                  : "Shortlist (click the pill to add a note)"
                              }
                              className={cn(
                                "h-7 w-7",
                                r.pipelineStatus === "shortlisted"
                                  ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-400"
                                  : "text-zinc-500 dark:text-zinc-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-400"
                              )}
                            >
                              <Star className={cn("h-3.5 w-3.5", r.pipelineStatus === "shortlisted" && "fill-current")} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void togglePipeline(r, "rejected")}
                              aria-label={
                                r.pipelineStatus === "rejected" ? `Clear the rejection for ${r.name}` : `Reject ${r.name}`
                              }
                              title={
                                r.pipelineStatus === "rejected"
                                  ? "Clear the rejection"
                                  : "Reject (click the pill to add a note)"
                              }
                              className={cn(
                                "h-7 w-7",
                                r.pipelineStatus === "rejected"
                                  ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-400"
                                  : "text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-400"
                              )}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => void toggleArchiveSingle(r)}
                              aria-label={r.archived ? `Restore ${r.name} from archive` : `Archive ${r.name}`}
                              title={r.archived ? "Restore from archive" : "Archive (soft-delete)"}
                              className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-400"
                            >
                              {r.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget(r)}
                              aria-label={`Delete ${r.name}`}
                              className="h-7 w-7 text-zinc-500 dark:text-zinc-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" /> Delete “{deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-500 dark:text-zinc-400">
              This permanently removes the candidate with all resumes, assessments, submissions and their verified
              report. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) void deleteSingle(deleteTarget);
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {bulkBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* duplicates finder */}
      <DuplicatesDialog open={dupOpen} onOpenChange={setDupOpen} rows={rows ?? []} onChanged={() => void reload()} />

      {/* recruiter invite */}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={() => void reload()} />

      {/* pipeline decision */}
      <PipelineDialog target={pipelineTarget} onOpenChange={(o) => !o && setPipelineTarget(null)} onSaved={() => void reload()} />

      {/* candidate journey timeline */}
      <JourneyDialog target={journeyTarget} onOpenChange={(o) => !o && setJourneyTarget(null)} />

      {/* role-fit weights editor */}
      <RoleFitDialog
        open={roleFitOpen}
        onOpenChange={setRoleFitOpen}
        rows={rows ?? []}
        weights={fitWeights}
        presetId={fitPresetId}
        onApply={(w, id, sort) => {
          applyFitWeights(w, id);
          if (sort) setFitOrder(true);
        }}
        fitOrder={fitOrder}
        onToggleFitOrder={setFitOrder}
      />

      {/* JD → evidence-based role match ranking */}
      <RoleMatchDialog open={roleMatchOpen} onOpenChange={setRoleMatchOpen} />

      {compareIds.length > 0 && compareRows.length < 2 && (
        <p className="mt-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {compareRows.length === 1
            ? `1 candidate selected — pick at least one more to compare.`
            : ""}
        </p>
      )}
    </div>
  );
}

// ─── Duplicates finder — same normalized name or email ─────────────────────

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function DuplicatesDialog({
  open,
  onOpenChange,
  rows,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: CandidateRow[];
  onChanged: () => Promise<void> | void;
}) {
  const groups = useMemo(() => {
    const byName = new Map<string, CandidateRow[]>();
    const byEmail = new Map<string, CandidateRow[]>();
    for (const r of rows) {
      const nk = normalizeKey(r.name);
      if (nk) {
        const arr = byName.get(nk) ?? [];
        arr.push(r);
        byName.set(nk, arr);
      }
      if (r.email) {
        const ek = normalizeKey(r.email);
        const arr = byEmail.get(ek) ?? [];
        arr.push(r);
        byEmail.set(ek, arr);
      }
    }
    // merge email groups into name groups (union-find lite: merge by shared member ids)
    const merged = new Map<string, { key: string; reason: string; members: CandidateRow[] }>();
    const idToGroup = new Map<string, string>();
    const addMember = (key: string, reason: string, r: CandidateRow) => {
      const existingKey = idToGroup.get(r.id);
      if (existingKey && existingKey !== key) {
        // merge group `key` into `existingKey`
        const a = merged.get(existingKey)!;
        const b = merged.get(key);
        if (b) {
          a.members.push(...b.members.filter((m) => !a.members.some((x) => x.id === m.id)));
          a.reason = a.reason === b.reason ? a.reason : `${a.reason} · ${b.reason}`;
          merged.delete(key);
          for (const m of b.members) idToGroup.set(m.id, existingKey);
        }
        return;
      }
      const g = merged.get(key) ?? { key, reason, members: [] };
      if (!g.members.some((m) => m.id === r.id)) g.members.push(r);
      merged.set(key, g);
      idToGroup.set(r.id, key);
    };
    for (const [key, arr] of byName) if (arr.length > 1) for (const r of arr) addMember(`n:${key}`, "same name", r);
    for (const [key, arr] of byEmail) if (arr.length > 1) for (const r of arr) addMember(`e:${key}`, "same email", r);

    return Array.from(merged.values())
      .map((g) => ({ ...g, members: [...g.members].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)) }))
      .filter((g) => g.members.length > 1);
  }, [rows]);

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** groupKey → id of the profile to keep when merging the group */
  const [keepChoice, setKeepChoice] = useState<Record<string, string>>({});
  const [mergeBusyKey, setMergeBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPending(new Set());
      setKeepChoice({});
      setMergeBusyKey(null);
    }
  }, [open]);

  const keepBest = (group: (typeof groups)[number]) => {
    // members are pre-sorted by score desc; keep the first, mark the rest
    const next = new Set<string>();
    for (const m of group.members.slice(1)) next.add(m.id);
    setPending(next);
    setKeepChoice((c) => ({ ...c, [group.key]: group.members[0].id }));
  };
  const keepNewest = (group: (typeof groups)[number]) => {
    const newest = [...group.members].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    const next = new Set<string>();
    for (const m of group.members) if (m.id !== newest.id) next.add(m.id);
    setPending(next);
    setKeepChoice((c) => ({ ...c, [group.key]: newest.id }));
  };

  /** toggle a member's delete-mark; if the merge-keep gets marked, move the keep */
  const togglePendingMember = (group: (typeof groups)[number], id: string) => {
    const next = new Set(pending);
    const willMark = !next.has(id);
    if (willMark) next.add(id);
    else next.delete(id);
    setPending(next);
    const keepId = keepChoice[group.key] ?? group.members[0].id;
    if (willMark && id === keepId) {
      // keep was delete-marked — move the merge-keep to the best non-marked member
      const fallback = group.members.find((m) => m.id !== id && !next.has(m.id));
      setKeepChoice((c) => ({ ...c, [group.key]: fallback?.id ?? id }));
    }
  };

  const commitMerge = async (group: (typeof groups)[number]) => {
    const keepId = keepChoice[group.key] ?? group.members[0].id;
    const keepName = group.members.find((m) => m.id === keepId)?.name ?? "this profile";
    const mergeIds = group.members.filter((m) => m.id !== keepId).map((m) => m.id);
    if (mergeIds.length === 0) {
      toast.warning("Nothing to merge — only one profile in this group");
      return;
    }
    setMergeBusyKey(group.key);
    try {
      const res = await fetch("/api/candidates/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, mergeIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Merged ${data.merged} profile${data.merged === 1 ? "" : "s"} into ${keepName}`, {
        description: `${data.movedAssessments} assessment${data.movedAssessments === 1 ? "" : "s"} · ${data.movedResumes} resume${data.movedResumes === 1 ? "" : "s"} moved — tags & notes preserved`,
      });
      setPending((cur) => {
        const next = new Set(cur);
        for (const id of mergeIds) next.delete(id);
        return next;
      });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeBusyKey(null);
    }
  };

  const commitDelete = async () => {
    if (pending.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: Array.from(pending) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Cleaned up ${data.affected} duplicate profile${data.affected === 1 ? "" : "s"}`);
      onOpenChange(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Duplicates &amp; merge
          </DialogTitle>
          <DialogDescription>
            {groups.length === 0
              ? "No duplicates found — every profile has a unique name and email."
              : "Profiles sharing the same name or email. Merge them into one profile (evidence is preserved), or delete false positives."}
          </DialogDescription>
        </DialogHeader>
        {groups.length > 0 ? (
          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((g) => {
              const keepId = keepChoice[g.key] ?? g.members[0].id;
              const others = g.members.filter((m) => m.id !== keepId);
              return (
                <div key={g.key} className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {g.members[0].name} <span className="text-zinc-500 dark:text-zinc-400">· {g.reason} · {g.members.length} profiles</span>
                    </p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => keepBest(g)} className="h-7 border-emerald-300 dark:border-emerald-700 px-2 text-[11px] text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
                        Keep best score
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => keepNewest(g)} className="h-7 border-zinc-300 dark:border-zinc-700 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                        Keep newest
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {g.members.map((m) => {
                      const isPending = pending.has(m.id);
                      const isKeep = m.id === keepId;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                            isKeep
                              ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                              : isPending
                                ? "border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40"
                                : "border-transparent hover:border-border hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                          )}
                        >
                          <button
                            type="button"
                            role="radio"
                            aria-checked={isKeep}
                            aria-label={`Keep ${m.name} (${m.overall ?? "in progress"}) when merging`}
                            onClick={() => setKeepChoice((c) => ({ ...c, [g.key]: m.id }))}
                            title={isKeep ? "Merge target — other profiles merge into this one" : "Choose as merge target"}
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                              isKeep
                                ? "border-emerald-600 dark:border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                : "border-zinc-400 dark:border-zinc-600 text-transparent hover:border-emerald-400 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400"
                            )}
                          >
                            <Crown className="h-3 w-3" />
                          </button>
                          <span className={cn("min-w-0 flex-1 truncate font-medium text-zinc-700 dark:text-zinc-300", isPending && "line-through opacity-60")}>
                            {m.name}
                            {isKeep && <span className="ml-1.5 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">merge target</span>}
                          </span>
                          <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{new Date(m.createdAt).toLocaleDateString()}</span>
                          <span className="shrink-0 font-mono" style={{ color: m.overall != null ? scoreColor(m.overall) : "#71717a" }}>
                            {m.overall ?? "in progress"}
                          </span>
                          <Checkbox
                            checked={isPending}
                            onCheckedChange={() => togglePendingMember(g, m.id)}
                            aria-label={`Mark ${m.name} (${m.overall ?? "in progress"}) for deletion`}
                            className="shrink-0 border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-rose-600 data-[state=checked]:bg-rose-600 data-[state=checked]:text-white"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 dark:border-zinc-700 pt-2.5">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {others.length > 0
                        ? `Merges ${others.length} other profile${others.length === 1 ? "" : "s"} — assessments, resumes, certificates, journey history, tags & notes are preserved.`
                        : "Nothing left to merge in this group."}
                    </p>
                    <Button
                      size="sm"
                      disabled={others.length === 0 || mergeBusyKey === g.key || busy}
                      onClick={() => void commitMerge(g)}
                      className="h-7 bg-zinc-950 dark:bg-zinc-100 px-2.5 text-[11px] font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                    >
                      {mergeBusyKey === g.key ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <GitMerge className="mr-1 h-3 w-3" />
                      )}
                      Merge into “{g.members.find((m) => m.id === keepId)?.name.split(" ")[0] ?? "…"}”
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
            <ScanSearch className="h-8 w-8 text-zinc-500 dark:text-zinc-400" />
            <p className="text-sm text-muted-foreground">All clean. Nothing to merge or remove.</p>
          </div>
        )}
        {groups.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {pending.size} profile{pending.size === 1 ? "" : "s"} marked for deletion
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPending(new Set())} className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                Reset
              </Button>
              <Button
                size="sm"
                disabled={pending.size === 0 || busy}
                onClick={() => void commitDelete()}
                className="h-8 bg-rose-600 text-xs text-white hover:bg-rose-700"
              >
                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                Delete marked
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Side-by-side compare panel ─────────────────────────────────────────────

function ComparePanel({
  rows,
  fitWeights,
  onClear,
}: {
  rows: CandidateRow[];
  fitWeights: FitWeights;
  onClear: () => void;
}) {
  const leader = [...rows].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];
  const runnerUp = [...rows].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[1];
  const lowestRisk = [...rows].sort((a, b) => (a.aiRisk ?? 999) - (b.aiRisk ?? 999))[0];

  // per-candidate role-fit against the recruiter's current weights
  const fits = useMemo(
    () => new Map(rows.map((r) => [r.id, computeFit(r, fitWeights)])),
    [rows, fitWeights]
  );
  const bestFit = useMemo(() => {
    const scored = rows
      .map((r) => ({ r, fit: computeFit(r, fitWeights) }))
      .filter((x): x is { r: CandidateRow; fit: number } => x.fit != null)
      .sort((a, b) => b.fit - a.fit);
    return scored[0] ?? null;
  }, [rows, fitWeights]);
  const anyFit = useMemo(() => Array.from(fits.values()).some((f) => f != null), [fits]);

  const skillUnion = useMemo(() => {
    const map = new Map<string, Array<{ name: string; score: number; color: string }>>();
    for (const r of rows) {
      for (const s of r.skills.filter((x) => x.assessed)) {
        if (!map.has(s.skill)) map.set(s.skill, []);
      }
    }
    for (const [skill] of map) {
      map.set(
        skill,
        rows.map((r, i) => ({
          name: r.name,
          score: r.skills.find((x) => x.skill === skill && x.assessed)?.score ?? 0,
          color: COMPARE_COLORS[i % COMPARE_COLORS.length],
        }))
      );
    }
    return Array.from(map.entries()).sort(
      (a, b) => Math.max(...b[1].map((x) => x.score)) - Math.max(...a[1].map((x) => x.score))
    );
  }, [rows]);

  const radarSeries = useMemo(() => {
    const withCats = rows.filter((r) => r.categories);
    if (withCats.length < 2) return null;
    const axes = Object.keys(withCats[0].categories!) as Array<keyof CategoryScores>;
    return {
      axes,
      series: withCats.map((r, i) => ({
        label: r.name,
        color: COMPARE_COLORS[i % COMPARE_COLORS.length],
        values: axes.map((a) => ({ label: a.replace(/([A-Z])/g, " $1").trim(), score: r.categories![a] })),
      })),
    };
  }, [rows]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <Card className="mb-6 border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4.5 w-4.5 text-[#5c7250] dark:text-[#a9c29b]" /> Side-by-side compare
          </CardTitle>
          <CardAction>
            <Button size="sm" variant="ghost" onClick={onClear} className="h-7 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* summary verdict */}
          <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            <p>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{leader.name}</span> leads with{" "}
              <span className="font-mono font-semibold" style={{ color: scoreColor(leader.overall ?? 0) }}>
                {leader.overall}
              </span>
              {runnerUp && leader !== runnerUp && (
                <> — {Math.max(1, (leader.overall ?? 0) - (runnerUp.overall ?? 0))} point(s) ahead of {runnerUp.name}</>
              )}
              {lowestRisk && <> · lowest AI-assist risk: <span className="text-zinc-900 dark:text-zinc-100">{lowestRisk.name}</span> ({lowestRisk.aiRisk}%)</>}
              {bestFit && (
                <>
                  {" · "}best role fit:{" "}
                  <span className="font-semibold" style={{ color: scoreColor(bestFit.fit) }}>
                    {bestFit.r.name} ({bestFit.fit}%)
                  </span>
                </>
              )}
            </p>
          </div>

          {/* candidate mini cards */}
          <div
            className={cn(
              "grid gap-3",
              rows.length === 2 ? "sm:grid-cols-2" : rows.length === 3 ? "sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            )}
          >
            {rows.map((r, i) => {
              const fit = fits.get(r.id) ?? null;
              return (
                <div
                  key={r.id}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-4"
                  style={{ boxShadow: `inset 0 -2px 0 0 ${COMPARE_COLORS[i % COMPARE_COLORS.length]}` }}
                >
                  <div className="relative">
                    <ScoreRing score={r.overall ?? 0} size={rows.length > 3 ? 68 : 86} stroke={rows.length > 3 ? 7 : 8} label="overall" />
                    {r.id === leader.id && (
                      <span
                        title="Highest overall score in this comparison"
                        className="absolute -top-1.5 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400"
                      >
                        <Crown className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="max-w-full truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{r.name}</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    <ConfidenceBadge level={r.confidence} />
                    {r.aiRisk != null && <RiskBadge risk={r.aiRisk} />}
                  </div>
                  {fit != null && (
                    <div
                      title="Weighted role-fit against your current weights"
                      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        color: scoreColor(fit),
                        borderColor: `${scoreColor(fit)}55`,
                        backgroundColor: `${scoreColor(fit)}14`,
                      }}
                    >
                      <Target className="h-3 w-3" /> {fit}% fit
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {anyFit && (
            <p className="flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <Target className="h-3 w-3 text-emerald-600/70 dark:text-emerald-400/70" /> Role fit is weighted against your current weights — tune them via “Role fit” above.
            </p>
          )}

          {/* category radar overlay */}
          {radarSeries && (
            <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-4">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Category profile overlay</p>
              <RadarChart series={radarSeries.series} />
            </div>
          )}

          {/* per-skill grouped bars */}
          <div className="space-y-3 rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Skill-by-skill (0–100)</p>
            {skillUnion.map(([skill, entries]) => (
              <div key={skill} className="space-y-1">
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{skill}</p>
                {entries.map((e) => (
                  <div key={e.name} className="flex items-center gap-2">
                    <span className="w-24 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{e.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: e.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, e.score)}%` }}
                        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                    <span className="w-7 text-right font-mono text-[11px]" style={{ color: scoreColor(e.score) }}>
                      {e.score}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string }) {
  const numeric = Number(value);
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  return (
    <Card className="group relative min-w-0 overflow-hidden rounded-md border-border bg-card shadow-none">
      {/* hover — a 2px sage rule slides in along the top edge (ledger tick) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-[#5c7250] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
      <CardContent className="min-w-0 p-3 sm:p-4">
        <p className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 bg-[#5c7250]" aria-hidden />
          <span className="min-w-0 truncate" title={label}>{label}</span>
          <span className={cn("ml-auto shrink-0 text-zinc-400 dark:text-zinc-400 transition-colors group-hover:text-zinc-500 dark:group-hover:text-zinc-400", accent)}>{icon}</span>
        </p>
        <p className="mt-2 font-display text-3xl font-semibold leading-none text-zinc-900 dark:text-zinc-100 tabular-nums">
          {Number.isFinite(numeric) ? animated : value}
        </p>
        <div aria-hidden className="mt-2.5 h-px bg-zinc-200 dark:bg-zinc-800" />
        {sub && <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Attempt sparkline (per-candidate run history) ─────────────────────────

function AttemptSparkline({ runs }: { runs: Array<{ date: string; overall: number }> }) {
  const W = 56;
  const H = 18;
  const P = 2;
  const n = runs.length;
  const x = (i: number) => (n === 1 ? W / 2 : P + (i / (n - 1)) * (W - 2 * P));
  const y = (s: number) => P + (1 - s / 100) * (H - 2 * P);
  const pts = runs.map((r, i) => `${x(i).toFixed(1)},${y(r.overall).toFixed(1)}`).join(" ");
  const delta = runs[n - 1].overall - runs[0].overall;
  const lineColor = delta > 0 ? "#059669" : delta < 0 ? "#f43f5e" : "#a1a1aa";
  const trail = runs.map((r) => r.overall).join(" → ");
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="overflow-visible"
      role="img"
      aria-label={`Run history: ${trail}`}
    >
      <title>{`${n} verified runs: ${trail} (latest ${runs[n - 1].overall})`}</title>
      <polyline
        points={pts}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {runs.map((r, i) => (
        <circle key={i} cx={x(i)} cy={y(r.overall)} r={i === n - 1 ? 2.4 : 1.6} fill={scoreColor(r.overall)} />
      ))}
    </svg>
  );
}

// ─── Role-fit weights editor ────────────────────────────────────────────────

const FIT_PRESET_ICONS: Record<string, LucideIcon> = {
  balanced: Scale,
  backend: Wrench,
  frontend: Palette,
  fullstack: Layers,
  qa: Bug,
  platform: Cog,
};

function RoleFitDialog({
  open,
  onOpenChange,
  rows,
  weights,
  presetId,
  onApply,
  fitOrder,
  onToggleFitOrder,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: CandidateRow[];
  weights: FitWeights;
  presetId: string;
  onApply: (w: FitWeights, presetId: string, sort: boolean) => void;
  fitOrder: boolean;
  onToggleFitOrder: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RoleFitDialogContent
          rows={rows}
          weights={weights}
          presetId={presetId}
          onApply={onApply}
          fitOrder={fitOrder}
          onToggleFitOrder={onToggleFitOrder}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function RoleFitDialogContent({
  rows,
  weights,
  presetId,
  onApply,
  fitOrder,
  onToggleFitOrder,
  onClose,
}: {
  rows: CandidateRow[];
  weights: FitWeights;
  presetId: string;
  onApply: (w: FitWeights, presetId: string, sort: boolean) => void;
  fitOrder: boolean;
  onToggleFitOrder: (v: boolean) => void;
  onClose: () => void;
}) {
  // fresh draft per open (content remounts when the dialog opens)
  const [draft, setDraft] = useState<FitWeights>(weights);
  const [draftPreset, setDraftPreset] = useState(presetId);
  // server-saved presets (recruiter team can reuse them across devices)
  const [saved, setSaved] = useState<Array<{ id: string; name: string; weights: Partial<FitWeights> }> | null>(null);
  const [savedApplied, setSavedApplied] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [presetBusy, setPresetBusy] = useState(false);
  /** preset being renamed — the Save button commits the rename via save+delete */
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/fit-presets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d) => {
        if (alive) setSaved(d.presets ?? []);
      })
      .catch(() => {
        if (alive) setSaved([]); // non-fatal — built-ins still work
      });
    return () => {
      alive = false;
    };
  }, []);

  const applySaved = (p: { id: string; name: string; weights: Partial<FitWeights> }) => {
    setDraft({ ...ROLE_PRESETS[0].weights, ...p.weights });
    setDraftPreset("__saved__");
    setSavedApplied(p.id);
  };

  const saveCurrent = async () => {
    const name = saveName.trim();
    if (!name || presetBusy) return;
    setPresetBusy(true);
    try {
      // Rename flow: create the new name with the source's CURRENT weights
      // (which are live in the draft), then delete the source preset.
      if (renameTarget) {
        if (name === renameTarget.name) {
          toast.info("Pick a different name to rename the preset");
          return;
        }
        const res = await fetch("/api/fit-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, weights: draft }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const createdId = data.preset.id as string;
        if (createdId !== renameTarget.id) {
          const del = await fetch(`/api/fit-presets/${renameTarget.id}`, { method: "DELETE" });
          if (!del.ok) throw new Error((await del.json()).error);
        }
        setSaved((cur) =>
          (cur ?? [])
            .filter((p) => p.id !== renameTarget.id && p.name !== name)
            .concat([{ id: createdId, name, weights: data.preset.weights }])
        );
        setSavedApplied((cur) => (cur === renameTarget.id ? createdId : cur));
        setDraftPreset("__saved__");
        setSaveName("");
        setRenameTarget(null);
        toast.success(`Preset renamed to “${name}”`);
        return;
      }
      const existed = (saved ?? []).some((p) => p.name === name);
      const res = await fetch("/api/fit-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, weights: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved((cur) => {
        const list = (cur ?? []).filter((p) => p.name !== name);
        return [...list, { id: data.preset.id, name, weights: data.preset.weights }];
      });
      setSavedApplied(data.preset.id);
      setDraftPreset("__saved__");
      setSaveName("");
      toast.success(existed ? `Preset “${name}” updated` : `Preset “${name}” saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save preset");
    } finally {
      setPresetBusy(false);
    }
  };

  /** Duplicate a saved preset under a fresh unique name (same weights). */
  const duplicateSaved = async (p: { id: string; name: string; weights: Partial<FitWeights> }) => {
    if (presetBusy) return;
    const existing = new Set((saved ?? []).map((x) => x.name));
    let base = `${p.name} copy`;
    let n = 2;
    while (existing.has(base)) base = `${p.name} copy ${n++}`;
    setPresetBusy(true);
    try {
      const res = await fetch("/api/fit-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: base, weights: { ...ROLE_PRESETS[0].weights, ...p.weights } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved((cur) => [...(cur ?? []), { id: data.preset.id, name: base, weights: data.preset.weights }]);
      toast.success(`Duplicated as “${base}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate preset");
    } finally {
      setPresetBusy(false);
    }
  };

  const deleteSaved = async (p: { id: string; name: string }) => {
    if (presetBusy) return;
    setPresetBusy(true);
    try {
      const res = await fetch(`/api/fit-presets/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaved((cur) => (cur ?? []).filter((x) => x.id !== p.id));
      if (savedApplied === p.id) {
        setSavedApplied(null);
        setDraftPreset("custom");
      }
      toast.success(`Preset “${p.name}” deleted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete preset");
    } finally {
      setPresetBusy(false);
    }
  };

  const ranked = useMemo(
    () =>
      rows
        .filter((r) => r.overall != null && !r.archived)
        .map((r) => ({ r, fit: computeFit(r, draft) }))
        .sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || (b.r.overall ?? 0) - (a.r.overall ?? 0)),
    [rows, draft]
  );
  const best = ranked[0] ?? null;
  const totalW = CATEGORY_KEYS.reduce((a, k) => a + draft[k], 0);

  const setWeight = (k: CategoryKey, v: number) => {
    setDraft((cur) => ({ ...cur, [k]: v }));
    setDraftPreset("custom");
    setSavedApplied(null);
  };

  const applyPreset = (p: RolePreset) => {
    setDraft(p.weights);
    setDraftPreset(p.id);
    setSavedApplied(null);
  };

  return (
    <DialogContent className="max-h-[88vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Target className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" /> Role-fit weights
        </DialogTitle>
        <DialogDescription>
          Re-weight the verification categories for the role you are hiring for, then rank candidates by how well
          their verified evidence matches. Weights are normalized automatically.
        </DialogDescription>
      </DialogHeader>

        {/* presets */}
        <div className="flex flex-wrap gap-1.5">
          {ROLE_PRESETS.map((p) => {
            const Icon = FIT_PRESET_ICONS[p.id];
            return (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                title={p.blurb}
                aria-pressed={draftPreset === p.id}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  draftPreset === p.id
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400"
                    : "border-zinc-300 dark:border-zinc-700 bg-transparent text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                {Icon ? <Icon className="mr-1 h-3 w-3" aria-hidden /> : null}
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="-mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          {draftPreset === "custom"
            ? "Custom weights — tuned by hand"
            : draftPreset === "__saved__"
              ? `Saved preset: ${saved?.find((p) => p.id === savedApplied)?.name ?? ""}`
              : (saved?.find((p) => p.id === draftPreset)
                  ? `Saved preset: ${saved.find((p) => p.id === draftPreset)!.name}`
                  : ROLE_PRESETS.find((p) => p.id === draftPreset)?.blurb)}
        </p>

        {/* recruiter-saved presets (server-side, shared across devices) */}
        <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <Bookmark className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Team presets
            </p>
            {saved === null ? (
              <span className="text-[10px] text-zinc-600 dark:text-zinc-300">loading…</span>
            ) : saved.length === 0 ? (
              <span className="text-[10px] text-zinc-600 dark:text-zinc-300">none saved yet</span>
            ) : (
              <span className="text-[10px] text-zinc-600 dark:text-zinc-300">{saved.length}/12</span>
            )}
          </div>
          {saved && saved.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {saved.map((p) => (
                <span key={p.id} className="group flex items-center overflow-hidden rounded-full border border-teal-200 dark:border-teal-800/60 bg-teal-50 dark:bg-teal-950/40">
                  <button
                    onClick={() => applySaved(p)}
                    title={(() => {
                      const topW = (Object.entries(p.weights) as Array<[CategoryKey, number]>)
                        .filter(([, v]) => v > 0)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 2)
                        .map(([k, v]) => `${CATEGORY_LABELS[k]} ${v}`)
                        .join(", ");
                      return topW ? `Apply “${p.name}” — emphasizes ${topW}` : "Apply this saved preset";
                    })()}
                    aria-pressed={savedApplied === p.id}
                    className={cn(
                      "py-1 pl-2.5 pr-1.5 text-xs transition-colors",
                      savedApplied === p.id ? "bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-400" : "text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 hover:text-teal-800 dark:hover:text-teal-400"
                    )}
                  >
                    <BookmarkCheck className="mr-1 inline h-3 w-3" aria-hidden />
                    {p.name}
                  </button>
                  <button
                    onClick={() => void duplicateSaved(p)}
                    disabled={presetBusy}
                    title={`Duplicate preset “${p.name}”`}
                    aria-label={`Duplicate preset ${p.name}`}
                    className="h-full px-1.5 py-1 text-teal-700/60 dark:text-teal-400/60 transition-colors hover:bg-teal-100 dark:hover:bg-teal-900/40 hover:text-teal-800 dark:hover:text-teal-400 disabled:opacity-40"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => {
                      setRenameTarget({ id: p.id, name: p.name });
                      setSaveName(p.name);
                    }}
                    disabled={presetBusy}
                    title={`Rename preset “${p.name}”`}
                    aria-label={`Rename preset ${p.name}`}
                    className="h-full px-1.5 py-1 text-teal-700/60 dark:text-teal-400/60 transition-colors hover:bg-teal-100 dark:hover:bg-teal-900/40 hover:text-teal-800 dark:hover:text-teal-400 disabled:opacity-40"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => void deleteSaved(p)}
                    disabled={presetBusy}
                    title={`Delete preset “${p.name}”`}
                    aria-label={`Delete preset ${p.name}`}
                    className="h-full px-1.5 py-1 text-teal-700/60 dark:text-teal-400/60 transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/40 hover:text-rose-700 dark:hover:text-rose-400 disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveCurrent();
                if (e.key === "Escape" && renameTarget) {
                  setRenameTarget(null);
                  setSaveName("");
                }
              }}
              placeholder={renameTarget ? `New name for “${renameTarget.name}”…` : "Name this tuning to reuse it (e.g. Senior backend)"}
              maxLength={32}
              aria-label="Preset name"
              className={cn(
                "h-8 flex-1 border bg-transparent text-xs placeholder:text-zinc-500",
                renameTarget ? "border-teal-400 dark:border-teal-500 text-teal-900 dark:text-teal-300" : "border-zinc-300 dark:border-zinc-700"
              )}
            />
            {renameTarget && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRenameTarget(null);
                  setSaveName("");
                }}
                title="Cancel the rename"
                className="h-8 px-2 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={!saveName.trim() || presetBusy}
              onClick={() => void saveCurrent()}
              title={renameTarget ? `Rename “${renameTarget.name}” to the entered name` : "Save the current weights as a named team preset"}
              className="h-8 border-teal-300 dark:border-teal-700 px-2.5 text-xs text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40"
            >
              {presetBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : renameTarget ? <Check className="mr-1 h-3 w-3" /> : <BookmarkPlus className="mr-1 h-3 w-3" />}
              {renameTarget ? "Rename" : "Save"}
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600 dark:text-zinc-300">
            {renameTarget
              ? `Renaming “${renameTarget.name}” — the weights currently in the draft will be saved under the new name.`
              : "Saved server-side — presets persist across devices and can be shared with the hiring team. Saving an existing name overwrites it."}
          </p>
        </div>

        {/* sliders */}
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {CATEGORY_KEYS.map((k) => (
            <div key={k} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={`fit-w-${k}`} className="text-xs text-zinc-700 dark:text-zinc-300">
                  {CATEGORY_LABELS[k]}
                </label>
                <span className="rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-1.5 font-mono text-[11px] text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {draft[k]}
                </span>
              </div>
              <Slider
                id={`fit-w-${k}`}
                value={[draft[k]]}
                min={0}
                max={40}
                step={1}
                onValueChange={(v) => setWeight(k, v[0] ?? 0)}
                aria-label={`${CATEGORY_LABELS[k]} weight`}
                className="[&_[data-slot=slider-track]]:border-zinc-300 [&_[data-slot=slider-track]]:bg-zinc-200 [&_[data-slot=slider-range]]:bg-zinc-950 [&_[data-slot=slider-thumb]]:border-zinc-950 [&_[data-slot=slider-thumb]]:bg-zinc-950 [&_[data-slot=slider-thumb]]:text-zinc-50 dark:[&_[data-slot=slider-track]]:border-zinc-700 dark:[&_[data-slot=slider-track]]:bg-zinc-800 dark:[&_[data-slot=slider-range]]:bg-zinc-100 dark:[&_[data-slot=slider-thumb]]:border-zinc-100 dark:[&_[data-slot=slider-thumb]]:bg-zinc-100 dark:[&_[data-slot=slider-thumb]]:text-zinc-950"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Total weight <span className="font-mono text-zinc-700 dark:text-zinc-300">{totalW}</span> — normalized to 100% when scoring.
        </p>

        {/* ranked preview */}
        <div className="rounded-lg border border-border bg-zinc-50 dark:bg-zinc-800/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Fit ranking preview
          </p>
          {best && (
            <p className="mb-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-400">
              <span className="font-semibold">{best.r.name}</span> fits this role best — {best.fit}% weighted fit
              {best.fit != null && ranked[1]?.fit != null && <> · {Math.max(1, best.fit - ranked[1].fit)} point(s) ahead of {ranked[1].r.name}</>}
            </p>
          )}
          <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {ranked.length === 0 && <p className="text-xs text-muted-foreground">No verified candidates to rank yet.</p>}
            {ranked.map(({ r, fit }, i) => (
              <div key={r.id} className="flex items-center gap-2.5">
                <span className="w-4 text-right font-mono text-[10px] text-zinc-600 dark:text-zinc-300">{i + 1}</span>
                <span className="w-28 truncate text-xs text-zinc-700 dark:text-zinc-300" title={r.name}>{r.name}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${fit ?? 0}%`, backgroundColor: scoreColor(fit ?? 0) }}
                  />
                </div>
                <span className="w-7 text-right font-mono text-xs font-semibold" style={{ color: scoreColor(fit ?? 0) }}>
                  {fit ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <Checkbox
              checked={fitOrder}
              onCheckedChange={(v) => onToggleFitOrder(v === true)}
              aria-label="Sort the candidate table by role fit"
              className="border-zinc-400 dark:border-zinc-600 data-[state=checked]:border-zinc-950 data-[state=checked]:bg-zinc-950 data-[state=checked]:text-zinc-50"
            />
            Sort the table by role fit
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(ROLE_PRESETS[0].weights);
                setDraftPreset(ROLE_PRESETS[0].id);
              }}
              className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Reset
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onApply(draft, draftPreset === "__saved__" && savedApplied ? savedApplied : draftPreset, fitOrder);
                onClose();
                toast.success(
                  fitOrder
                    ? `Role-fit applied — table sorted by fit`
                    : `Role-fit weights saved`
                );
              }}
              className="h-8 bg-zinc-950 dark:bg-zinc-100 text-xs text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" /> Apply weights
            </Button>
          </div>
        </div>
    </DialogContent>
  );
}

function ReportSheet({
  assessmentId,
  name,
  row,
  onSaved,
}: {
  assessmentId: string;
  name: string;
  row: CandidateRow;
  onSaved?: () => Promise<void> | void;
}) {
  const [report, setReport] = useState<AssessmentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [openRItems, setOpenRItems] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>(row.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [notes, setNotes] = useState(row.notes);
  const [savingMeta, setSavingMeta] = useState(false);
  // attempt history (a candidate may hold several assessments, e.g. after a merge)
  const [activeAssessmentId, setActiveAssessmentId] = useState(assessmentId);
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  // skill certificate (issued via POST /api/certificates, one per assessment)
  const [cert, setCert] = useState<{ code: string; issuedBy: string; issuedAt: string } | null>(null);
  const [certBusy, setCertBusy] = useState(false);

  const load = async (id: string = activeAssessmentId) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/report/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  const loadAttempts = async () => {
    try {
      const res = await fetch(`/api/candidates/${row.id}/attempts`);
      const data = await res.json();
      if (res.ok) setAttempts(data.attempts);
    } catch {
      // attempts are supplementary — never block the sheet
    }
  };

  /** Check whether this assessment already carries an issued certificate. */
  const loadCert = async (id: string) => {
    try {
      const res = await fetch(`/api/certificates?assessmentId=${encodeURIComponent(id)}`);
      const data = await res.json();
      setCert(res.ok ? data.certificate : null);
    } catch {
      setCert(null);
    }
  };

  /** Issue (or re-fetch) the skill certificate for the active assessment. */
  const issueCertificate = async () => {
    setCertBusy(true);
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: activeAssessmentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.certificate) throw new Error(data?.error ?? "Failed to issue certificate");
      setCert({ code: data.certificate.code, issuedBy: data.certificate.issuedBy, issuedAt: data.certificate.issuedAt });
      toast.success(
        data.created ? `Certificate issued — verification code ${data.certificate.code}` : `Certificate already issued — code ${data.certificate.code}`,
        { description: "Share the verify link with the candidate — anyone can check authenticity with the code." }
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue certificate");
    } finally {
      setCertBusy(false);
    }
  };

  const switchAttempt = async (id: string) => {
    if (id === activeAssessmentId) return;
    setActiveAssessmentId(id);
    setOpenRItems([]);
    setCert(null);
    await load(id);
    void loadCert(id);
  };

  /** Download the candidate's full attempt history as CSV (recruiter-side export). */
  const exportAttemptsCsv = () => {
    if (!attempts || attempts.length === 0) return;
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["candidate", "assessment_id", "created", "completed", "status", "overall", "confidence"];
    const lines = attempts.map((a) =>
      [
        esc(row.name),
        esc(a.assessmentId),
        esc(new Date(a.createdAt).toISOString()),
        esc(a.completedAt ? new Date(a.completedAt).toISOString() : ""),
        esc(a.status),
        esc(a.overall != null ? Math.round(a.overall) : ""),
        esc(a.confidence ?? ""),
      ].join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillproof-attempts-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} to CSV`);
  };

  const addTag = () => {
    const t = tagDraft.trim().slice(0, 24);
    if (!t) return;
    if (tags.length >= 12) {
      toast.warning("Up to 12 tags per candidate");
      return;
    }
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/candidates/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Recruiter notes saved");
      await onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <Sheet
      onOpenChange={(open) => {
        if (open && !report) {
          void load();
          void loadAttempts();
          void loadCert(activeAssessmentId);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="border-zinc-300 dark:border-zinc-700">
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto border-zinc-200 dark:border-zinc-700 bg-card p-6 sm:max-w-xl">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-zinc-950 dark:bg-zinc-100">
              <SearchCode className="h-4.5 w-4.5 text-zinc-50 dark:text-zinc-950" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[1.4rem] italic leading-tight text-zinc-900 dark:text-zinc-100">{name}</span>
              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Verified report · evidence on file
              </span>
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Evidence-based skill verification report with scores, confidence, behavior analysis and question breakdown.
          </SheetDescription>
        </SheetHeader>
        {loading && (
          <div className="mt-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full bg-zinc-100 dark:bg-zinc-800" />
            ))}
          </div>
        )}
        {report && (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <ScoreRing score={report.overall} size={92} stroke={8} label="overall" />
              <div className="space-y-1.5">
                <ConfidenceBadge level={report.confidence} />
                <br />
                <RiskBadge risk={report.aiRisk} />
              </div>
            </div>

            {/* full report / share / PDF actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => window.open(`${window.location.origin}/?report=${activeAssessmentId}`, "_blank", "noopener")}
                className="flex-1 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Full report
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  // intentional sharing: only a link carrying the 192-bit
                  // random share token works for anonymous viewers
                  const token = report?.shareToken;
                  const url = token
                    ? `${window.location.origin}/?report=${activeAssessmentId}&t=${token}`
                    : `${window.location.origin}/?report=${activeAssessmentId}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    if (!token) {
                      toast.error("Share token not loaded yet — reopen the report and try again", { description: url });
                    } else {
                      toast.success("Share link copied — anyone with it can view this verified report", { description: url });
                    }
                  } catch {
                    toast.error("Could not copy — link: " + url);
                  }
                }}
                className="flex-1 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
              >
                <Link2 className="mr-2 h-4 w-4" /> Share link
              </Button>
              <Button
                variant="outline"
                disabled={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  try {
                    const res = await fetch(`/api/report/${activeAssessmentId}/pdf`);
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `skillproof-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
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
                className="flex-1 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
              >
                {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} PDF
              </Button>
              <Button
                variant="outline"
                disabled={certBusy}
                onClick={issueCertificate}
                title={cert ? "This assessment already has an issued certificate" : "Issue a verifiable skill certificate with the candidate's proficiency percentages"}
                className={cn(
                  "flex-1 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10",
                  cert && "border-[#5c7250]/40 text-[#5c7250] dark:text-[#a9c29b] hover:bg-[#5c7250]/5 dark:hover:bg-[#5c7250]/15"
                )}
              >
                {certBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Award className="mr-2 h-4 w-4" />}
                {cert ? "Certificate issued" : "Issue certificate"}
              </Button>
            </div>

            {/* issued-certificate strip — stamped double frame on cream stock */}
            {cert && (
              <div className="border border-zinc-300 dark:border-zinc-700 bg-[#faf7f0] p-[3px]">
                <div className="flex flex-wrap items-center gap-3 border border-zinc-200 dark:border-zinc-700 px-3 py-2.5">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#5c7250]/30 bg-card">
                    <Award className="h-4 w-4 text-[#5c7250] dark:text-[#a9c29b]" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Certificate issued — verifiable</p>
                    <p className="font-mono text-[13px] font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">{cert.code}</p>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-zinc-300 dark:border-zinc-700 bg-card px-2.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
                      onClick={() => window.open(`${window.location.origin}/?cert=${cert.code}`, "_blank", "noopener")}
                    >
                      <ExternalLink className="mr-1.5 h-3 w-3" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-zinc-300 dark:border-zinc-700 bg-card px-2.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10"
                      onClick={async () => {
                        const url = `${window.location.origin}/?cert=${cert.code}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success("Certificate verify link copied — share it with the candidate");
                        } catch {
                          toast.error("Could not copy — link: " + url);
                        }
                      }}
                    >
                      <Link2 className="mr-1.5 h-3 w-3" /> Copy link
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* attempt history — switch between multiple verification runs */}
            {attempts && attempts.length > 1 && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Attempt history
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">{attempts.length} verification runs</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={exportAttemptsCsv}
                        aria-label={`Export ${row.name}'s attempt history as CSV`}
                        className="h-7 gap-1 px-2 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {attempts.map((a) => {
                    const isActive = a.assessmentId === activeAssessmentId;
                    const done = a.overall != null;
                    return (
                      <button
                        key={a.assessmentId}
                        type="button"
                        disabled={!done || loading}
                        onClick={() => void switchAttempt(a.assessmentId)}
                        title={
                          done
                            ? `View this ${a.confidence?.toLowerCase() ?? ""} confidence attempt from ${new Date(a.createdAt).toLocaleDateString()}`
                            : "In-progress attempt — no report yet"
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          isActive
                            ? "border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400"
                            : done
                              ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:text-emerald-700 dark:hover:text-emerald-400"
                              : "cursor-not-allowed border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"
                        )}
                      >
                        {done ? (
                          <span className="font-mono" style={{ color: isActive ? undefined : scoreColor(a.overall!) }}>
                            {Math.round(a.overall!)}
                          </span>
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {new Date(a.createdAt).toLocaleDateString()}
                        {!done && <span>· in progress</span>}
                        {isActive && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* recruiter notes & tags */}
            <Card className="border-emerald-200 dark:border-emerald-800/60 bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <StickyNote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Recruiter notes &amp; tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                    >
                      <Tag className="h-3 w-3" /> {t}
                      <button
                        type="button"
                        aria-label={`Remove tag ${t}`}
                        onClick={() => setTags(tags.filter((x) => x !== t))}
                        className="ml-0.5 text-emerald-600/70 dark:text-emerald-400/70 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {tags.length === 0 && <span className="text-xs text-zinc-500 dark:text-zinc-400">No tags yet.</span>}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Add a tag (e.g. shortlist, frontend)…"
                    aria-label="Add tag"
                    className="h-8 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                  <Button size="sm" variant="outline" onClick={addTag} className="h-8 shrink-0 border-zinc-300 dark:border-zinc-700 text-xs">
                    Add
                  </Button>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Private recruiting notes — interview impressions, follow-ups, salary band…"
                  aria-label="Recruiter notes"
                  className="min-h-20 border-zinc-300 dark:border-zinc-700 bg-transparent text-xs placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveMeta}
                    disabled={savingMeta}
                    className="bg-zinc-950 dark:bg-zinc-100 font-semibold text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                  >
                    {savingMeta ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Save notes
                  </Button>
                </div>
              </CardContent>
            </Card>

            {report.skills.map((s: SkillResult) => (
              <Card key={s.skill} className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    {s.skill}
                    <span className="font-mono" style={{ color: scoreColor(s.score) }}>
                      {s.score}/100
                    </span>
                    <ConfidenceBadge level={s.confidence === "NOT_ASSESSED" ? null : s.confidence} className="ml-auto" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <EvidenceBar score={s.score} height="h-1.5" />
                  <ul className="space-y-1">
                    {(s.evidence ?? []).map((e, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" /> {e}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">AI-assistance analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.aiSignals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unusual patterns detected.</p>
                ) : (
                  report.aiSignals.map((s, i) => (
                    <p key={i} className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                      • {s}
                    </p>
                  ))
                )}
                <Separator className="my-2" />
                <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
                  Risk is a verification signal — not proof of AI use. Review alongside explanations and code evolution.
                </p>
              </CardContent>
            </Card>

            {/* persisted proctoring transcript for the active run — evidence behind the risk signals */}
            <ProctorTranscriptCard key={activeAssessmentId} assessmentId={activeAssessmentId} />

            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Question breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" value={openRItems} onValueChange={setOpenRItems}>
                  {report.breakdown.map((b: BreakdownItem, i: number) => (
                    <AccordionItem key={b.aqId} value={`r-${i}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 flex-wrap items-center gap-2 pr-2 text-left">
                          <span
                            className={cn(
                              "flex h-5.5 w-5.5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
                              (b.score ?? 0) >= 70
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                                : (b.score ?? 0) >= 40
                                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-400"
                                  : "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400"
                            )}
                          >
                            {b.score != null ? Math.round(b.score) : "—"}
                          </span>
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{b.questionTitle}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2">
                        <div className="space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <p>
                            {b.skill} · {b.category} · {b.difficulty} · {b.status}
                          </p>
                          {b.testsTotal ? <p>Tests: {b.testsPassed}/{b.testsTotal}</p> : null}
                          {b.complexity ? <p>Complexity: {b.complexity}</p> : null}
                          {b.explainConsistency != null ? <p>Explanation consistency: {Math.round(b.explainConsistency)}%</p> : null}
                          {b.aiRisk != null ? <p>AI risk: {Math.round(b.aiRisk)}%</p> : null}
                          {(b.hintsUsed ?? 0) > 0 && (
                            <p className="text-amber-800 dark:text-amber-400">Hints used: {b.hintsUsed} (−{b.hintPenalty ?? 4}% disclosed adjustment)</p>
                          )}
                          {b.eventSummary && b.eventSummary.length > 0 && (
                            <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-zinc-100">
                              {b.eventSummary.slice(0, 6).map((e, j) => (
                                <div key={j}>{e}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        <CodeEvolutionIfOpen open={openRItems.includes(`r-${i}`)} b={b} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            {/* proof graph for best skill */}
            {(() => {
              const best = [...report.skills].filter((s) => s.assessed).sort((a, b) => b.score - a.score)[0];
              if (!best) return null;
              return (
                <Card className="border-emerald-200 dark:border-emerald-800/60 bg-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Proof Graph — {best.skill}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ProofGraph skill={best.skill} score={best.score} evidence={best.evidence} />
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Role match — JD in, evidence-based ranking out ────────────────────────

interface RoleMatchRow {
  skill: string;
  importance: number;
  minScore: number;
  score: number | null;
  confidence: string | null;
  evidence: string[];
}

interface RoleMatchFit {
  candidateId: string;
  name: string;
  overall: number | null;
  matchPct: number;
  coveragePct: number;
  strengthPct: number | null;
  rows: RoleMatchRow[];
}

interface RoleMatchResult {
  role: string;
  source: "ai" | "heuristic";
  requirements: Array<{ skill: string; importance: number; minScore: number }>;
  fits: RoleMatchFit[];
  candidateCount: number;
}

const SAMPLE_JD = `Senior Backend Engineer — Payments Infrastructure

We are hiring a senior backend engineer to own our payments ledger.

Must have:
- 4+ years of production Node.js and TypeScript
- Strong SQL and data modeling (Postgres); you can write a correlated subquery without flinching
- Solid DSA fundamentals for high-throughput path optimization
- Comfortable debugging at the OS level (syscalls, memory, FD limits)

Nice to have:
- React experience for internal tooling
- Git workflow maturity, code review ownership

We offer a competitive salary and flexible hours.`;

function RoleMatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [jd, setJd] = useState("");
  const [stage, setStage] = useState<"input" | "analyzing" | "result">("input");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoleMatchResult | null>(null);

  // fresh draft per open — reset to the input stage unless a result is already shown
  useEffect(() => {
    if (open) {
      setStage((cur) => (cur === "analyzing" ? "input" : result ? "result" : "input"));
    }
  }, [open, result]);

  useEffect(() => {
    if (stage !== "analyzing") return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const analyze = async () => {
    const text = jd.trim();
    if (text.length < 30 || stage === "analyzing") return;
    setStage("analyzing");
    setError(null);
    try {
      const res = await fetch("/api/recruiter/role-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jd: text }),
      });
      const data = (await res.json()) as RoleMatchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `status ${res.status}`);
      setResult(data);
      setStage("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStage("input");
    }
  };

  const reset = () => {
    setResult(null);
    setStage("input");
    setError(null);
  };

  /** Download the ranking — one row per candidate, one column per requirement. */
  const exportCsv = () => {
    if (!result) return;
    const esc = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "Rank",
      "Candidate",
      "Match %",
      "Coverage %",
      "Strength %",
      "Best overall",
      "Skills verified",
      ...result.requirements.map((r) => `${r.skill} (bar ${r.minScore})`),
    ];
    const rows = result.fits.map((f, i) => [
      i + 1,
      f.name,
      f.matchPct,
      f.coveragePct,
      f.strengthPct ?? "",
      f.overall ?? "",
      `${f.rows.filter((r) => r.score !== null).length}/${f.rows.length}`,
      ...f.rows.map((r) => (r.score === null ? "not verified" : `${r.score}/${r.minScore}`)),
    ]);
    const csv = [header, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
    const slug =
      result.role
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "ranking";
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skillproof-role-match-${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Ranking exported — ${result.fits.length} candidates, ${result.requirements.length} requirements`);
  };

  const matchTone = (pct: number) => (pct >= 70 ? "text-emerald-700 dark:text-emerald-400" : pct >= 40 ? "text-yellow-700" : "text-rose-700 dark:text-rose-400");
  const barTone = (pct: number) => (pct >= 70 ? "bg-emerald-600" : pct >= 40 ? "bg-yellow-500" : "bg-rose-500");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-900 dark:text-zinc-100">
            <ScanSearch className="h-4 w-4 text-zinc-700 dark:text-zinc-300" /> Role match — evidence vs. a job description
          </DialogTitle>
          <DialogDescription>
            Paste a JD. The required skills are extracted, then every verified profile is ranked against the skill
            scores frozen in their reports — no resume adjectives, only evidence.
          </DialogDescription>
        </DialogHeader>

        {stage === "analyzing" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400 dark:text-zinc-400" />
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Extracting requirements · matching against verified evidence…
            </p>
            <p className="font-mono text-[11px] tabular-nums text-zinc-400 dark:text-zinc-400">{elapsed}s elapsed · usually ~15-25s</p>
          </div>
        ) : stage === "result" && result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {result.role} · {result.requirements.length} requirements ·{" "}
                <span className="normal-case tracking-normal">{result.candidateCount} verified profiles ranked</span>{" "}
                · source: {result.source === "ai" ? "AI extraction" : "keyword scan"}
              </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exportCsv}
                    title="Download the ranking as CSV — one row per candidate, one column per requirement"
                    className="h-7 shrink-0 border-zinc-300 dark:border-zinc-700 px-2.5 text-[11px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <Download className="mr-1 h-3 w-3" /> Export CSV
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                    className="h-7 shrink-0 px-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> New JD
                  </Button>
                </div>
            </div>

            {/* requirement board */}
            <div className="flex flex-wrap gap-1.5">
              {result.requirements.map((r) => (
                <span
                  key={r.skill}
                  className="inline-flex items-center gap-1 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
                  title={`Importance ${r.importance}/5 · suggested bar ${r.minScore}`}
                >
                  {r.skill}
                  <span className="text-zinc-400 dark:text-zinc-400">·</span>
                  <span className="tabular-nums">w{r.importance}</span>
                </span>
              ))}
            </div>

            {/* ranked fits */}
            <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
              {result.fits.map((fit, i) => (
                <div key={fit.candidateId} className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{fit.name}</p>
                      {fit.overall !== null && (
                        <span
                          className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                          title="Best verified overall score"
                        >
                          ov {fit.overall}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-mono text-base leading-none font-semibold tabular-nums ${matchTone(fit.matchPct)}`}>
                        {fit.matchPct}%
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-400 dark:text-zinc-400">match</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barTone(fit.matchPct)}`}
                      style={{ width: `${fit.matchPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <span title="Share of required-skill weight with verified evidence">coverage {fit.coveragePct}%</span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span title="Mean verified score across the requirements this candidate actually verified">
                      {fit.strengthPct !== null ? `strength ${fit.strengthPct}%` : "strength —"}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span>
                      {fit.rows.filter((r) => r.score !== null).length}/{fit.rows.length} skills verified
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fit.rows.map((r) => {
                      if (r.score === null) {
                        return (
                          <span
                            key={r.skill}
                            className="inline-flex items-center rounded border border-dashed border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 dark:text-zinc-400"
                            title="No verified evidence for this skill"
                          >
                            {r.skill} · not verified
                          </span>
                        );
                      }
                      const meets = r.score >= r.minScore;
                      return (
                        <span
                          key={r.skill}
                          className={cn(
                            "inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] tabular-nums",
                            meets ? "border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400" : "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                          )}
                          title={
                            r.evidence.length > 0
                              ? `${r.confidence} confidence — ${r.evidence.join("; ")}`
                              : `${r.confidence} confidence · bar ${r.minScore}`
                          }
                        >
                          {r.skill} · {r.score}
                          <span className="opacity-60">/{r.minScore}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Match weights unverified requirements at zero — coverage explains why. Skills map onto the verified
              catalog (DSA, DBMS, Node.js, …); per-skill chips show verified score against the role&apos;s suggested bar.
              For category-level fit (how they work, not what they verified) use <span className="font-medium text-zinc-700 dark:text-zinc-300">Role fit</span> presets.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value.slice(0, 8000))}
              rows={9}
              aria-label="Job description text"
              placeholder={"Senior Backend Engineer — Payments Infrastructure\n\nMust have:\n- 4+ years of production Node.js…"}
              className="resize-none border-zinc-300 dark:border-zinc-700 font-mono text-xs leading-relaxed placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-zinc-950/10 dark:focus-visible:ring-zinc-100/10"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] tabular-nums text-zinc-400 dark:text-zinc-400">{jd.length}/8000</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setJd(SAMPLE_JD)}
                  className="h-8 px-2.5 text-[11px] text-zinc-500 dark:text-zinc-400 hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <StickyNote className="mr-1 h-3 w-3" /> Use a sample JD
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void analyze()}
                  disabled={jd.trim().length < 30}
                  className="h-8 bg-zinc-950 dark:bg-zinc-100 px-3 text-xs text-zinc-50 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-zinc-300"
                >
                  <ScanSearch className="mr-1.5 h-3.5 w-3.5" /> Rank candidates
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-rose-700 dark:text-rose-400" role="alert">
                {error}
              </p>
            )}
            <p className="border-t border-border pt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Ranking uses each candidate&apos;s best verified run and its frozen skill scores. Unverified skills count
              as zero evidence — coverage, not the resume, decides.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
