import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRecruiter } from "@/lib/server/auth";
import { actorOf, audit } from "@/lib/server/audit";
import { uniqueExternalId } from "@/lib/server/question-draft";
import { rateLimit, rateLimitResponse } from "@/lib/server/rate-limit";
import type { ExtractedMcq } from "@/lib/types";

export const runtime = "nodejs";

const MAX_BATCH = 100;
const SKILL_MAX = 40;
const TOPIC_MAX = 40;
const OPTION_MAX = 200;

/** Normalized-title key for duplicate detection (lowercase, alphanumerics only). */
const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

const slugFromTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

interface ParsedMcq {
  title: string;
  options: string[];
  answerIndex: number;
  topic: string;
  difficulty: ExtractedMcq["difficulty"];
  explanation: string | null;
}

/**
 * Validate one incoming MCQ — returns null when the item is unusable.
 * title 5–200 chars, 2–6 options each ≤200 chars, integer answerIndex in range.
 */
function parseMcq(raw: unknown): ParsedMcq | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (title.length < 5 || title.length > 200) return null;

  if (!Array.isArray(r.options)) return null;
  const options = r.options
    .map((o) => String(o ?? "").replace(/\s+/g, " ").trim().slice(0, OPTION_MAX))
    .filter((o) => o.length > 0);
  if (options.length < 2 || options.length > 6) return null;

  const answerIndex = typeof r.answerIndex === "number" ? r.answerIndex : Number(r.answerIndex);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;

  const topicRaw = typeof r.topic === "string" && r.topic.trim() ? r.topic.trim() : "General";
  const diffRaw = typeof r.difficulty === "string" ? r.difficulty : "";
  const difficulty: ExtractedMcq["difficulty"] =
    diffRaw === "easy" || diffRaw === "medium" || diffRaw === "hard" ? diffRaw : "medium";

  return {
    title: title.slice(0, 200),
    options,
    answerIndex,
    topic: topicRaw.slice(0, TOPIC_MAX) || "General",
    difficulty,
    explanation: typeof r.explanation === "string" && r.explanation.trim() ? r.explanation.trim().slice(0, 1000) : null,
  };
}

/**
 * POST /api/questions/import-mcq
 * Persists the recruiter-selected extracted MCQs into the Question table
 * (category "mcq", source "pdf"). Dedupes within the batch and against the
 * existing bank by normalized title; drops invalid items.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRecruiter();
  if (!auth.ok) return auth.response;

  if (!rateLimit(`qimport-mcq:${auth.user.id}`, 10, 60_000)) {
    return rateLimitResponse();
  }

  try {
    const body = (await req.json().catch(() => null)) as { questions?: unknown; skill?: unknown } | null;
    if (!body || !Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: "No questions provided — select at least one MCQ to import." }, { status: 400 });
    }

    const skill =
      typeof body.skill === "string" && body.skill.trim() ? body.skill.trim().slice(0, SKILL_MAX) : "General";

    // Existing titles for cross-batch duplicate detection.
    const existing = await db.question.findMany({ where: { category: "mcq" }, select: { title: true } });
    const seenTitles = new Set(existing.map((q) => titleKey(q.title)));

    let created = 0;
    let skipped = 0;
    let invalid = 0;

    for (const [i, raw] of body.questions.slice(0, MAX_BATCH).entries()) {
      const mcq = parseMcq(raw);
      if (!mcq) {
        invalid++;
        continue;
      }
      const key = titleKey(mcq.title);
      if (key && seenTitles.has(key)) {
        skipped++;
        continue;
      }
      seenTitles.add(key);

      const slug = slugFromTitle(mcq.title);
      const externalId = await uniqueExternalId(`pdf:${slug || `mcq-${i}`}`);

      await db.question.create({
        data: {
          externalId,
          skill,
          category: "mcq",
          topic: mcq.topic,
          difficulty: mcq.difficulty,
          title: mcq.title,
          description: mcq.explanation ? `${mcq.title}\n\n${mcq.explanation}` : mcq.title,
          optionsJson: JSON.stringify(mcq.options),
          answerIndex: mcq.answerIndex,
          explanation: mcq.explanation,
          points: 5,
          timeLimitSec: 240,
          source: "pdf",
        },
      });
      created++;
    }

    audit({
      event: "recruiter.action",
      actor: actorOf(auth.user),
      detail: { action: "question.importMcq", created, skipped, invalid },
    });

    return NextResponse.json({ created, skipped, invalid }, { status: 201 });
  } catch (err) {
    console.error("import-mcq error:", err);
    return NextResponse.json({ error: "Could not save the questions — try again." }, { status: 500 });
  }
}
