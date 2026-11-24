import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildJsStarter } from "@/lib/code-languages";
import { buildStarters } from "@/lib/server/starters";
import { validateQuestionDraft, uniqueExternalId, QUESTION_SKILL_VALUES } from "@/lib/server/question-draft";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";

export const runtime = "nodejs";

interface BankRow {
  id: string;
  externalId: string;
  skill: string;
  category: string;
  topic: string;
  difficulty: string;
  title: string;
  description: string | null;
  fnName: string | null;
  points: number;
  timeLimitSec: number;
  source: string;
  sourceUrl: string | null;
  createdAt: Date;
  testsCount: number;
  visibleTests: Array<{ args: unknown[]; expected: unknown; setup?: string; unordered?: boolean }>;
  hiddenCount: number;
  hint: boolean;
  starterCode: string | null;
  languages: string[];
  isSql: boolean;
  schemaSql: string | null;
  seedSql: string | null;
  solutionSql: string | null;
}

/**
 * GET /api/questions — question bank listing + aggregate stats.
 * RECRUITER-ONLY: the listing carries visible tests (with expected values),
 * hidden-test counts, starter code and the reference solutionSql — data that
 * must never reach candidate-facing clients.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const category = url.searchParams.get("category") ?? "";
    const difficulty = url.searchParams.get("difficulty") ?? "";
    const skill = url.searchParams.get("skill") ?? "";

    const rows = await db.question.findMany({
      where: {
        ...(category && ["coding", "debugging", "mcq"].includes(category) ? { category } : {}),
        ...(difficulty && ["easy", "medium", "hard"].includes(difficulty) ? { difficulty } : {}),
        ...(skill ? { skill } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        externalId: true,
        skill: true,
        category: true,
        topic: true,
        difficulty: true,
        title: true,
        description: true,
        fnName: true,
        points: true,
        timeLimitSec: true,
        source: true,
        sourceUrl: true,
        createdAt: true,
        testsJson: true,
        hint: true,
        starterCode: true,
        schemaSql: true,
        seedSql: true,
        solutionSql: true,
      },
    });

    // SQLite `contains` is case-sensitive — apply the search filter post-fetch
    const filtered = q
      ? rows.filter((r) => r.title.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q) || r.skill.toLowerCase().includes(q))
      : rows;

    const bank: BankRow[] = filtered.map((r) => {
      const tests: Array<{ args: unknown[]; expected: unknown; hidden: boolean; setup?: string; unordered?: boolean }> =
        r.testsJson ? JSON.parse(r.testsJson) : [];
      // which languages the candidate could pick for this question
      const languages = r.schemaSql
        ? ["sql"]
        : r.category === "coding" && r.fnName && r.testsJson
          ? buildStarters(r.fnName, r.starterCode, tests as never).languages
          : ["javascript"];
      return {
        id: r.id,
        externalId: r.externalId,
        skill: r.skill,
        category: r.category,
        topic: r.topic,
        difficulty: r.difficulty,
        title: r.title,
        description: r.description,
        fnName: r.fnName,
        points: r.points,
        timeLimitSec: r.timeLimitSec,
        source: r.source,
        sourceUrl: r.sourceUrl,
        createdAt: r.createdAt,
        testsCount: tests.length,
        visibleTests: tests
          .filter((t) => !t.hidden)
          .map((t) => ({ args: t.args, expected: t.expected, setup: t.setup, unordered: t.unordered })),
        hiddenCount: tests.filter((t) => t.hidden).length,
        hint: !!r.hint,
        starterCode: r.starterCode,
        languages,
        isSql: !!r.schemaSql,
        schemaSql: r.schemaSql,
        seedSql: r.seedSql,
        solutionSql: r.solutionSql,
      };
    });

    const allRows = await db.question.findMany({ select: { category: true, source: true, skill: true, schemaSql: true } });
    const stats = {
      total: allRows.length,
      coding: allRows.filter((r) => r.category === "coding").length,
      debugging: allRows.filter((r) => r.category === "debugging").length,
      mcq: allRows.filter((r) => r.category === "mcq").length,
      custom: allRows.filter((r) => r.source !== "builtin").length,
      sql: allRows.filter((r) => r.schemaSql).length,
    };

    const skillValues = Array.from(new Set(allRows.map((r) => r.skill))).sort();

    return NextResponse.json({ questions: bank, stats, skills: skillValues, canonicalSkills: QUESTION_SKILL_VALUES });
  } catch (err) {
    console.error("questions list error:", err);
    return NextResponse.json({ error: "Failed to load questions" }, { status: 500 });
  }
}

/** POST /api/questions — add a custom / imported question to the bank */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRecruiter();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const v = validateQuestionDraft(body);
    if (!v.ok || !v.clean) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    const d = v.clean;
    const externalId = await uniqueExternalId(`${d.source === "imported" ? "imported" : "custom"}:${d.externalSlug}`);

    if (d.mode === "sql") {
      const question = await db.question.create({
        data: {
          externalId,
          skill: d.skill,
          category: "coding", // SQL questions ride the coding pool of the deal engine
          topic: d.topic,
          difficulty: d.difficulty,
          title: d.title,
          description: d.description,
          fnName: d.fnName, // "run_query" default
          starterCode: d.starterCode.trim() || null,
          testsJson: JSON.stringify(d.tests),
          hint: d.hint ?? null,
          timeLimitSec: d.timeLimitSec,
          points: d.points,
          source: d.source,
          sourceUrl: d.sourceUrl ?? null,
          schemaSql: d.schemaSql!,
          seedSql: d.seedSql ?? null,
          solutionSql: d.solutionSql!,
        },
      });
      return NextResponse.json({ question: { id: question.id, externalId, title: question.title } }, { status: 201 });
    }

    const starterCode =
      d.starterCode.trim() ||
      buildJsStarter(
        d.fnName,
        d.tests[0].args.map((_, i) => `arg${i + 1}`)
      );

    const question = await db.question.create({
      data: {
        externalId,
        skill: d.skill,
        category: "coding",
        topic: d.topic,
        difficulty: d.difficulty,
        title: d.title,
        description: d.description,
        fnName: d.fnName,
        starterCode,
        testsJson: JSON.stringify(d.tests),
        hint: d.hint ?? null,
        timeLimitSec: d.timeLimitSec,
        points: d.points,
        source: d.source,
        sourceUrl: d.sourceUrl ?? null,
      },
    });

    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "question.create", questionId: question.id, externalId, isSql: !!d.schemaSql },
    });

    return NextResponse.json({ question: { id: question.id, externalId, title: question.title } }, { status: 201 });
  } catch (err) {
    console.error("question create error:", err);
    return NextResponse.json({ error: "Failed to create question" }, { status: 500 });
  }
}
