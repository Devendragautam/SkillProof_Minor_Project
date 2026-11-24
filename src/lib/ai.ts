import type {
  ExtractedMcq,
  ExtractMcqsResult,
  ExtractedProfile,
  ExtractedSkill,
  ExplainQuestion,
  ExplainEvaluation,
  CodeAnalysis,
} from "./types";
import { SKILL_CATALOG, heuristicLevel, canonicalizeSkill } from "./skills";

// ─── Low-level LLM helper (deployment-portable) ─────────────────────────────
/**
 * Provider resolution, in order:
 *
 * 1. AI_API_KEY set  → OpenAI-compatible HTTPS endpoint built from AI_BASE_URL
 *    + AI_MODEL. Works with Z.ai GLM (https://api.z.ai/api/paas/v4), OpenAI
 *    (https://api.openai.com/v1), OpenRouter, DeepSeek, and any other provider
 *    that exposes POST {base}/chat/completions. This is the production path.
 *
 * 2. AI_API_KEY unset → z-ai-web-dev-sdk fallback, which only carries
 *    credentials inside the Z.ai development sandbox. Everywhere else every
 *    call fails fast and the per-feature heuristic fallbacks below keep the
 *    product fully functional (degraded, never broken).
 *
 * Every AI consumer in the app routes through chat() — no other file needs to
 * know which provider is configured.
 */

interface AiEnvConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function aiEnvConfig(): AiEnvConfig | null {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.AI_BASE_URL?.trim() || "https://api.z.ai/api/paas/v4").replace(/\/+$/, ""),
    model: process.env.AI_MODEL?.trim() || "glm-4.6",
  };
}

/**
 * Which provider will serve the next call — safe to expose (no key material).
 * Surfaced by GET /api/health so deployments can verify AI wiring at a glance.
 */
export function aiProviderInfo(): { configured: boolean; model: string; baseUrl: string } {
  const cfg = aiEnvConfig();
  if (cfg) return { configured: true, model: cfg.model, baseUrl: cfg.baseUrl };
  return { configured: false, model: "(sandbox sdk)", baseUrl: "(sandbox sdk)" };
}

async function chatViaEnvProvider(
  messages: Array<{ role: string; content: string }>,
  cfg: AiEnvConfig,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // GLM models accept Z.ai's thinking switch; generic OpenAI-compatible
    // providers reject unknown params, so only send it to glm-* models.
    const isGlm = cfg.model.toLowerCase().startsWith("glm");
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        ...(isGlm ? { thinking: { type: "disabled" } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as {
        error?: { message?: string } | string;
      } | null;
      const msg = typeof detail?.error === "string" ? detail.error : detail?.error?.message;
      console.error(`AI provider ${cfg.baseUrl} responded ${res.status}:`, msg ?? "(no detail)");
      return null;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    return content && content.trim().length > 0 ? content : null;
  } catch (err) {
    console.error(
      "AI provider call failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let sandboxFallbackWarned = false;

async function chatViaSandboxSdk(
  messages: Array<{ role: string; content: string }>,
  timeoutMs: number
): Promise<string | null> {
  if (!sandboxFallbackWarned && process.env.NODE_ENV === "production") {
    sandboxFallbackWarned = true;
    console.warn(
      "[ai] AI_API_KEY is not set — AI features run on heuristic fallbacks. " +
        "Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) in the " +
        "deployment environment. See DEPLOY.md."
    );
  }
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: messages as Parameters<typeof zai.chat.completions.create>[0]["messages"],
        thinking: { type: "disabled" },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!completion) return null;
    const content = (completion as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content;
    return content && content.trim().length > 0 ? content : null;
  } catch (err) {
    console.error("LLM call failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function chat(messages: Array<{ role: string; content: string }>, timeoutMs = 25000): Promise<string | null> {
  const envTimeout = Number(process.env.AI_TIMEOUT_MS);
  const effectiveTimeout = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : timeoutMs;
  const cfg = aiEnvConfig();
  if (cfg) return chatViaEnvProvider(messages, cfg, effectiveTimeout);
  return chatViaSandboxSdk(messages, effectiveTimeout);
}

function extractJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  let text = raw.trim();
  // strip markdown fences
  text = text.replace(/```(?:json)?/g, "").trim();
  const start = Math.min(
    ...[text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0).concat([Infinity])
  );
  if (start === Infinity) return null;
  const endBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  const candidate = text.slice(start, endBrace + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

// ─── Resume skill extraction ────────────────────────────────────────────────

/**
 * Count alias occurrences in lowercased text. Sub-3-char aliases ("os",
 * "cn", …) only count on word boundaries so "foosball" or "cn tower" can
 * never claim Operating Systems / Computer Networks; longer aliases stay
 * substring-based ("node.js", "c/c++").
 */
function countAliasMentions(lower: string, alias: string): number {
  if (alias.length <= 2) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    return (lower.match(re) ?? []).length;
  }
  let count = 0;
  let idx = lower.indexOf(alias);
  while (idx !== -1) {
    count++;
    idx = lower.indexOf(alias, idx + alias.length);
  }
  return count;
}

function heuristicExtract(text: string): ExtractedProfile {
  const lower = text.toLowerCase();
  const skills: ExtractedSkill[] = [];
  const seen = new Set<string>();

  for (const entry of SKILL_CATALOG) {
    let mentions = 0;
    let inProject = false;
    for (const alias of entry.aliases) {
      mentions += countAliasMentions(lower, alias);
      // crude check: is it after a "PROJECTS" heading?
      const projIdx = lower.indexOf("project");
      const idx = lower.indexOf(alias);
      if (projIdx !== -1 && idx > projIdx) inProject = true;
    }
    if (mentions > 0 && !seen.has(entry.name)) {
      seen.add(entry.name);
      skills.push({
        name: entry.name,
        level: heuristicLevel(mentions, inProject),
        evidence:
          mentions >= 3
            ? `mentioned ${mentions}× across resume (incl. projects/experience)`
            : `mentioned ${mentions}× in resume`,
      });
    }
  }

  return {
    skills: skills.sort((a, b) => b.level.localeCompare(a.level)),
    projects: [],
    summary: "Skill profile extracted with keyword-based NLP heuristics.",
    source: "heuristic",
  };
}

export async function extractSkillsFromResume(text: string): Promise<ExtractedProfile> {
  const truncated = text.slice(0, 9000);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You are an expert technical recruiter and NLP engine. Extract technical skills from resumes. Respond with STRICT JSON only, no prose.",
    },
    {
      role: "user",
      content: `Extract every technical skill claimed in this resume. For each skill estimate the candidate's claimed proficiency: "Advanced", "Intermediate" or "Basic" (based on wording like "advanced", "strong", years of use, number of projects, certifications). Prefer canonical short names like: DSA, C++, Python, Java, JavaScript, Node.js, React, DBMS, SQL, Operating Systems, Computer Networks, OOP, Git. Also list up to 4 projects with their technologies.

JSON schema:
{"skills":[{"name":"string","level":"Advanced|Intermediate|Basic","evidence":"short reason, cite resume wording"}],"projects":[{"name":"string","tech":["string"]}],"summary":"one-sentence profile summary"}

RESUME:
${truncated}`,
    },
  ]);

  const parsed = extractJson<ExtractedProfile>(raw);
  if (parsed && Array.isArray(parsed.skills) && parsed.skills.length > 0) {
    const valid = new Set(["Advanced", "Intermediate", "Basic"]);
    const skills = parsed.skills
      .filter((s) => s && typeof s.name === "string" && s.name.length < 40)
      .map((s) => ({
        name: s.name.trim(),
        level: (valid.has(s.level) ? s.level : "Intermediate") as ExtractedSkill["level"],
        evidence: typeof s.evidence === "string" ? s.evidence.slice(0, 160) : "claimed in resume",
      }))
      .slice(0, 14);
    if (skills.length) {
      return {
        skills,
        projects: Array.isArray(parsed.projects)
          ? parsed.projects.slice(0, 4).map((p) => ({ name: String(p?.name ?? "Project").slice(0, 60), tech: Array.isArray(p?.tech) ? p.tech.map(String).slice(0, 8) : [] }))
          : [],
        summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 240) : "Profile extracted from resume.",
        source: "ai",
      };
    }
  }
  return heuristicExtract(text);
}

// ─── Explanation question generation ────────────────────────────────────────

const FALLBACK_EXPLAIN: ExplainQuestion[] = [
  { q: "Walk me through your overall approach. Why did you choose this algorithm/strategy?", hint: "Mention the core idea and why it fits the problem constraints." },
  { q: "What is the time and space complexity of your solution? Justify both.", hint: "State Big-O and what drives it (loops, data structures, recursion depth)." },
  { q: "Which edge cases does your solution handle, and how?", hint: "Empty inputs, duplicates, single elements, boundaries." },
];

export async function generateExplainQuestions(
  code: string,
  questionTitle: string,
  questionDescription: string
): Promise<ExplainQuestion[]> {
  const truncatedCode = code.slice(0, 3500);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You generate code-comprehension verification questions. Given a candidate's submitted solution, write 3 short questions that only someone who understands the code could answer. Respond with STRICT JSON only.",
    },
    {
      role: "user",
      content: `Problem: "${questionTitle}" — ${questionDescription.slice(0, 300)}

Candidate's submitted code:
\`\`\`
${truncatedCode}
\`\`\`

Write exactly 3 verification questions grounded in THIS code (reference specific logic, variables, or decisions the candidate made, e.g. "Why did you use a Map instead of an array in line X?"). Mix: approach justification, complexity, and an edge case.

JSON schema: {"questions":[{"q":"string","hint":"what a good answer should contain"}]}`,
    },
  ]);

  const parsed = extractJson<{ questions: ExplainQuestion[] }>(raw);
  if (parsed?.questions && Array.isArray(parsed.questions) && parsed.questions.length >= 2) {
    return parsed.questions
      .filter((x) => x && typeof x.q === "string")
      .slice(0, 3)
      .map((x) => ({ q: x.q.slice(0, 400), hint: typeof x.hint === "string" ? x.hint.slice(0, 240) : "" }));
  }
  return FALLBACK_EXPLAIN;
}

// ─── Explanation evaluation (code–explanation consistency) ──────────────────

function heuristicEvaluate(code: string, q: string, answer: string): number {
  const ans = answer.toLowerCase();
  if (ans.length < 15) return 20;
  let score = 35 + Math.min(ans.length / 8, 25); // substance
  // identifier overlap with the code
  const idents = Array.from(new Set(code.match(/[a-zA-Z_][a-zA-Z0-9_]{3,}/g) ?? []));
  const hits = idents.filter((id) => ans.includes(id.toLowerCase())).length;
  score += Math.min(hits * 6, 24);
  // complexity vocabulary for complexity-ish questions
  if (/o\(|complexity|log n|linear|quadratic|big o/i.test(q) && /o\(|n log|linear|quadratic|constant/i.test(ans)) score += 12;
  return Math.min(Math.round(score), 96);
}

export async function evaluateExplanations(
  code: string,
  questionTitle: string,
  answers: Array<{ q: string; answer: string }>
): Promise<ExplainEvaluation[]> {
  const truncatedCode = code.slice(0, 3000);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You are a strict but fair technical interviewer. You evaluate whether a candidate's explanation of THEIR OWN submitted code is consistent with the actual code and demonstrates genuine understanding. Respond with STRICT JSON only.",
    },
    {
      role: "user",
      content: `Problem: "${questionTitle}"

Candidate's submitted code:
\`\`\`
${truncatedCode}
\`\`\`

Candidate was asked these questions and answered:
${answers.map((a, i) => `Q${i + 1}: ${a.q}\nA${i + 1}: ${a.answer.slice(0, 1200)}`).join("\n\n")}

For each answer, score consistency 0-100 with the submitted code (100 = demonstrates genuine, specific understanding of this exact implementation; low = vague, contradictory, or code-agnostic). Give one-sentence feedback.

JSON schema: {"evaluations":[{"index":0,"score":0-100,"feedback":"string"}]}`,
    },
  ]);

  const parsed = extractJson<{ evaluations: Array<{ index: number; score: number; feedback: string }> }>(raw);
  if (parsed?.evaluations && Array.isArray(parsed.evaluations)) {
    return answers.map((a, i) => {
      const e = parsed.evaluations.find((x) => x.index === i) ?? parsed.evaluations[i];
      const score = e && typeof e.score === "number" ? Math.max(0, Math.min(100, e.score)) : heuristicEvaluate(code, a.q, a.answer);
      return {
        q: a.q,
        answer: a.answer,
        score,
        feedback: e?.feedback ? String(e.feedback).slice(0, 300) : "Evaluated with heuristic fallback.",
        source: (e ? "ai" : "heuristic") as "ai" | "heuristic",
      };
    });
  }
  return answers.map((a) => ({
    q: a.q,
    answer: a.answer,
    score: heuristicEvaluate(code, a.q, a.answer),
    feedback: "Evaluated with heuristic fallback (keyword & substance analysis).",
    source: "heuristic" as const,
  }));
}

// ─── Code analysis (quality + complexity) ───────────────────────────────────

function heuristicAnalyze(code: string, expectedComplexity?: string): CodeAnalysis {
  const lines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
  const loops = (code.match(/\b(for|while)\s*\(/g) ?? []).length;
  const nestedLoops = /for[\s\S]{0,200}?\bfor\s*\(|while[\s\S]{0,200}?\bwhile\s*\(/.test(code);
  const functions = (code.match(/function\s+[a-zA-Z_$]|=>\s*[{(]/g) ?? []).length;
  const comments = (code.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) ?? []).length;
  const avgNameLen =
    (code.match(/[a-zA-Z_$][\w$]{2,}/g) ?? []).reduce((s, n) => s + n.length, 0) /
    Math.max((code.match(/[a-zA-Z_$][\w$]{2,}/g) ?? []).length, 1);

  let quality = 55;
  if (avgNameLen > 4) quality += 10;
  if (functions >= 2) quality += 8;
  if (comments >= 1) quality += 7;
  if (lines.length > 0 && lines.length < 60) quality += 6;
  if (/(var\s)/.test(code)) quality -= 8;
  if (/console\.log/.test(code)) quality -= 2;

  let complexity = "O(1)";
  if (loops === 1) complexity = "O(n)";
  if (nestedLoops || loops >= 2) complexity = "O(n²)";
  if (/\.sort\(/.test(code)) complexity = loops >= 1 ? "O(n log n)" : complexity;

  const notes: string[] = [];
  if (comments === 0) notes.push("No comments — add brief notes for non-obvious logic.");
  if (avgNameLen <= 3.5) notes.push("Some variable names are short; prefer descriptive names.");
  if (loops >= 2 && !nestedLoops) notes.push("Multiple sequential loops — acceptable, consider combining passes.");
  if (nestedLoops && expectedComplexity && !expectedComplexity.includes("n²") && !expectedComplexity.includes("n·k"))
    notes.push(`Nested loops detected; expected complexity is ${expectedComplexity}.`);
  if (notes.length === 0) notes.push("Clean structure, reasonable naming and organization.");

  return {
    timeComplexity: complexity,
    spaceComplexity: complexity === "O(1)" ? "O(1)" : "O(n)",
    quality: Math.max(30, Math.min(98, quality)),
    notes: notes.slice(0, 4),
    source: "heuristic",
  };
}

// ─── MCQ extraction from question-paper text ─────────────────────────────────

const MCQ_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const MAX_MCQS = 25;

/** Coerce one raw LLM/heuristic MCQ into a clean ExtractedMcq — null when unusable. */
function sanitizeMcq(raw: unknown): ExtractedMcq | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (title.length < 3) return null;

  const options = Array.isArray(r.options)
    ? r.options
        .map((o) => String(o ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
        .filter((o) => o.length > 0)
        .slice(0, 6)
    : [];
  if (options.length < 2 || options.length > 6) return null;

  const idx = typeof r.answerIndex === "number" ? r.answerIndex : Number.parseInt(String(r.answerIndex ?? ""), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;

  const topic = typeof r.topic === "string" && r.topic.trim() ? r.topic.replace(/\s+/g, " ").trim().slice(0, 40) : "General";
  const difficulty = (typeof r.difficulty === "string" && MCQ_DIFFICULTIES.has(r.difficulty) ? r.difficulty : "medium") as ExtractedMcq["difficulty"];
  const explanation = typeof r.explanation === "string" && r.explanation.trim() ? r.explanation.trim().slice(0, 500) : undefined;

  return { title, options, answerIndex: idx, topic, difficulty, ...(explanation ? { explanation } : {}) };
}

/**
 * Regex/line-based fallback parser: scans for numbered questions ("1." / "Q1."),
 * lettered options ("A)" / "A." / "(A)") and an "Answer:" line. Used when the
 * LLM pass fails or returns nothing usable.
 */
function heuristicMcqsFromText(text: string): ExtractedMcq[] {
  const QUESTION_RE = /^(?:Q(?:ues|uestion)?\s*[.\-:#]?\s*)?(\d{1,3})\s*[.)]\s+(.+)$/i;
  const OPTION_RE = /^\(?\s*([A-Fa-f])\s*[).:]\s*(.+)$/;
  const ANSWER_RE = /^(?:correct\s+)?(?:ans(?:wer)?)\b\s*[.:-]\s*\(?([A-Fa-f])\)?\b/i;

  const blocks: Array<{ title: string; options: string[]; answer: number | null }> = [];
  let cur: { title: string; options: string[]; answer: number | null } | null = null;

  const flush = () => {
    if (cur && cur.options.length >= 2 && cur.options.length <= 6 && cur.answer !== null && cur.answer < cur.options.length) {
      blocks.push(cur);
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const am = line.match(ANSWER_RE);
    if (am && cur) {
      cur.answer = am[1].toUpperCase().charCodeAt(0) - 65;
      continue;
    }

    const qm = line.match(QUESTION_RE);
    const om = line.match(OPTION_RE);
    if (om && cur && (!qm || cur.options.length > 0)) {
      // "A) text" — a new option (a title like "A. Bellman" only counts as an option once options started)
      cur.options.push(om[2].trim().slice(0, 160));
      continue;
    }
    if (qm) {
      flush();
      cur = { title: qm[2].trim().slice(0, 200), options: [], answer: null };
      continue;
    }
    // continuation line — wrap onto the title, or onto the last option
    if (cur) {
      if (cur.options.length === 0) cur.title = `${cur.title} ${line}`.trim().slice(0, 200);
      else if (cur.options.length > 0) cur.options[cur.options.length - 1] = `${cur.options[cur.options.length - 1]} ${line}`.trim().slice(0, 160);
    }
  }
  flush();

  return blocks.slice(0, MAX_MCQS).map((b) => sanitizeMcq(b)).filter((q): q is ExtractedMcq => q !== null);
}

/**
 * Extract structured MCQs from question-paper text. LLM pass first (STRICT JSON),
 * falling back to a line-based heuristic parser. Input is truncated to ~12k chars
 * and the result capped at 25 questions.
 */
export async function extractMcqsFromText(text: string): Promise<ExtractMcqsResult> {
  const truncated = text.replace(/\u0000/g, "").slice(0, 12000);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You are an exam-paper parser. Given plain text extracted from a PDF question paper, extract every multiple-choice question. Respond with STRICT JSON only, no prose.",
    },
    {
      role: "user",
      content: `Extract every multiple-choice question from this question paper text. For each question determine the correct option. Ignore subjective/essay questions, instructions, and headers.

JSON schema:
{"questions":[{"title":"question text","options":["A","B","C","D"],"answerIndex":0,"topic":"one of: general topic like DBMS, OS, Networks, OOP, DSA, SQL, Java, Python, JavaScript, Git","difficulty":"easy|medium|hard","explanation":"one sentence, optional"}]}

Rules: answerIndex is the 0-based index of the correct option. Use 2-6 options per question. If the paper marks the answer (answer key, "Answer: B", tick), use it; otherwise pick the best option. Extract at most 25 questions.

QUESTION PAPER:
${truncated}`,
    },
  ]);

  const parsed = extractJson<{ questions?: unknown[] }>(raw);
  if (parsed && Array.isArray(parsed.questions)) {
    const questions = parsed.questions
      .map(sanitizeMcq)
      .filter((q): q is ExtractedMcq => q !== null)
      .slice(0, MAX_MCQS);
    if (questions.length > 0) return { questions, source: "ai" };
  }

  return { questions: heuristicMcqsFromText(truncated), source: "heuristic" };
}

export async function analyzeCode(code: string, questionTitle: string, expectedComplexity?: string): Promise<CodeAnalysis> {
  const truncated = code.slice(0, 3500);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You are a senior engineer performing static code review on a candidate's algorithm solution. Judge honestly. Respond with STRICT JSON only.",
    },
    {
      role: "user",
      content: `Problem: "${questionTitle}"${expectedComplexity ? ` (target complexity: ${expectedComplexity})` : ""}

Submitted code:
\`\`\`
${truncated}
\`\`\`

Evaluate: time complexity, space complexity, code quality 0-100 (naming, structure, readability, idioms), and 2-4 short review notes.

JSON schema: {"timeComplexity":"O(...)","spaceComplexity":"O(...)","quality":0-100,"notes":["string"]}`,
    },
  ]);

  const parsed = extractJson<{ timeComplexity: string; spaceComplexity: string; quality: number; notes: string[] }>(raw);
  if (parsed && typeof parsed.quality === "number") {
    return {
      timeComplexity: String(parsed.timeComplexity ?? "—").slice(0, 24),
      spaceComplexity: String(parsed.spaceComplexity ?? "—").slice(0, 24),
      quality: Math.max(0, Math.min(100, parsed.quality)),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String).slice(0, 4) : [],
      source: "ai",
    };
  }
  return heuristicAnalyze(code, expectedComplexity);
}

// ─── Role requirements from a job description ───────────────────────────────

export interface RoleRequirement {
  /** Canonical SkillProof skill name (e.g. "DSA", "DBMS") when recognized. */
  skill: string;
  /** 1–5 importance, 5 = hard requirement. */
  importance: number;
  /** Suggested verified-score bar for this requirement, 0–100. */
  minScore: number;
}

export interface RoleRequirements {
  role: string;
  skills: RoleRequirement[];
  source: "ai" | "heuristic";
}

const MAX_ROLE_SKILLS = 8;
const CANONICAL_SKILL_NAMES = SKILL_CATALOG.map((e) => e.name).join(", ");

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Validate + canonicalize one AI-extracted requirement; null when unusable. */
function sanitizeRequirement(raw: unknown): RoleRequirement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nameRaw = typeof r.skill === "string" ? r.skill.trim() : "";
  if (!nameRaw) return null;
  const canonical = canonicalizeSkill(nameRaw);
  return {
    skill: canonical?.name ?? nameRaw.slice(0, 40),
    importance: clampInt(r.importance, 1, 5, 3),
    minScore: clampInt(r.minScore, 0, 100, 60),
  };
}

/**
 * Heuristic JD scan: keyword-hit on the skill catalog. Importance grows with
 * mention count; the score bar follows seniority wording in the text.
 */
function heuristicRoleFromJd(text: string): RoleRequirements {
  const lower = text.toLowerCase();
  const senior = /\b(senior|staff|principal|lead|architect)\b/.test(lower);
  const junior = /\b(junior|entry[- ]level|intern|graduate)\b/.test(lower);
  const minScore = senior ? 70 : junior ? 45 : 60;

  const skills: RoleRequirement[] = [];
  for (const entry of SKILL_CATALOG) {
    let mentions = 0;
    for (const alias of entry.aliases) {
      mentions += countAliasMentions(lower, alias);
    }
    if (mentions > 0) {
      skills.push({
        skill: entry.name,
        importance: mentions >= 3 ? 4 : mentions === 2 ? 3 : 2,
        minScore,
      });
    }
  }

  const roleLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length >= 4 && l.length <= 90) ?? "Open role";

  return {
    role: roleLine.replace(/\s*\(.*\)\s*$/, "").slice(0, 80) || "Open role",
    skills: skills.sort((a, b) => b.importance - a.importance).slice(0, MAX_ROLE_SKILLS),
    source: "heuristic",
  };
}

/**
 * Extract the skill requirements a job description implies, normalized onto
 * the SkillProof skill catalog so they can be matched against VERIFIED skill
 * scores (Report.skillScoresJson). AI pass with a keyword fallback — same
 * contract as extractMcqsFromText.
 */
export async function extractRoleRequirements(jd: string): Promise<RoleRequirements> {
  const truncated = jd.replace(/\u0000/g, "").slice(0, 6000);
  const raw = await chat([
    {
      role: "assistant",
      content:
        "You are a technical recruiter's analyst. Read a job description and extract the concrete technical skills it requires. Respond with STRICT JSON only, no prose.",
    },
    {
      role: "user",
      content: `Extract the technical skill requirements from this job description. Prefer the canonical skill names listed below when one fits; otherwise use a short skill name (1-3 words). Judge importance: 5 = hard requirement stated in must-have language, 3 = clearly expected, 1 = nice-to-have. Suggest a minimum verified-score bar (0-100) consistent with seniority (junior roles ~45-55, mid ~60-70, senior ~70-85).

Canonical skill names: ${CANONICAL_SKILL_NAMES}

JSON schema: {"role":"short role title","skills":[{"skill":"one skill","importance":1-5,"minScore":0-100}]}

Rules: at most ${MAX_ROLE_SKILLS} skills, most important first. Skip soft skills, benefits, and company boilerplate.

JOB DESCRIPTION:
${truncated}`,
    },
  ]);

  const parsed = extractJson<{ role?: string; skills?: unknown[] }>(raw);
  if (parsed && Array.isArray(parsed.skills)) {
    const skills = parsed.skills
      .map(sanitizeRequirement)
      .filter((s): s is RoleRequirement => s !== null)
      .slice(0, MAX_ROLE_SKILLS);
    if (skills.length > 0) {
      return {
        role:
          (typeof parsed.role === "string" && parsed.role.trim()
            ? parsed.role.trim().slice(0, 80)
            : "Open role"),
        skills: skills.sort((a, b) => b.importance - a.importance),
        source: "ai",
      };
    }
  }

  return heuristicRoleFromJd(truncated);
}
