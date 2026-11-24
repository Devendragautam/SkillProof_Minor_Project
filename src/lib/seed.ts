import { db } from "@/lib/db";
import { QUESTION_BANK } from "@/lib/questions/bank";
import { QUESTION_HINTS } from "@/lib/questions/hints";
import { ensureDemoUsers } from "@/lib/server/auth";

let seeded = false;

/** Idempotently ensure the curated question bank exists in the database */
export async function ensureSeed(): Promise<void> {
  // provisioned accounts are ensured on EVERY call — cheap idempotent checks,
  // and they must never be skipped just because the question bank is complete
  // (otherwise env-driven password rotation on an existing DB would never run)
  try {
    await ensureDemoUsers();
  } catch (err) {
    console.error("account provisioning failed", err);
  }
  if (seeded) return;
  try {
    const count = await db.question.count();
    // Only curated rows gate the re-seed: recruiter-authored questions
    // (externalId "custom:…") legitimately have no curated hint, so counting
    // them would keep the gate open forever.
    const missingHints = await db.question.count({
      where: {
        AND: [{ hint: null }, { category: { not: "mcq" } }, { externalId: { not: { startsWith: "custom:" } } }],
      },
    });
    if (count >= QUESTION_BANK.length && missingHints === 0) {
      seeded = true;
      return;
    }
    for (const q of QUESTION_BANK) {
      await db.question.upsert({
        where: { externalId: q.externalId },
        update: {
          title: q.title,
          description: q.description,
          difficulty: q.difficulty,
          topic: q.topic,
          starterCode: q.starterCode ?? null,
          fnName: q.fnName ?? null,
          testsJson: q.testCases ? JSON.stringify(q.testCases) : null,
          optionsJson: q.options ? JSON.stringify(q.options) : null,
          answerIndex: q.answerIndex ?? null,
          explanation: q.explanation ?? null,
          hint: QUESTION_HINTS[q.externalId] ?? null,
          expectedComplexity: q.expectedComplexity ?? null,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          schemaSql: q.schemaSql ?? null,
          seedSql: q.seedSql ?? null,
          solutionSql: q.solutionSql ?? null,
        },
        create: {
          externalId: q.externalId,
          skill: q.skill,
          category: q.category,
          topic: q.topic,
          difficulty: q.difficulty,
          title: q.title,
          description: q.description,
          fnName: q.fnName ?? null,
          starterCode: q.starterCode ?? null,
          testsJson: q.testCases ? JSON.stringify(q.testCases) : null,
          optionsJson: q.options ? JSON.stringify(q.options) : null,
          answerIndex: q.answerIndex ?? null,
          explanation: q.explanation ?? null,
          hint: QUESTION_HINTS[q.externalId] ?? null,
          expectedComplexity: q.expectedComplexity ?? null,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          schemaSql: q.schemaSql ?? null,
          seedSql: q.seedSql ?? null,
          solutionSql: q.solutionSql ?? null,
        },
      });
    }
    seeded = true;
  } catch (err) {
    console.error("seed failed", err);
  }
}
