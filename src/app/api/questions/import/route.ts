import { NextRequest, NextResponse } from "next/server";
import {
  htmlToText,
  paramsFromJsSnippet,
  parseExamples,
  type QuestionDraft,
} from "@/lib/server/question-draft";
import { requireRecruiter } from "@/lib/server/auth";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/questions/import — fetch a draft from a problem URL.
 *
 * - LeetCode  : full import via the public GraphQL API (title, description,
 *               difficulty, tags, per-language starters, parsed examples).
 * - Codewars  : full import via the public kata API (markdown description).
 * - Others    : slug-derived title draft; the recruiter completes the form.
 *
 * The response is always a DRAFT — the recruiter reviews/edits it in the
 * add-question dialog and saves via POST /api/questions (human in the loop).
 */

interface ImportResult {
  imported: boolean;
  platform: string;
  slug?: string;
  sourceUrl: string;
  draft?: Partial<QuestionDraft> & { title: string };
  reason?: string;
}

function difficultyFromLeetCode(d: string): "easy" | "medium" | "hard" {
  const v = d.toLowerCase();
  return v === "easy" ? "easy" : v === "hard" ? "hard" : "medium";
}

function codewarsDifficulty(rankName: string | undefined): "easy" | "medium" | "hard" {
  const kyu = parseInt(rankName ?? "", 10);
  if (!Number.isFinite(kyu)) return "medium";
  if (kyu >= 7) return "easy";
  if (kyu >= 4) return "medium";
  return "hard";
}

async function fetchWithTimeout(url: string, init?: RequestInit, ms = 10000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface LeetCodeQuestion {
  questionFrontendId: string;
  title: string;
  difficulty: string;
  hints?: string[];
  topicTags?: Array<{ name: string }>;
  codeSnippets: Array<{ langSlug: string; code: string }> | null;
  content: string | null;
}

async function importLeetCode(slug: string, sourceUrl: string): Promise<ImportResult> {
  const query = `
query q($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    difficulty
    hints
    topicTags { name }
    codeSnippets { lang langSlug code }
    content
  }
}`;
  let res: Response | null = null;
  try {
    res = await fetchWithTimeout("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com" },
      body: JSON.stringify({ query, variables: { titleSlug: slug } }),
    });
  } catch {
    res = null;
  }
  if (!res || !res.ok) {
    return {
      imported: false,
      platform: "leetcode",
      slug,
      sourceUrl,
      reason: "LeetCode could not be reached from the server — the form below is prefilled from the link, complete the rest manually.",
    };
  }
  let q: LeetCodeQuestion | null = null;
  try {
    const body = (await res.json()) as { data?: { question?: LeetCodeQuestion | null } };
    q = body.data?.question ?? null;
  } catch {
    q = null;
  }
  if (!q || !q.title) {
    return {
      imported: false,
      platform: "leetcode",
      slug,
      sourceUrl,
      reason: "LeetCode did not return this problem (premium or missing) — complete the form manually.",
    };
  }

  const description = q.content ? htmlToText(q.content) : "";
  const jsSnippet = q.codeSnippets?.find((s) => s.langSlug === "javascript")?.code ?? "";
  const sig = jsSnippet ? paramsFromJsSnippet(jsSnippet) : null;
  const tests = sig && description ? parseExamples(description, sig.params) : [];

  const starters: Partial<Record<string, string>> = {};
  for (const s of q.codeSnippets ?? []) {
    if (s.langSlug === "javascript") starters.javascript = s.code;
    if (s.langSlug === "python3") starters.python = s.code;
    if (s.langSlug === "cpp") starters.cpp = s.code;
    if (s.langSlug === "java") starters.java = s.code;
  }

  const draft: Partial<QuestionDraft> & { title: string } = {
    title: `${q.questionFrontendId}. ${q.title}`,
    description,
    skill: "DSA",
    topic: q.topicTags?.[0]?.name ?? "DSA",
    difficulty: difficultyFromLeetCode(q.difficulty),
    fnName: sig?.fnName ?? "",
    starterCode: jsSnippet,
    tests,
    timeLimitSec: 1800,
    points: q.difficulty.toLowerCase() === "hard" ? 25 : q.difficulty.toLowerCase() === "medium" ? 15 : 10,
    hint: q.hints?.[0]?.replace(/<[^>]+>/g, "").slice(0, 500) || undefined,
    sourceUrl,
    source: "imported",
  };
  void starters; // per-language starters are generated at deal time by buildStarters

  return { imported: true, platform: "leetcode", slug, sourceUrl, draft };
}

async function importCodewars(slug: string, sourceUrl: string): Promise<ImportResult> {
  const res = await fetchWithTimeout(`https://www.codewars.com/api/v1/code-challenges/${encodeURIComponent(slug)}`);
  if (!res || !res.ok) {
    return {
      imported: false,
      platform: "codewars",
      slug,
      sourceUrl,
      reason: "Codewars could not be reached from the server — complete the form manually.",
    };
  }
  try {
    const kata = (await res.json()) as { name?: string; description?: string; tags?: string[]; rank?: { name?: string } };
    if (!kata.name) throw new Error("no name");
    return {
      imported: true,
      platform: "codewars",
      slug,
      sourceUrl,
      draft: {
        title: kata.name,
        description: (kata.description ?? "").slice(0, 8000),
        skill: "DSA",
        topic: kata.tags?.[0] ?? "Algorithms",
        difficulty: codewarsDifficulty(kata.rank?.name),
        fnName: "",
        starterCode: "",
        tests: [],
        timeLimitSec: 1800,
        points: 15,
        sourceUrl,
        source: "imported",
      },
    };
  } catch {
    return { imported: false, platform: "codewars", slug, sourceUrl, reason: "Codewars response was incomplete — complete the form manually." };
  }
}

function genericDraft(url: string): ImportResult {
  let platform = "link";
  let slug = "";
  try {
    const u = new URL(url);
    platform = u.hostname.replace(/^www\./, "").split(".")[0];
    const parts = u.pathname.split("/").filter(Boolean);
    slug = (parts[parts.length - 1] ?? "").replace(/\.[a-z]+$/i, "");
  } catch {
    slug = "";
  }
  const title = slug
    ? slug
        .split(/[-_]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "";
  return {
    imported: false,
    platform,
    slug: slug || undefined,
    sourceUrl: url,
    draft: {
      title: title || "",
      description: "",
      skill: "DSA",
      topic: "",
      difficulty: "medium",
      fnName: "",
      starterCode: "",
      tests: [],
      timeLimitSec: 1800,
      points: 15,
      sourceUrl: url,
      source: "imported",
    },
    reason:
      platform === "link"
        ? "The link could not be parsed — paste a LeetCode, Codewars or other problem URL, or complete the form manually."
        : `${platform} has no automatic import — the title was prefilled from the link, complete the rest manually.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    // outbound fetches + AI drafting — bound the loop cost
    if (!rateLimit(`qimport:${auth.user.id}`, 10, 60_000)) {
      return rateLimitResponse();
    }

    const body = (await req.json()) as { url?: string };
    const rawUrl = String(body.url ?? "").trim().slice(0, 2000);
    if (!rawUrl) return NextResponse.json({ error: "Paste a problem URL first" }, { status: 400 });
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return NextResponse.json({ error: "That does not look like a valid URL" }, { status: 400 });
    }
    if (!/^https?:$/.test(url.protocol)) {
      return NextResponse.json({ error: "Only http(s) links are supported" }, { status: 400 });
    }

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.toLowerCase();

    if (host === "leetcode.com" || host === "leetcode.cn") {
      const m = path.match(/\/problems\/([a-z0-9-]+)/);
      if (!m) {
        return NextResponse.json({
          imported: false,
          platform: "leetcode",
          sourceUrl: rawUrl,
          reason: "That LeetCode link does not point to a problem page (/problems/<slug>).",
        } satisfies ImportResult);
      }
      return NextResponse.json(await importLeetCode(m[1], rawUrl));
    }

    if (host === "codewars.com") {
      const m = path.match(/\/kata\/([a-z0-9-]+)/);
      if (!m) {
        return NextResponse.json({
          imported: false,
          platform: "codewars",
          sourceUrl: rawUrl,
          reason: "That Codewars link does not point to a kata page (/kata/<slug>).",
        } satisfies ImportResult);
      }
      return NextResponse.json(await importCodewars(m[1], rawUrl));
    }

    return NextResponse.json(genericDraft(rawUrl));
  } catch (err) {
    console.error("question import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
