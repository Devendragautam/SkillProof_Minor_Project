# SkillProof: An Technical Skill Evaluating and Testing Platform

**Project Report**

| | |
|---|---|
| **Submitted by** | |
| Devendra Gautam | Roll No. 24UECC8016 |
| Dadhich Parashar | Roll No. 24UECC8013 |
| Harsh Vardhan Patel | Roll No. 24UECC8021 |
| **Under the guidance of** | [Guide Name, Designation] |
| **Department** | [Department Name] |
| **Institution** | [Institution Name] |
| **Academic Year** | 2024 – 2028 |

---

## Declaration

We hereby declare that the project entitled **"SkillProof: An Technical Skill Evaluating and Testing Platform"** submitted by us is a record of original work carried out by our team. The design, implementation, testing, and documentation presented in this report are the result of our own effort. This project has not been submitted to any other university or institution for the award of any degree, diploma, or fellowship.

**Devendra Gautam** (24UECC8016) —
**Dadhich Parashar** (24UECC8013) —
**Harsh Vardhan Patel** (24UECC8021) —

Date: ____________
Place: ____________

---

## Certificate

This is to certify that the project entitled **"SkillProof: An Technical Skill Evaluating and Testing Platform"** is a bona fide record of the work carried out by **Devendra Gautam (24UECC8016)**, **Dadhich Parashar (24UECC8013)**, and **Harsh Vardhan Patel (24UECC8021)** under our supervision, in partial fulfilment of the requirements for the award of the degree.

The work embodied in this project is original and has not been submitted elsewhere for any other degree or diploma.

**Signature of Guide** — ____________
**Signature of HOD** — ____________

---

## Acknowledgement

We express our sincere gratitude to our project guide for the continuous direction, technical feedback, and encouragement provided throughout the development of this platform. We thank the Department faculty for the academic foundation in data structures, database systems, software engineering, and web technologies upon which this project builds.

We also acknowledge the open-source community: the Next.js, Prisma, Monaco Editor, socket.io, pdf-lib, and shadcn/ui projects made it possible for a student team to assemble a production-grade system without licensing cost.

Finally, we thank our peers who volunteered as test candidates during evaluation; their feedback shaped the assessment runner's UX more than any design exercise could.

**Devendra Gautam — Dadhich Parashar — Harsh Vardhan Patel**

---

## Abstract

Hiring for technical roles suffers from a trust gap: resumes assert skills, but nothing in the standard interview loop *verifies* them. Screening is either a generic multiple-choice quiz (trivially gamed with AI assistance) or a live interview (unscalable, inconsistent across panels). SkillProof closes this gap with a **proctored, evidence-first technical verification platform** built as a full-stack web application.

The system implements a complete pipeline: a candidate uploads a resume; an AI layer extracts the skills actually claimed; a personalized assessment is generated from a curated bank of **95 questions across 12 skills** (coding, debugging, SQL, and MCQ); the assessment runs in a full exam screen with a self-hosted Monaco code editor, server-authoritative timers, per-question time policies, and two-strike tab-switch enforcement; every submitted solution is followed by an AI-driven "explain your own code" defense whose consistency score feeds the final profile; disclosed live proctoring streams paste bursts, tab switches, and session events to the recruiter over socket.io. The result is a scored report with a **HIGH / MEDIUM / LOW evidence-confidence grade**, an explicit AI-assist risk score, and a publicly verifiable certificate (`SP-XXXX-XXXX`) rendered as an A4 landscape PDF with a baked QR code.

The platform is implemented with **Next.js 16 (App Router), React 19, and TypeScript 5** on the front and back end, **Prisma ORM over SQLite** for persistence (14 relational models), a **socket.io micro-service** for real-time proctoring, and **pdf-lib/qrcode** for document generation. The codebase comprises **163 TypeScript source files (~26,200 lines)**, **53 API routes**, **70 components**, and a **51-case automated test suite** covering authentication, authorization, code execution, data-leakage, and regression scenarios. Security is enforced through scrypt password hashing, cookie sessions, role-scoped authorization guards, rate limiting, and an environment-provisioned recruiter account (no open registration). The application ships with a Render deployment blueprint, a production preflight script, and a step-by-step local setup guide.

**Keywords** — skill verification, proctored assessment, adaptive testing, AI-assist detection, verifiable certificates, Next.js, Prisma, socket.io.

---

## Table of Contents

1. [Chapter 1 — Introduction](#chapter-1--introduction)
2. [Chapter 2 — Problem Statement and Objectives](#chapter-2--problem-statement-and-objectives)
3. [Chapter 3 — Survey of Existing Systems](#chapter-3--survey-of-existing-systems)
4. [Chapter 4 — System Analysis](#chapter-4--system-analysis)
5. [Chapter 5 — System Design](#chapter-5--system-design)
6. [Chapter 6 — Implementation](#chapter-6--implementation)
7. [Chapter 7 — Testing](#chapter-7--testing)
8. [Chapter 8 — Results and User Interface](#chapter-8--results-and-user-interface)
9. [Chapter 9 — Deployment](#chapter-9--deployment)
10. [Chapter 10 — Conclusion and Future Scope](#chapter-10--conclusion-and-future-scope)
11. [References](#references)
12. [Appendix A — Project Structure](#appendix-a--project-structure)
13. [Appendix B — Running the Project](#appendix-b--running-the-project)

---

# Chapter 1 — Introduction

## 1.1 Overview

SkillProof is a web platform for verifying — not merely quizzing — technical skill. It serves two roles with two purpose-built interfaces:

- **The candidate** uploads a resume, confirms the skill profile derived from it, and takes a personalized, proctored assessment in a full exam screen. Every stage of the run leaves evidence: per-question time, error-and-fix cycles, code evolution between attempts, and an explanation defense after each submission.
- **The recruiter** runs the entire pipeline from a single dashboard: candidate ledger, curated question bank, live proctoring monitor, cohort analytics with difficulty calibration, and one-click certificate issuance.

The central design idea is **"process, not just product."** A final passing test proves little; *how* the solution was reached proves a great deal. SkillProof therefore records the whole trajectory of each question and scores the trajectory alongside the outcome.

## 1.2 Motivation

Three industry observations motivated the project:

1. **Resume claims are unverifiable at screening time.** Recruiters spend interview slots re-deriving what a candidate claims to know. If the first machine-screened round actually tested the *claimed* skills, later human rounds could focus on judgement and communication.
2. **Generic MCQ screens are now trivially gamed.** Large-language models answer standard multiple-choice and write standard textbook code in seconds. Any screening format that does not observe *process* — timing, revisions, and the ability to defend one's own code — is obsolete as a trust signal.
3. **Verification must be explainable to be useful.** A bare "72%" is not actionable. A score that arrives with *what was measured, how much evidence backs it, and where the risk signals are* is.

## 1.3 Scope of the Project

**In scope**

- Resume upload (PDF) and AI-based skill extraction with candidate confirmation.
- Assessment generation from a curated, recruiter-manageable question bank (coding, debugging, SQL, MCQ).
- A proctored exam runner: Monaco editor (self-hosted, no CDN), visible + hidden test cases across JavaScript / Python / C++ / Java, real-database SQL execution, per-question countdowns, skip-and-return, two-strike tab enforcement.
- Post-submission explain-your-code defense with consistency scoring.
- Live proctoring over socket.io with a durable event transcript.
- Evidence reports (score + confidence + AI-risk), candidate pipeline management with audit history, cohort analytics, role-fit presets.
- Publicly verifiable certificates (on-screen + PDF) and shareable report links.

**Out of scope**

- Webcam/face tracking (proctoring is activity-based and *disclosed*, not surveillance).
- Native mobile applications (the web app is responsive to 390 px).
- Payment and job-posting workflows (the platform ends at verified evidence).

## 1.4 Report Organization

Chapter 2 formalizes the problem and objectives. Chapter 3 surveys existing tools and the gap. Chapter 4 analyzes requirements and feasibility. Chapter 5 presents architecture, module, and database design. Chapter 6 details implementation. Chapter 7 covers testing. Chapter 8 presents results and UI. Chapter 9 describes deployment. Chapter 10 concludes.

---

# Chapter 2 — Problem Statement and Objectives

## 2.1 Problem Statement

> Technical hiring lacks a screening instrument that (a) tests exactly the skills a candidate *claims*, (b) is resistant to impersonation and AI-assisted answering, (c) produces evidence a third party can trust, and (d) scales without human panel time.

Existing formats fail one or more clauses: telephonic screens fail (a) and (d); generic MCQ platforms fail (b); take-home assignments fail (b) and (c); live interviews fail (d).

## 2.2 Objectives

1. **Claim-driven assessment.** Parse the candidate's resume, extract claimed skills with levels, and generate the question plan from those exact claims — never a generic paper.
2. **Process-aware scoring.** Capture time-on-task, attempt/error/fix cycles, and code evolution per question; incorporate them, with explicit confidence, into the final score.
3. **Anti-gaming defenses.** Server-authoritative timing (the browser clock is never consulted), a single-active-question invariant, paste-burst detection, uniform-timing detection, and a mandatory post-submission explanation round.
4. **Disclosed live proctoring.** Stream tab switches, paste events, and session lifecycle to the recruiter in real time, with a durable transcript; make severity thresholds recruiter-configurable.
5. **Verifiable artifacts.** Issue one certificate per completed assessment with per-skill percentages, an overall score, an evidence-confidence grade, and a public verification code resolvable without login; export as QR-baked A4 PDF.
6. **Recruiter operability.** Question-bank management (including PDF import of MCQ papers), per-section timer policy with per-skill overrides, candidate pipeline with auditable decisions, cohort analytics, and role-fit presets.
7. **Engineering quality.** Type-safe end-to-end code, automated tests across auth/authz/execution/leakage/regression, documented setup and deployment paths, and WCAG-AA-conscious, responsive UI.

## 2.3 Success Criteria

| # | Criterion | Evidence in this report |
|---|---|---|
| S1 | Assessment is generated from claimed skills | §5.3, §6.2 (plan builder) |
| S2 | Timing cannot be manipulated client-side | §5.4 (server-authoritative deadlines), test 02 |
| S3 | Copied code does not silently pass | §6.4 (explain defense, consistency scoring) |
| S4 | Proctoring events reach recruiter in real time | §6.5 (socket.io service), health probe |
| S5 | Certificates are publicly verifiable without an account | §6.7 (`/certificates/[code]` public route) |
| S6 | Unauthorized access is blocked across the API | tests 03 (authz) and 05 (leakage) |
| S7 | Build, lint, and tests pass reproducibly | §7 (51-case suite), Appendix B |

---

# Chapter 3 — Survey of Existing Systems

| System category | Representative tools | Strengths | Gap SkillProof addresses |
|---|---|---|---|
| Generic assessment platforms | TestGorilla, HackerRank screening libraries | Broad question catalogs, easy setup | Papers are generic, not claim-derived; little process evidence; AI-assist is an arms race they measure weakly |
| Coding-judge platforms | LeetCode, Codeforces | Objective correctness | No recruiter pipeline, no proctoring, no artifacts tied to a hiring decision |
| Take-home evaluation | GitHub-based assignments | Realistic workloads | No timing integrity, no defense round, employer effort high |
| Interview platforms | CoderPad, CodeSignal live | Interactive | Human-panel-dependent; inconsistent between candidates; not self-serve evidence |
| Proctoring suites | Browser-lock / webcam vendors | Strong anti-impersonation | Surveillance posture; poor candidate experience; nothing about *skill evidence* |

**Derived positioning.** No surveyed tool combines (1) claim-driven personalization, (2) process-evidence scoring with confidence grading, (3) disclosed activity proctoring, and (4) recruiter-side operations in one self-serve web app. SkillProof is designed as exactly that combination, and deliberately chooses *disclosed activity proctoring* over webcam surveillance: candidate trust is a product feature, and the anti-gaming core (explanation defense + server-authoritative timing + paste analytics) does not require a camera.

---

# Chapter 4 — System Analysis

## 4.1 Feasibility Study

**Technical feasibility.** The entire system runs on one Node.js process plus one socket.io process and a file-backed SQLite database. Code execution for four languages is orchestrated through managed runtimes with per-run sandboxing; SQL questions execute against a real, disposable database instance per test run. All components are open source. Feasibility was validated by the working system itself: `GET /api/health` reports `{status:"ok", db:"ok"}` with both services up.

**Economic feasibility.** Zero licensing cost (all OSS). Hosting fits Render's starter plan plus a free service for proctoring. The AI layer is provider-agnostic over any OpenAI-compatible endpoint, and **degrades to built-in heuristics without a key** — the platform never breaks for lack of an AI budget.

**Operational feasibility.** The recruiter account is provisioned from environment variables (no open registration surface to administer); the question bank self-seeds (95 questions, 12 skills) on first boot; deployment is a Render Blueprint (`render.yaml`) creating both services automatically; a preflight script validates production configuration before launch.

## 4.2 Functional Requirements (abridged)

| ID | Actor | Requirement |
|---|---|---|
| FR1 | Candidate | Upload resume PDF; view and confirm extracted skill profile |
| FR2 | Candidate | Take generated assessment: deal-next, skip, hint, submit; see palette + timers |
| FR3 | Candidate | After each submission, answer AI-generated explanation questions |
| FR4 | Candidate | Receive score report with per-skill percentages and confidence |
| FR5 | Candidate | Receive verifiable certificate; download PDF |
| FR6 | Recruiter | Manage candidates, decisions (shortlist/interview/offer/reject/clear) with notes + audit trail |
| FR7 | Recruiter | CRUD the question bank; import MCQ papers from PDF; validate SQL questions |
| FR8 | Recruiter | Configure per-section timer policy and per-skill overrides |
| FR9 | Recruiter | Watch live proctoring stream; review past session transcripts |
| FR10 | Recruiter | Issue certificates; view cohort analytics and standings |
| FR11 | Recruiter | Save role-fit weight presets applied to candidate ranking |
| FR12 | Visitor | Verify any certificate code without an account |

## 4.3 Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR1 | Security | scrypt (N=16384) password hashing; HTTP-only cookie sessions; role-scoped guards on every recruiter route |
| NFR2 | Integrity | All assessment timing server-authoritative (`startedAt`, `dealtAt`, `deadlineAt`, `expiresAt`); at most one active question per assessment (DB-enforced) |
| NFR3 | Privacy | Proctoring disclosed in-UI; no webcam/mic capture; proctor payloads never include code content, only activity signals |
| NFR4 | Reliability | AI features have deterministic heuristic fallbacks; seed gate verifies hints/coverage before boot |
| NFR5 | Usability | Responsive to 390 px; WCAG-AA-conscious contrast; keyboard-navigable exam screen |
| NFR6 | Maintainability | Strict TypeScript; single Prisma schema; lint + typecheck + tests gate (`bun run verify`) |
| NFR7 | Deployability | One-command dev bootstrap; Render Blueprint for cloud; preflight checks |

## 4.4 Tools and Technology Selection

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | One codebase for UI + API routes; server-side guards adjacent to routes; standalone build for containers |
| Language | **TypeScript 5 (strict)** | Compile-time elimination of a whole class of runtime defects across 163 files |
| UI | React 19, **Tailwind CSS 4**, shadcn/ui, Lucide, Framer Motion | Utility styling with a consistent design-token system; accessible primitives |
| Data | **Prisma ORM + SQLite** | Typed schema (14 models) as single source of truth; zero-ops file database on a mounted disk |
| Editor | **Monaco Editor, self-hosted** (`public/monaco-vs`) | VS-Code-grade editing offline; no CDN dependency in exam rooms |
| Real-time | **socket.io micro-service** (port 3003) | Isolates live proctoring from the main app; independent scaling and health probe (`/healthz`) |
| Documents | **pdf-lib + qrcode + unpdf** | Certificate/report PDF rendering, QR baking, resume text extraction |
| State | Zustand (client), TanStack Query (server) | Minimal-boilerplate client store; cache-correct server state |
| Runtime/tooling | Node.js ≥ 20.9, **Bun** (dev, tests, scripts) | Fast test runner; uniform script UX |
| AI | Provider-agnostic OpenAI-compatible client | Any endpoint (GLM, OpenAI, DeepSeek, OpenRouter); heuristic fallback |

---

# Chapter 5 — System Design

## 5.1 High-Level Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │                  BROWSER                     │
                    │  Landing · Runner (Monaco) · Recruiter Dash  │
                    └──────────────┬───────────────┬───────────────┘
                                   │ HTTPS/JSON    │ socket.io
                    ┌──────────────▼──────────┐  ┌─▼──────────────────┐
                    │  SKILLPROOF-WEB :3000   │  │ PROCTOR-SVC :3003  │
                    │  Next.js 16 App Router  │  │ socket.io + /healthz│
                    │  ├─ 53 API routes       │  │  join/event/leave   │
                    │  ├─ auth (scrypt+cookie)│  │  sessions registry  │
                    │  ├─ assessment engine   │  └─────────┬───────────┘
                    │  ├─ executors (4 langs) │            │ flush (batch)
                    │  ├─ AI adapter +        │  ┌─────────▼───────────┐
                    │  │   heuristic fallback │  │ ProctorEventRecord  │
                    │  └─ PDF generation      │  │ (durable transcript)│
                    └──────────────┬──────────┘  └─────────┬───────────┘
                                   │ Prisma                │
                          ┌────────▼───────────────────────▼────────┐
                          │        SQLite (db/custom.db)            │
                          │        14 relational models             │
                          └─────────────────────────────────────────┘
```

Two cooperating services, one shared database:

- **skillproof-web (port 3000)** — Next.js App Router. All HTTP APIs, the assessment engine, language executors, the AI adapter, and PDF generation.
- **proctor-service (port 3003)** — a dedicated socket.io service. Candidates publish activity events; recruiters receive them in real time. It shares its HTTP port with socket.io so PaaS platforms can health-probe `/healthz`, and flushes events in batches to `ProctorEventRecord` for post-session transcripts.

## 5.2 Candidate Journey (state flow)

```
Resume upload ──► AI skill extraction ──► Candidate confirms profile
      └── Resume{rawText, skillsJson}         │
                                              ▼
                              buildPlan(claims) ── Assessment{planJson}
                                              │
                 ┌────────────────────────────┼──────────────────────────┐
                 ▼                            ▼                          ▼
        deal next question ──► snapshot policy ──► solve (Monaco, tests)
                 │  (dealtAt/deadlineAt set)          │ submit
                 │                                    ▼
                 │                    code execution (4 langs / SQL)
                 │                                    ▼
                 │                    explain-your-code defense
                 │             (AI questions + consistency scoring)
                 │                                    │
                 ├── skip ──► status=skipped          │
                 ├── hint  ──► hintCount++            ▼
                 └── timeout (server-side) ─► status=timeout
                                              │
                              all questions finalized
                                              ▼
                          Report{overall, confidence, aiRisk, skillScores}
                                              ▼
                          Certificate{code SP-XXXX-XXXX, PDF, QR}
```

## 5.3 Assessment Plan Builder

The plan builder maps each confirmed claim to question pools by the skill catalog's `pools` field (`coding | debugging | mcq`), samples from the curated bank at escalating difficulty, and honors section mix. Every dealt question snapshots the effective time limit from the recruiter's `TimerPolicy` (with per-skill overrides) onto its `AssessmentQuestion` row — **mid-assessment policy changes never rewrite history**.

| Section | Default limit |
|---|---|
| Debugging | 5 min / question |
| DSA easy / medium / hard | 20 / 30 / 45 min |
| MCQ | 45 s / question |

## 5.4 Timing Integrity Model

Four server-authoritative timestamps drive the whole run; the browser clock is never consulted:

1. `Assessment.startedAt` — set at first deal.
2. `AssessmentQuestion.dealtAt` — when a question becomes active.
3. `AssessmentQuestion.deadlineAt = dealtAt + timeLimitSec` — submissions past this (+ a small network grace) are rejected and the question is finalized `timeout`.
4. `Assessment.expiresAt` — optional overall deadline; every assessment mutation past it is rejected.

**Single-active-question invariant.** `AssessmentQuestion.activeFlag` equals `assessmentId` exactly while `status = "current"`, else NULL. A `@@unique([assessmentId, activeFlag])` constraint exploits SQLite's NULL-distinct semantics so at most one row per assessment can ever be active — two concurrent "deal next" requests cannot both win.

## 5.5 Database Design

The schema (`prisma/schema.prisma`) contains **14 models**. JSON-typed columns (e.g. `testsJson`, `metricsJson`) carry structured payloads that are read-write-hot, while relational columns carry everything that is queried or integrity-checked.

| Model | Purpose | Key fields |
|---|---|---|
| `Candidate` | Hiring-candidate identity + pipeline decision | `pipelineStatus`, `pipelineNote`, `pipelineMetaJson`, `pipelineUpdatedAt` |
| `Resume` | Uploaded resume + extracted skills | `rawText`, `skillsJson`, `fileName` |
| `Question` | Curated bank item (coding/debugging/mcq) | `skill`, `category`, `difficulty`, `starterCode`, `testsJson`, `optionsJson`, `schemaSql`/`seedSql`/`solutionSql`, `timeLimitSec`, `source` |
| `Assessment` | One candidate run | `planJson`, `status`, `startedAt`, `expiresAt`, `completedAt` |
| `AssessmentQuestion` | Dealt question instance | `status` (current/solved/failed/skipped/timeout), `score`, `timeLimitSec` (snapshot), `dealtAt`, `deadlineAt`, `activeFlag`, `attempts`, `hintCount` |
| `Submission` | Code + telemetry per dealt question | `code`, `language`, `eventsJson`, `versionsJson`, `metricsJson`, `testResultsJson`, `aiRiskScore`, `aiRiskSignalsJson` |
| `ExplanationAnswer` | Defense Q/A per submission | `questionText`, `answerText`, `consistencyScore`, `aiFeedback` |
| `Report` | Final evidence report | `overallScore`, `confidence`, `aiRiskScore`, `skillScoresJson`, `breakdownJson`, `shareToken` (192-bit, never the assessment id) |
| `User` | Platform account (recruiter/candidate) | `passwordHash` (`salt:derivedKey` scrypt hex), `role` |
| `FitPreset` | Role-fit weight presets | `weightsJson` |
| `PipelineEvent` | Audit trail of pipeline decisions | `status`, `note`, `metaJson` |
| `TimerPolicy` | Recruiter per-section limits + proctor thresholds | `debuggingMin`, `dsaEasyMin`…, `mcqSec`, `skillOverridesJson`, `pasteWarnChars`, `pasteRiskChars`, `explainWarnPct` |
| `Certificate` | Verifiable certificate | `code` (`SP-XXXX-XXXX`), `scoresJson`, `overallScore`, `confidence`, `issuedBy`, `cohortStandingJson` |
| `ProctorEventRecord` | Durable proctor transcript | `type`, `detail`, `severity` (info/good/warn/risk), `ts` |

**Integrity highlights**

- Cascading deletes from `Candidate` down through `Resume`/`Assessment`/`Certificate`/`PipelineEvent`.
- `Certificate.assessmentId` and `Report.assessmentId` are `@unique` (one per run; idempotent issuance).
- `Submission.assessmentQuestionId` is `@unique` (exactly one submission per dealt question).
- Indexes on every foreign key and on hot query paths (`skill`, `category+difficulty`, `status`, `issuedAt`, `ts`).

## 5.6 Module Design

| # | Module | Responsibility | Main code |
|---|---|---|---|
| M1 | Resume intake | PDF → text; AI skill extraction; candidate confirmation | `src/app/api/resume/extract`, `skills/extract`, `src/lib/ai.ts` |
| M2 | Plan builder | claims → question plan (mixed sections) | `src/lib/server/assessment.ts` |
| M3 | Exam runner UI | palette, timers, Monaco, tests, strikes | `src/components/skillproof/` (runner) |
| M4 | Executors | JS/Python/C++/Java sandboxed runs; SQL against real DB | `src/lib/server/exec`, `lang-exec.ts`, `sql-exec.ts` |
| M5 | Explain defense | AI question generation; consistency scoring | `src/app/api/assessment/[id]/explain`, `src/lib/metrics.ts` |
| M6 | Scoring & report | per-skill %, confidence, AI-risk aggregation | `src/lib/scoring.ts`, `src/app/api/report/[id]` |
| M7 | Proctoring | socket.io live stream + durable records | `mini-services/proctor-service`, `src/app/api/proctor/*` |
| M8 | Certificates | code minting, PDF rendering, public verify | `src/lib/server/certificates.ts`, `certificate-pdf.ts` |
| M9 | Recruiter ops | pipeline, bank CRUD + PDF import, timer policy, cohort, fit presets | `src/app/api/candidates/*`, `questions/*`, `timer-policy`, `cohort/*`, `fit-presets/*` |
| M10 | Auth & guards | sessions, scrypt, role guards, rate limits | `src/lib/server/auth.ts`, `guards.ts`, `rate-limit.ts` |

## 5.7 API Surface (53 routes, grouped)

- **Auth** — `auth/login`, `auth/logout`, `auth/me`, `auth/register` (candidate self-registration only; recruiter is env-provisioned)
- **Assessment** — `assessment`, `assessment/[id]` + `complete | explain | goto | hint | next | skip | submit`
- **Code execution** — `run` (sandboxed multi-language)
- **Resume & skills** — `resume/extract`, `skills/extract`
- **Reports** — `report/[id]`, `report/[id]/pdf`, `report/pdf-zip`
- **Certificates** — `certificates`, `certificates/[code]` (public), `certificates/[code]/pdf`, `certificates/list`
- **Questions** — `questions`, `questions/import`, `questions/import-mcq`, `questions/import-pdf`, `questions/stats`, `questions/validate-sql`
- **Recruiter ops** — `candidates`, `candidates/[id]`, `candidates/[id]/attempts|pipeline-status|timeline`, `candidates/bulk|invite|merge`, `pipeline-events`, `cohort`, `cohort/standings`, `fit-presets`, `recruiter/role-fit`
- **Proctoring** — `proctor/events`, `proctor/summary`
- **Platform** — `health`, `stats`, `timer-policy`, `attempts`, `my/attempts`, `my/certificates`, `submissions/[id]/versions`

## 5.8 UI / UX Design

The design language is **"sage on cream"**: a cream paper ground, sage ink, hairline rules, mono uppercase micro-labels, one sage accent; flat cards with no shadows so evidence reads like a printed record. Typography pairs Fraunces (display serif) with Archivo (text) and IBM Plex Mono (data). Status colors (emerald / amber / rose) are reserved for meaning — pass, warning, failure — never decoration. Dark mode is a moss-charcoal sheet. Both themes are first-class; the layout is responsive down to 390 px with WCAG-AA-conscious contrast, and every interactive element is keyboard-reachable.

---

# Chapter 6 — Implementation

## 6.1 Codebase Profile

| Metric | Value |
|---|---|
| TypeScript source files | 163 |
| Source lines (TS/TSX) | ≈ 26,200 |
| API routes | 53 |
| UI components | 70 |
| Prisma models | 14 |
| Curated questions / skills | 95 / 12 |
| Automated test cases | 51 (7 files) |
| Services | 2 (web :3000, proctor :3003) |

## 6.2 Resume Intake and Skill Extraction (M1)

The resume route accepts a PDF, extracts text with `unpdf`, and hands it to the AI adapter with a structured-output prompt; the extracted skills are presented to the candidate for **confirmation** (the human stays in the loop — extraction proposes, the candidate disposes). Confirmed claims persist as `Resume.skillsJson` and drive the plan builder. The AI adapter targets any OpenAI-compatible `/chat/completions` endpoint; when no key is configured, a deterministic heuristic extractor (keyword/alias matching from the skill catalog) serves the same contract, degraded but functional.

## 6.3 Assessment Engine and Timing (M2, part of M3)

`src/lib/server/assessment.ts` implements deal/skip/hint/submit/complete against the integrity model of §5.4. Notable implementation points:

- **Deal** sets `dealtAt`/`deadlineAt`, snapshots `timeLimitSec`, and flips `activeFlag` inside one transaction — the DB unique constraint is the concurrency backstop.
- **Skip/timeout** finalize server-side; the client cannot force states.
- **Hint** increments `hintCount` on the dealt row (visible later in evidence).
- **Complete** aggregates statuses → `Report` rows with per-skill scores and the confidence grade derived from evidence density (how many questions contributed, timing consistency, defense consistency).

## 6.4 Code Execution and the Explain Defense (M4, M5)

- **Executors.** JavaScript runs in-process with a guarded VM; Python/C++/Java run through managed runtime scripts (`tests/python-runtime-build.sh` provisions the toolchain) with per-run working directories; SQL questions create a fresh database, apply `schemaSql` + `seedSql`, execute the candidate's query, and compare result rows against the expected set (with optional `unordered` semantics).
- **Visible and hidden tests.** The runner shows some tests, keeps others hidden; hidden tests decide the pass.
- **Explain defense.** After each submission the AI generates questions about the candidate's *own code* (variable names, chosen algorithm, edge cases). Answers are scored for consistency against the code and the editing timeline. A copied answer may compile — it does not survive its own defense. Consistency feeds the report and raises AI-assist risk when it diverges.
- **AI-risk signals.** Paste bursts (chars above `pasteWarnChars`/`pasteRiskChars` thresholds), uniform timing patterns, and explanation mismatch aggregate into `Submission.aiRiskScore` with a signal list.

## 6.5 Live Proctoring (M7)

The proctor micro-service (`mini-services/proctor-service`, port 3003) exposes:

| Socket event | Direction | Meaning |
|---|---|---|
| `proctor:join-candidate` | candidate → svc | attach session (candidate, assessment) |
| `proctor:event` | candidate → svc | disclosed activity event (tab switch, paste, focus…) with severity |
| `proctor:leave-candidate` | candidate → svc | detach |
| `proctor:join-recruiter` | recruiter → svc | subscribe to live stream |
| `proctor:init` / `proctor:event` / `proctor:sessions` | svc → recruiter | snapshot, live event, session list |

The service keeps an in-memory stream for realtime delivery and **flushes batches to `ProctorEventRecord`** so a recruiter can read the transcript after the run. Severity thresholds (paste char counts, explain consistency) are recruiter-configurable in `TimerPolicy`. A `/healthz` JSON probe doubles as the PaaS health check; an ingest key (`PROCTOR_INGEST_KEY`) authenticates web→proctor traffic.

## 6.6 PDF Generation (M8, M6)

`certificate-pdf.ts` and `report-pdf.ts` draw A4-landscape documents with pdf-lib: cream sheet, sage rules, per-skill bars, QR code baked from the public verification URL (`qrcode`), and the cohort-standing snapshot at issue time. Report bundles (`report/pdf-zip`) export batches for offline review.

## 6.7 Security Implementation (M10)

- **Password hashing** — scrypt with per-user salt, N=16384, stored as `salt:derivedKey` (hex). Verification is constant-time.
- **Sessions** — HTTP-only cookies; `auth/me` resolves role for route gating.
- **Authorization** — `guards.ts` wraps every recruiter API with role checks; candidate routes scope queries to the session identity; `certificates/[code]` and share-token report links are the only public surfaces, minted with cryptographic randomness (192-bit; never derived from ids).
- **Rate limiting** — `rate-limit.ts` protects auth and execution endpoints (test 99 exercises the limits).
- **No recruiter self-registration** — the recruiter account is provisioned from `SKILLPROOF_RECRUITER_*` environment variables at seed/login; the seed rotates the stored hash only when the configured password differs.
- **Seed gate** — the question-bank seed verifies hint coverage and structural invariants before completing, so the runner never deals a hint-less or malformed question.

## 6.8 Frontend Architecture (M3, M9)

One App Router page composes feature components from `src/components/skillproof/` (landing, candidate flow, exam runner, recruiter dashboard tabs, certificate sheets). Client state lives in a Zustand store; server state in TanStack Query with typed fetchers. The Monaco runtime is served from `public/monaco-vs` (self-hosted; exam rooms do not depend on a CDN). Drag-and-drop reordering in recruiter views uses dnd-kit; charts in cohort analytics use recharts.

---

# Chapter 7 — Testing

## 7.1 Strategy

Testing runs on **bun test** with a dedicated test database (`db/test.db`). The suite (`bun run test`, 30 s timeout) covers the five risk axes of the platform; `bun run verify` gates lint + typecheck + tests in one command.

## 7.2 Test Inventory (51 cases / 7 files)

| File | Axis | Representative coverage |
|---|---|---|
| `01-auth.test.ts` | Authentication | login/logout/me; scrypt verify; session cookie behavior; env-provisioned recruiter |
| `02-assessment.test.ts` | Assessment lifecycle | plan build; deal/skip/hint/submit; deadline rejection; single-active invariant; complete→report |
| `03-authz.test.ts` | Authorization | recruiter-only routes reject candidates/anons; candidate scoping; public-surface whitelist |
| `04-code-exec.test.ts` | Execution | JS guarded VM; Python/C++/Java runtimes; SQL setup/seed/expected-rows; hidden tests honored |
| `05-data-leakage.test.ts` | Leakage | error payloads never leak stack/hash fields; share tokens don't expose ids; proctor payloads exclude code |
| `06-regression.test.ts` | Regressions | historical bug reproductions pinned as permanent tests |
| `99-rate-limits.test.ts` | Abuse | auth + execution rate limits trip and recover |

## 7.3 Verification Baseline (as recorded at report time)

| Check | Command | Result |
|---|---|---|
| Lint | `bun run lint` | 0 errors |
| Types | `bun run typecheck` | 0 errors |
| Tests | `bun run test` | 51 cases pass |
| Web health | `GET /api/health` | `{status:"ok", db:"ok"}` |
| Bank stats | `GET /api/stats` | `{questions:95, skills:12}` |
| Proctor health | `GET :3003/healthz` | 200 `{status:"ok"}` |

## 7.4 Manual Acceptance Walkthrough

The manual script exercises the golden path end-to-end: upload sample resume → confirm skills → assessment generated from claims → solve a coding question (visible tests green, hidden tests decide) → trigger a tab switch and observe the proctor flag → fail the defense deliberately and observe consistency drop → complete → report with confidence + risk → issue certificate → verify the code publicly → download QR-baked PDF. This walkthrough was executed against the running system; §8 shows the corresponding surfaces.

---

# Chapter 8 — Results and User Interface

## 8.1 Delivered Capabilities vs. Objectives

| Objective (§2.2) | Delivered | Where |
|---|---|---|
| Claim-driven assessment | Resume → skills → mixed plan from 95-question bank | M1/M2 |
| Process-aware scoring | events/versions/metrics captured per question; confidence grade | M6, §6.3 |
| Anti-gaming | server deadlines; single-active invariant; paste analytics; defense round | §5.4, §6.4 |
| Disclosed proctoring | socket.io stream + durable transcripts + configurable thresholds | §6.5 |
| Verifiable artifacts | SP codes, public verify route, QR PDF | §6.6 |
| Recruiter operability | pipeline + audit, bank CRUD + PDF import, timer policy, cohort, fit presets | M9 |
| Engineering quality | strict TS, 51 tests, setup + deploy docs | §7, Appendices |

## 8.2 Interface Surfaces (described)

1. **Landing** — value proposition with the four-stage candidate flow; recruiter entry.
2. **Candidate flow** — resume upload → skill-profile confirmation chips → runner → verified profile.
3. **Exam runner** — question palette with statuses, per-question countdown, Monaco with visible/hidden test toggle, language selector, two-strike tab banner, hint affordance (counted), skip-and-return.
4. **Defense modal** — post-submission explain questions with consistency meter.
5. **Report** — overall score with confidence badge, per-skill bars, AI-risk panel listing signals, share link.
6. **Recruiter dashboard (five ledgers)** — pipeline (decisions + audit timeline), question bank (filters, PDF import, timer policy editor), live proctoring (session cards + severity-colored stream), cohort insights (difficulty calibration, standings), certificates (one-click issue, list).
7. **Public verify** — code lookup rendering the certificate sheet with QR, no login.

*(Screenshot plates are inserted here at submission time from the running application; all surfaces above are live in the delivered build.)*

## 8.3 Limitations

- Proctoring observes *activity*, not identity — no face/ID matching (a deliberate privacy trade).
- SQLite suits single-server deployments; horizontal scale-out would require a networked database.
- AI outputs depend on the configured provider's quality; heuristic fallbacks are conservative.
- The curated bank is finite (95 questions); heavy reuse would need periodic expansion — supported by the import pipeline.

---

# Chapter 9 — Deployment

## 9.1 Local Development

```bash
bun install
# .env: DATABASE_URL=file:<abs path>/db/custom.db
bun run db:generate && bun run db:push && bun run db:seed
bun run dev            # web :3000
cd mini-services/proctor-service && bun install && bun run dev   # proctor :3003
```

Environment contract: `DATABASE_URL`; `SKILLPROOF_RECRUITER_NAME/EMAIL/PASSWORD` (provision recruiter); optional `DEMO_MODE=1` + `SKILLPROOF_DEMO_CANDIDATE_PASSWORD` (sample candidate); `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL` (optional AI); `NEXT_PUBLIC_PROCTOR_URL` (live tab). A full VS-Code walkthrough (extensions, launch configs, troubleshooting) ships in `SETUP.md`.

## 9.2 Cloud Deployment (Render Blueprint)

`render.yaml` declares two services:

| Service | Role | Notes |
|---|---|---|
| `skillproof-web` | Next.js standalone + Prisma/SQLite | starter plan (persistent disk mount required for SQLite) |
| `skillproof-proctor` | socket.io service | free plan; `/healthz` probe |

Shared secrets (`PROCTOR_INGEST_KEY`) must match on both services; `NEXT_PUBLIC_PROCTOR_URL`/`PROCTOR_PERSIST_URL`/`PROCTOR_CORS_ORIGIN` are filled after first deploy. `scripts/bootstrap-db.mjs` ensures the data directory, pushes the schema, and seeds on boot; `scripts/preflight-prod.mjs` validates configuration before launch. The AI layer activates by setting the provider key in the dashboard; without it every AI feature falls back to heuristics.

---

# Chapter 10 — Conclusion and Future Scope

## 10.1 Conclusion

SkillProof demonstrates that a student-built, fully open-source stack can deliver a hiring-grade verification loop: **claim-driven assessment → proctored execution → explanation defense → evidence report → verifiable certificate**. The system's distinguishing results are:

- A **14-model relational schema** with server-authoritative timing and a DB-enforced single-active-question invariant — integrity by construction, not by convention.
- A **process-evidence scoring model** (time, error-and-fix cycles, code evolution, defense consistency) with explicit **HIGH/MEDIUM/LOW confidence** — scores that explain themselves.
- **Disclosed activity proctoring** that respects the candidate while still surfacing paste bursts, timing anomalies, and session events in real time with durable transcripts.
- A complete **recruiter operating surface** — bank management with PDF import, timer policy with per-skill overrides, auditable pipeline, cohort analytics, role-fit presets — at zero licensing cost.
- Engineering discipline measurably in place: 163 source files (~26.2k lines), 53 API routes, 51 automated cases across auth/authz/execution/leakage/regression, lint/typecheck gates, and reproducible local + cloud deployment paths.

The trust gap the project targeted — *resumes assert, interviews guess* — is narrowed by an instrument that **tests the claims, watches the process, and hands over evidence anyone can verify**.

## 10.2 Future Scope

1. **Identity-bound proctoring options** — opt-in face presence checks (not recognition) for high-stakes runs, with the same disclosure posture.
2. **IRT-based adaptive difficulty** — replace linear escalation with item-response-theory calibration using the accumulated cohort statistics.
3. **Plagiarism graph** — cross-candidate structural similarity over submission history to catch recycled solutions.
4. **Question-bank marketplace** — recruiter-contributed questions with peer review and royalty tracking.
5. **Multi-panel interview mode** — scheduled live panels inside the same evidence pipeline.
6. **Additional language runtimes** (Rust, Go) and container-isolated execution pools.
7. **Analytics upgrades** — time-to-skill curves and role-fit calibration feedback loops.

---

# References

1. Next.js Documentation — App Router. Vercel. https://nextjs.org/docs
2. React Documentation. Meta Open Source. https://react.dev
3. TypeScript Handbook. Microsoft. https://www.typescriptlang.org/docs
4. Prisma ORM Documentation. Prisma Data. https://www.prisma.io/docs
5. SQLite Documentation. SQLite Consortium. https://sqlite.org/docs.html
6. Tailwind CSS Documentation. https://tailwindcss.com/docs
7. shadcn/ui — Component Collection. https://ui.shadcn.com
8. Monaco Editor. Microsoft. https://microsoft.github.io/monaco-editor
9. socket.io Documentation. https://socket.io/docs
10. pdf-lib. https://github.com/Hopding/pdf-lib
11. qrcode (node-qrcode). https://github.com/soldair/node-qrcode
12. unpdf — PDF text extraction. https://github.com/unjs/unpdf
13. RFC 7914 — The scrypt Password-Based Key Derivation Function. IETF.
14. OWASP Application Security Verification Standard (ASVS). OWASP Foundation.
15. WCAG 2.1 — Web Content Accessibility Guidelines. W3C.
16. Bun Documentation. https://bun.sh/docs
17. Render Documentation — Blueprints (render.yaml). https://render.com/docs
18. zod — Schema Validation. https://zod.dev

---

# Appendix A — Project Structure

```
├─ src/
│  ├─ app/                  # App Router page + /api routes (53 route.ts files)
│  │  └─ api/               # auth, assessment, run, resume, skills, report,
│  │                        # certificates, questions, candidates, cohort,
│  │                        # fit-presets, proctor, timer-policy, health, stats
│  ├─ components/
│  │  ├─ skillproof/        # feature UI: landing, candidate flow, runner,
│  │  │                     # recruiter dashboard, certificates
│  │  └─ ui/                # shadcn/ui primitives
│  └─ lib/
│     ├─ questions/         # bank.ts (95 questions), hints.ts
│     ├─ server/            # auth, guards, rate-limit, assessment engine,
│     │                     # exec/, lang-exec, sql-exec, timer-policy,
│     │                     # certificates, certificate-pdf, report-pdf
│     ├─ ai.ts, scoring.ts, metrics.ts, skills.ts (catalog), store.ts
├─ prisma/schema.prisma     # 14 models (§5.5)
├─ tests/                   # 7 bun-test files, 51 cases (§7.2)
├─ scripts/                 # seed.ts, seed-demo.ts, bootstrap-db.mjs,
│                           # preflight-prod.mjs, start-server.mjs
├─ mini-services/
│  └─ proctor-service/      # socket.io service (:3003), /healthz
├─ public/monaco-vs/        # self-hosted Monaco runtime
├─ render.yaml              # Render blueprint (web + proctor)
├─ DEPLOY.md                # zero-to-Render guide
├─ SETUP.md                 # VS Code / local setup walkthrough
└─ PROJECT_REPORT.md        # this document
```

# Appendix B — Running the Project

| Step | Command | Expected |
|---|---|---|
| Install | `bun install` | deps + `prisma generate` |
| Configure | create `.env` with `DATABASE_URL=file:<abs>/db/custom.db` and `SKILLPROOF_RECRUITER_*` | — |
| Schema | `bun run db:generate && bun run db:push` | SQLite created |
| Seed | `bun run db:seed` | 95 questions, 12 skills, recruiter provisioned |
| Web | `bun run dev` | :3000 serving |
| Proctor | `cd mini-services/proctor-service && bun install && bun run dev` | :3003 `/healthz` ok |
| Verify | `bun run verify` | lint 0 / types 0 / 51 tests pass |
| Stats | `GET /api/stats` | `{questions:95, skills:12}` |

**End of report.**
