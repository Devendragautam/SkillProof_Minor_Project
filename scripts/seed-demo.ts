/**
 * OPTIONAL demo seed — NEVER for production.
 *
 * Creates a small, clearly-synthetic demo dataset so a fresh development or
 * staging database can showcase the recruiter dashboard, reports and
 * certificates without real candidates:
 *   - 2 demo candidates with a completed assessment each
 *   - graded questions + submissions (plausible per-question scores)
 *   - verified reports built through the SAME aggregation pipeline the
 *     completion route uses (buildSkillReports → computeOverall → …)
 *   - one certificate with a frozen cohort standing
 *
 * The script is idempotent (skips candidates that already exist) and refuses
 * to run when NODE_ENV=production.
 *
 * Run explicitly:  npm run db:seed:demo
 */
import { db } from "../src/lib/db";
import { ensureProvisionedUsers } from "../src/lib/server/auth";
import { demoCandidateAccount } from "../src/lib/server/auth";
import {
  loadSubmissions,
  buildSkillReports,
  buildCategoryScores,
  computeOverall,
  buildBreakdown,
  computeAssessmentAiRisk,
} from "../src/lib/scoring";
import {
  generateCertificateCode,
  computeCohortStanding,
  snapshotSkills,
} from "../src/lib/server/certificates";

if (process.env.NODE_ENV === "production") {
  console.error("[seed-demo] refusing to run in production — demo data must never ship to prod.");
  process.exit(1);
}

interface DemoSpec {
  name: string;
  email: string;
  skills: Record<string, string>; // skill → claimed level
  questions: Array<{ externalId: string; status: string; score: number; timeSpentSec: number }>;
  certificate: boolean;
}

const DEMO_SPECS: DemoSpec[] = [
  {
    name: "Dev Sharma",
    email: "candidate@skillproof.io",
    skills: { JavaScript: "advanced", "Data Structures": "intermediate" },
    questions: [
      { externalId: "code-max-subarray", status: "solved", score: 99, timeSpentSec: 640 },
      { externalId: "code-two-sum", status: "solved", score: 100, timeSpentSec: 310 },
      { externalId: "code-valid-parentheses", status: "failed", score: 42, timeSpentSec: 720 },
    ],
    certificate: true,
  },
  {
    name: "Meera Iyer",
    email: "meera@example.com",
    skills: { Python: "intermediate" },
    questions: [
      { externalId: "code-valid-anagram", status: "solved", score: 88, timeSpentSec: 420 },
      { externalId: "code-product-except-self", status: "timeout", score: 0, timeSpentSec: 900 },
    ],
    certificate: false,
  },
];

async function seedDemoCandidate(spec: DemoSpec): Promise<void> {
  const existing = await db.candidate.findFirst({ where: { email: spec.email } });
  if (existing) {
    const hasAssessment = await db.assessment.findFirst({
      where: { candidateId: existing.id, status: "completed" },
    });
    if (hasAssessment) {
      console.log(`[seed-demo] ${spec.email} already has a completed assessment — skipping.`);
      return;
    }
  }

  const candidate =
    existing ??
    (await db.candidate.create({
      data: { name: spec.name, email: spec.email, tagsJson: JSON.stringify(["demo"]) },
    }));

  const claimedLevels: Record<string, string> = {};
  const planItems: Array<Record<string, unknown>> = [];
  for (const [skill, level] of Object.entries(spec.skills)) {
    claimedLevels[skill] = level;
    planItems.push({ skill, claimedLevel: level, coding: 1, debugging: 0, mcq: 0 });
  }

  const assessment = await db.assessment.create({
    data: {
      candidateId: candidate.id,
      status: "in_progress",
      startedAt: new Date(),
      planJson: JSON.stringify({ items: planItems, claimedLevels }),
    },
  });

  let order = 0;
  for (const q of spec.questions) {
    const question = await db.question.findUnique({ where: { externalId: q.externalId } });
    if (!question) {
      console.warn(`[seed-demo] question ${q.externalId} not in bank — run db:seed first. Skipping.`);
      continue;
    }
    const dealtAt = new Date(Date.now() - q.timeSpentSec * 1000);
    const aq = await db.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        questionId: question.id,
        skill: question.skill,
        order: order++,
        status: "current", // finalized below with the submission
        score: q.score,
        timeSpentSec: q.timeSpentSec,
        timeLimitSec: question.timeLimitSec,
        dealtAt,
        deadlineAt: new Date(dealtAt.getTime() + question.timeLimitSec * 1000),
        attempts: 1,
      },
    });
    await db.submission.create({
      data: {
        assessmentQuestionId: aq.id,
        code: `// demo submission for ${question.externalId}`,
        language: "javascript",
        eventsJson: JSON.stringify([]),
        versionsJson: JSON.stringify([]),
        metricsJson: JSON.stringify({ runtimeMs: 40 + (q.score % 7) * 10 }),
        testResultsJson: JSON.stringify(
          q.score >= 60
            ? [{ passed: true }, { passed: true }]
            : [{ passed: true }, { passed: false }]
        ),
        passed: q.score >= 60,
        runtimeMs: 40 + (q.score % 7) * 10,
      },
    });
    await db.assessmentQuestion.update({
      where: { id: aq.id },
      data: { status: q.status, activeFlag: null },
    });
  }

  // aggregate through the SAME pipeline the completion route uses
  const { subs } = await loadSubmissions(assessment.id);
  const skills = buildSkillReports(subs, new Map(Object.entries(claimedLevels)));
  const categories = buildCategoryScores(subs);
  const overallRaw = computeOverall(categories);
  const overall = Number.isFinite(overallRaw) ? overallRaw : 50;
  const breakdown = buildBreakdown(subs);
  const aiRisk = computeAssessmentAiRisk(subs);

  const assessed = skills.filter((s) => s.confidence);
  const overallConfidence =
    assessed.filter((s) => s.confidence === "HIGH").length >= Math.ceil(assessed.length / 2)
      ? "HIGH"
      : "MEDIUM";

  await db.$transaction([
    db.report.create({
      data: {
        assessmentId: assessment.id,
        overallScore: overall,
        confidence: overallConfidence,
        aiRiskScore: aiRisk.score,
        aiRiskConfidence: aiRisk.confidence,
        aiRiskSignalsJson: JSON.stringify(aiRisk.signals),
        skillScoresJson: JSON.stringify(skills),
        categoryScoresJson: JSON.stringify(categories),
        breakdownJson: JSON.stringify(breakdown),
      },
    }),
    db.assessment.update({
      where: { id: assessment.id },
      data: { status: "completed", completedAt: new Date() },
    }),
  ]);

  console.log(`[seed-demo] ${spec.email}: assessment ${assessment.id} completed (overall ${Math.round(overall)}).`);

  if (spec.certificate) {
    const report = await db.report.findUnique({ where: { assessmentId: assessment.id } });
    if (report && !(await db.certificate.findUnique({ where: { assessmentId: assessment.id } }))) {
      const standing = await computeCohortStanding(report.overallScore);
      await db.certificate.create({
        data: {
          code: generateCertificateCode(),
          candidateId: candidate.id,
          assessmentId: assessment.id,
          scoresJson: JSON.stringify(snapshotSkills(report.skillScoresJson)),
          overallScore: report.overallScore,
          confidence: report.confidence,
          cohortStandingJson: standing
            ? JSON.stringify({ ...standing, recordedAt: new Date().toISOString() })
            : null,
          issuedBy: "Demo Seeder",
        },
      });
      console.log(`[seed-demo] certificate issued for ${spec.email}.`);
    }
  }
}

async function main() {
  console.log("[seed-demo] ensuring provisioned (demo-mode) accounts…");
  await ensureProvisionedUsers();
  const demo = demoCandidateAccount();
  for (const spec of DEMO_SPECS) {
    // the demo login candidate only exists in demo mode; skip its spec when off
    if (demo && spec.email === demo.email?.toLowerCase()) {
      await seedDemoCandidate({ ...spec, email: demo.email });
      continue;
    }
    if (spec.email === "candidate@skillproof.io" && !demo) continue;
    await seedDemoCandidate(spec);
  }
  console.log("[seed-demo] done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-demo] failed:", err);
    process.exit(1);
  });
