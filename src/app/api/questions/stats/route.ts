import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * GET /api/questions/stats — per-question calibration metrics (recruiter only).
 *
 * Aggregates every AssessmentQuestion dealt across COMPLETED assessments into
 * a psychometric profile per bank question: exposure, solve rate, pace vs the
 * effective time limit, attempt/hint pressure. The recruiter uses this to spot
 * questions that are too easy (everyone solves them — low signal), too brutal
 * (nobody solves them — high anxiety, low discrimination) or unexercised.
 *
 * All aggregation happens in JS — the row count is small (one row per question
 * per assessment) and SQLite+Prisma groupBy can't do medians anyway.
 */

interface Flagged {
  label: string;
  tone: "hot" | "brutal" | "balanced" | "nodata";
}

const median = (nums: number[]): number | null => {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const mean = (nums: number[]): number | null =>
  nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;

export async function GET(req: NextRequest) {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  try {
    const csv = req.nextUrl.searchParams.get("format") === "csv";
    const stats = await computeStats();
    if (csv) {
      return new NextResponse(toCsv(stats.rows, stats.summary), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="skillproof-calibration-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(stats);
  } catch (err) {
    console.error("question stats error:", err);
    return NextResponse.json({ error: "Failed to compute calibration stats" }, { status: 500 });
  }
}

async function computeStats(): Promise<{
  rows: Row[];
  summary: ReturnType<typeof buildSummary>;
}> {
  {
    const dealt = await db.assessmentQuestion.findMany({
      where: { assessment: { status: "completed" } },
      select: {
        questionId: true,
        skill: true,
        status: true,
        score: true,
        timeSpentSec: true,
        timeLimitSec: true,
        attempts: true,
        hintCount: true,
        question: {
          select: {
            title: true,
            skill: true,
            category: true,
            difficulty: true,
            points: true,
            timeLimitSec: true,
            source: true,
          },
        },
      },
    });

    const totalQuestions = await db.question.count();

    // ── group by question ────────────────────────────────────────────────
    type Group = {
      title: string;
      skill: string;
      category: string;
      difficulty: string;
      points: number;
      source: string;
      baseLimit: number;
      statuses: string[];
      scores: number[];
      times: number[];
      limits: number[];
      attempts: number[];
      hints: number[];
    };
    const groups = new Map<string, Group>();
    for (const aq of dealt) {
      let g = groups.get(aq.questionId);
      if (!g) {
        g = {
          title: aq.question.title,
          skill: aq.question.skill,
          category: aq.question.category,
          difficulty: aq.question.difficulty,
          points: aq.question.points,
          source: aq.question.source,
          baseLimit: aq.question.timeLimitSec,
          statuses: [],
          scores: [],
          times: [],
          limits: [],
          attempts: [],
          hints: [],
        };
        groups.set(aq.questionId, g);
      }
      g.statuses.push(aq.status);
      if (typeof aq.score === "number") g.scores.push(aq.score);
      if (typeof aq.timeSpentSec === "number") g.times.push(aq.timeSpentSec);
      const limit = aq.timeLimitSec ?? aq.question.timeLimitSec;
      if (typeof limit === "number") g.limits.push(limit);
      g.attempts.push(aq.attempts);
      g.hints.push(aq.hintCount);
    }

    const rows = [...groups.entries()].map(([questionId, g]) => {
      const exposures = g.statuses.length;
      const solved = g.statuses.filter((s) => s === "solved").length;
      const failed = g.statuses.filter((s) => s === "failed" || s === "timeout").length;
      const skipped = g.statuses.filter((s) => s === "skipped").length;
      const solveRate = exposures > 0 ? solved / exposures : 0;
      const avgSec = mean(g.times);
      const avgLimitSec = mean(g.limits) ?? g.baseLimit;
      const pace = avgSec != null && avgLimitSec > 0 ? avgSec / avgLimitSec : null;
      const avgScore = mean(g.scores);
      const avgAttempts = mean(g.attempts);
      const avgHints = mean(g.hints);

      let flag: Flagged;
      if (exposures < 2) flag = { label: "thin data", tone: "nodata" };
      else if (solveRate >= 0.9) flag = { label: "too easy", tone: "hot" };
      else if (solveRate <= 0.2) flag = { label: "too brutal", tone: "brutal" };
      else flag = { label: "balanced", tone: "balanced" };

      return {
        questionId,
        title: g.title,
        skill: g.skill,
        category: g.category,
        difficulty: g.difficulty,
        points: g.points,
        source: g.source,
        exposures,
        solved,
        failed,
        skipped,
        solveRate,
        avgScore: avgScore != null ? Math.round(avgScore * 10) / 10 : null,
        medianSec: median(g.times),
        avgSec: avgSec != null ? Math.round(avgSec) : null,
        avgLimitSec: avgLimitSec != null ? Math.round(avgLimitSec) : null,
        pace: pace != null ? Math.round(pace * 100) / 100 : null,
        avgAttempts: avgAttempts != null ? Math.round(avgAttempts * 10) / 10 : null,
        avgHints: avgHints != null ? Math.round(avgHints * 10) / 10 : null,
        flag,
      };
    });

    // heaviest-exposure questions first — the ones the bank leans on
    rows.sort((a, b) => b.exposures - a.exposures || b.solveRate - a.solveRate);

    return { rows, summary: buildSummary(rows, totalQuestions, dealt.length) };
  }
}

type Row = {
  questionId: string;
  title: string;
  skill: string;
  category: string;
  difficulty: string;
  points: number;
  source: string;
  exposures: number;
  solved: number;
  failed: number;
  skipped: number;
  solveRate: number;
  avgScore: number | null;
  medianSec: number | null;
  avgSec: number | null;
  avgLimitSec: number | null;
  pace: number | null;
  avgAttempts: number | null;
  avgHints: number | null;
  flag: Flagged;
};

function buildSummary(rows: Row[], totalQuestions: number, totalDeals: number) {
  const withData = rows.filter((r) => r.exposures >= 2);
  return {
    exercised: rows.length,
    silent: Math.max(0, totalQuestions - rows.length),
    totalQuestions,
    totalDeals,
    tooEasy: withData.filter((r) => r.flag.tone === "hot").length,
    tooBrutal: withData.filter((r) => r.flag.tone === "brutal").length,
    balanced: withData.filter((r) => r.flag.tone === "balanced").length,
    medianSolveRate: median(withData.map((r) => r.solveRate)),
    medianPace: (() => {
      // pace medians over timed (coding/debugging) questions only — MCQs are
      // seconds-scale and would drag the headline to a meaningless 0×
      const m = median(
        withData
          .filter((r) => r.category !== "mcq")
          .map((r) => r.pace)
          .filter((p): p is number => p != null)
      );
      return m != null ? Math.round(m * 100) / 100 : null;
    })(),
  };
}

/** RFC 4180 CSV — quoted cells, doubled quotes, CRLF line endings. */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[], summary: ReturnType<typeof buildSummary>): string {
  const header = [
    "Question",
    "Skill",
    "Category",
    "Difficulty",
    "Source",
    "Exposures",
    "Solved",
    "Failed",
    "Skipped",
    "Solve rate",
    "Avg score",
    "Median sec",
    "Avg sec",
    "Avg limit sec",
    "Pace (x of limit)",
    "Avg attempts",
    "Avg hints",
    "Flag",
  ];
  const lines = rows.map((r) =>
    [
      r.title,
      r.skill,
      r.category,
      r.difficulty,
      r.source,
      r.exposures,
      r.solved,
      r.failed,
      r.skipped,
      r.solveRate != null ? `${Math.round(r.solveRate * 100)}%` : "",
      r.avgScore ?? "",
      r.medianSec ?? "",
      r.avgSec ?? "",
      r.avgLimitSec ?? "",
      r.pace != null ? `${r.pace.toFixed(2)}x` : "",
      r.avgAttempts ?? "",
      r.avgHints ?? "",
      r.flag.label,
    ]
      .map(csvCell)
      .join(",")
  );
  const summaryPairs: Array<[string, unknown]> = [
    ["Generated", new Date().toISOString()],
    ["Exercised questions", summary.exercised],
    ["Never dealt", summary.silent],
    ["Total questions", summary.totalQuestions],
    ["Total deals", summary.totalDeals],
    ["Too easy", summary.tooEasy],
    ["Balanced", summary.balanced],
    ["Too brutal", summary.tooBrutal],
    ["Median solve rate", summary.medianSolveRate != null ? `${Math.round(summary.medianSolveRate * 100)}%` : ""],
    ["Median pace (timed)", summary.medianPace != null ? `${summary.medianPace.toFixed(2)}x` : ""],
  ];
  for (const [k, v] of summaryPairs) lines.push([csvCell(`SUMMARY: ${k}`), csvCell(v)].join(","));
  return `\uFEFF${header.map(csvCell).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}
