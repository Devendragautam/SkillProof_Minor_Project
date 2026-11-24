// ─── Shared types for SkillProof ────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionCategory = "coding" | "debugging" | "mcq";
export type ClaimedLevel = "Advanced" | "Intermediate" | "Basic";

export interface TestCase {
  args: unknown[];
  expected: unknown;
  hidden: boolean;
  /** SQL questions only: statements applied (after schema+seed) before running the candidate query */
  setup?: string;
  /** SQL questions only: compare result rows ignoring row order */
  unordered?: boolean;
}

export interface McqOption {
  text: string;
}

/** Question shape sent to the client (no answers, no hidden tests) */
export interface ClientQuestion {
  aqId: string;
  externalId: string;
  skill: string;
  category: QuestionCategory;
  topic: string;
  difficulty: Difficulty;
  title: string;
  description: string;
  fnName?: string;
  starterCode?: string;
  /** SQL questions: CREATE TABLE statements — the UI renders a schema browser from this */
  schemaSql?: string;
  language: string;
  /** Languages the candidate may pick for this question (coding only) */
  languages?: string[];
  /** Per-language starter code keyed by language id */
  starters?: Partial<Record<string, string>>;
  timeLimitSec: number;
  /** Server-authoritative seconds remaining when the question was served —
   *  the browser countdown initializes from this and is only a visual
   *  representation; the server deadline (dealtAt + timeLimitSec) is what
   *  actually governs expiry and scoring. */
  remainingSec?: number;
  points: number;
  visibleTestCount: number;
  options?: string[];
  order: number;
  hasHint: boolean;
  hintsUsed: number;
}

export interface ClientTestResult {
  index: number;
  hidden: boolean;
  pass: boolean;
  error?: string;
  ms: number;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
}

/** One dealt question on the runner's navigation palette */
export interface PaletteRow {
  aqId: string;
  order: number;
  skill: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  /** current | solved | failed | skipped | timeout */
  status: string;
}

export interface CodeVersion {
  t: number; // ms since question start
  code: string;
  label: string;
}

export type BehaviorEventType =
  | "question_open"
  | "first_keystroke"
  | "code_change"
  | "paste"
  | "run"
  | "submit_attempt"
  | "tab_blur"
  | "tab_focus"
  | "snapshot"
  | "hint"
  | "question_skipped";

export interface BehaviorEvent {
  type: BehaviorEventType;
  t: number; // ms since question start
  added?: number;
  removed?: number;
  pastedChars?: number;
  passCount?: number;
  total?: number;
  error?: boolean;
  codeLen?: number;
}

/** Computed behavioral metrics for a submission */
export interface BehaviorMetrics {
  totalMs: number;
  timeToFirstCodeMs: number | null;
  typedChars: number;
  removedChars: number;
  pastedChars: number;
  pasteEvents: number;
  maxSingleInsert: number;
  runs: number;
  errorRuns: number;
  codeChanges: number;
  tabBlurs: number;
  versionCount: number;
  activeEditRatio: number; // fraction of time with recent edits
  charsPerActiveSec: number;
}

export interface CodeAnalysis {
  timeComplexity: string;
  spaceComplexity: string;
  quality: number; // 0-100
  notes: string[];
  source: "ai" | "heuristic";
}

export interface ExplainQuestion {
  q: string;
  hint: string;
}

export interface ExplainEvaluation {
  q: string;
  answer: string;
  score: number; // 0-100 consistency
  feedback: string;
  source: "ai" | "heuristic";
}

export interface SubmissionAiRisk {
  score: number; // 0-100
  signals: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface SkillResult {
  skill: string;
  claimedLevel: ClaimedLevel | null;
  score: number; // 0-100
  confidence: "HIGH" | "MEDIUM" | "LOW" | "NOT_ASSESSED";
  assessed: boolean;
  questionCount: number;
  evidence: string[];
  improvements: string[];
  /** Optional per-skill AI-assist risk percentage emitted by the scoring engine */
  aiRisk?: number | null;
}

export interface CategoryScores {
  problemSolving: number;
  debugging: number;
  efficiency: number;
  codeQuality: number;
  explanation: number;
  timeManagement: number;
  consistency: number;
}

export interface BreakdownItem {
  aqId: string;
  submissionId?: string | null;
  questionTitle: string;
  skill: string;
  category: QuestionCategory;
  difficulty: Difficulty;
  status: string;
  score: number | null;
  timeSpentSec: number | null;
  attempts: number;
  passed: boolean | null;
  testsPassed: number | null;
  testsTotal: number | null;
  complexity?: string | null;
  quality?: number | null;
  explainConsistency?: number | null;
  aiRisk?: number | null;
  eventSummary?: string[];
  versionCount?: number;
  timeLimitSec?: number | null;
  topic?: string;
  hintsUsed?: number;
  hintPenalty?: number | null;
}

export interface AssessmentReport {
  reportId: string;
  assessmentId: string;
  candidateName: string;
  createdAt: string;
  overall: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  aiRisk: number;
  aiRiskConfidence: "LOW" | "MEDIUM" | "HIGH";
  aiSignals: string[];
  skills: SkillResult[];
  categories: CategoryScores;
  breakdown: BreakdownItem[];
  /** disclosed to the owner/recruiter for building intentional share links */
  shareToken?: string;
}

export interface ExtractedSkill {
  name: string;
  level: ClaimedLevel;
  evidence: string;
}

export interface ExtractedProject {
  name: string;
  tech: string[];
}

export interface ExtractedProfile {
  skills: ExtractedSkill[];
  projects: ExtractedProject[];
  summary: string;
  source: "ai" | "heuristic";
}

/** One multiple-choice question extracted from an uploaded question-paper PDF. */
export interface ExtractedMcq {
  title: string;
  options: string[];
  /** 0-based index into options. */
  answerIndex: number;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

export interface ExtractMcqsResult {
  questions: ExtractedMcq[];
  /** "ai" = LLM extraction · "heuristic" = regex/line-based fallback parser. */
  source: "ai" | "heuristic";
}

// ─── Certificates ────────────────────────────────────────────────────────────

/** One verified skill line on a certificate (snapshotted at issue time). */
export interface CertificateSkill {
  name: string;
  /** Verified score 0-100 */
  score: number;
  /** Claimed level at assessment time, when known */
  level?: string | null;
  /** Whether the skill was actually assessed (vs claimed-only) */
  assessed: boolean;
}

/** Public certificate payload — what the verify API and certificate view consume. */
export interface CertificatePayload {
  code: string;
  candidateName: string;
  candidateEmail: string | null;
  /** Internal run id — disclosed to owner/recruiter contexts only; the public
   *  verification payload carries an empty string (verification rides the
   *  random code, never an internal id). */
  assessmentId: string;
  overallScore: number;
  confidence: string;
  skills: CertificateSkill[];
  /** Frozen cohort standing recorded at issue time (null on legacy certificates) */
  cohort: CohortStanding | null;
  issuedBy: string;
  issuedAt: string;
  completedAt: string | null;
}

/**
 * Aggregate cohort standing for a score — no PII, distribution stats only.
 * Live version served by GET /api/cohort; certificates freeze a copy at issue.
 */
export interface CohortStanding {
  size: number;
  median: number | null;
  best: number | null;
  rank: number;
  topPct: number;
  /** When this snapshot was computed (ISO). Absent on live standings. */
  recordedAt?: string | null;
}

export interface SkillPlanItem {
  skill: string;
  claimedLevel: ClaimedLevel;
  coding: number;
  debugging: number;
  mcq: number;
}

export interface AssessmentPlan {
  items: SkillPlanItem[];
  currentDifficulty: Record<string, Difficulty>;
  askedExternalIds: string[];
  startedAt: string;
}

// ─── Recruiter dashboard ─────────────────────────────────────────────────────

export interface DifficultyMixBucket {
  n: number;
  score: number | null;
}

export interface CandidateListRow {
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
    easy: DifficultyMixBucket;
    medium: DifficultyMixBucket;
    hard: DifficultyMixBucket;
  } | null;
  notes: string;
  tags: string[];
  archived: boolean;
}
