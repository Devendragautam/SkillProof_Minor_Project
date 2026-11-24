# SkillProof

SkillProof is a proctored technical-verification platform for hiring. Candidates upload a resume; the platform builds a personalized assessment from the skills it claims, runs it under disclosed proctoring, and scores the result with evidence artifacts — time-on-task, error-and-fix cycles, code evolution, explanation consistency, and AI-assist risk signals. Recruiters run the entire pipeline from one dashboard and issue publicly verifiable certificates.

## How it works

**Candidate flow** — four stages: resume upload, skill-profile confirmation, proctored assessment, verified profile. The assessment is generated from the candidate's own claims. The runner is a full exam screen: question palette, Monaco editor with visible and hidden test cases (JavaScript, Python, C++, Java), SQL questions executed against a real database, per-question countdowns, skip-and-return, and tab-switch enforcement (two strikes auto-submit). Every submitted solution triggers an explanation round; a copied answer compiles but does not survive its own defense.

**Recruiter dashboard** — five ledgers: candidate pipeline with structured decisions and audit history, a curated question bank (coding, SQL, debugging, MCQ across 12 skills) with PDF import and a per-section timer policy, live proctoring streamed over socket.io, cohort insights with difficulty calibration, and one-click certificate issuing.

**Certificates** — one per completed assessment, carrying per-skill verified percentages, an overall score with confidence level, and a public verification code (`SP-XXXX-XXXX`). Anyone can verify a code without an account. The on-screen sheet and the downloadable PDF (pdf-lib, A4 landscape) are the same design, QR-baked.

### Section timer policy

| Section | Default limit |
|---|---|
| Debugging | 5 min per question |
| DSA, easy | 20 min |
| DSA, medium | 30 min |
| DSA, hard | 45 min |
| MCQ | 45 sec per question |

Each dealt question snapshots its effective limit, so mid-assessment policy changes never rewrite history.

### What the engine measures

| Mechanism | Captures |
|---|---|
| Generated, not generic | Question set built from the exact skills the resume claims |
| Process, not just product | Time-on-task, error and fix cycles, code evolution between runs |
| Adaptive difficulty | Steps up when solved quickly; diagnoses at the right level otherwise |
| Explain your own code | Post-submission defense; consistency feeds the profile |
| AI-assist signals | Paste bursts, uniform timing, explanation mismatch raise risk flags |
| Confidence-aware scoring | Every score ships with a HIGH / MEDIUM / LOW evidence confidence |

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui, Lucide icons, Framer Motion |
| Database | Prisma ORM, SQLite |
| Code editor | Monaco Editor, self-hosted under `public/monaco-vs` (no CDN) |
| Real-time | socket.io micro-service (`mini-services/proctor-service`, port 3003) |
| Documents | pdf-lib, qrcode, unpdf |
| State | Zustand (client), TanStack Query (server) |
| Auth | Cookie sessions, scrypt password hashing, single env-provisioned recruiter |

## Getting started

Prerequisites: Node.js 20.9+, Bun 1.2+. For a step-by-step VS Code walkthrough (extensions, workspace config, debugging, troubleshooting), see [SETUP.md](SETUP.md).

```bash
bun install

# create .env in the project root
cat > .env <<'EOF'
DATABASE_URL=file:/absolute/path/to/db/custom.db
EOF

bun run db:generate
bun run db:push
bun run dev        # http://localhost:3000
```

Optional live proctoring (the Live Monitoring tab):

```bash
cd mini-services/proctor-service && bun install && bun run dev   # port 3003
echo 'NEXT_PUBLIC_PROCTOR_URL=http://localhost:3003' >> .env.local
# restart the dev server; without it the Live tab reports offline
```

### Accounts and environment

The recruiter account is not self-registered. It is provisioned from environment variables on seed and login:

```bash
SKILLPROOF_RECRUITER_NAME="Devendra Gautam"
SKILLPROOF_RECRUITER_EMAIL=you@example.com
SKILLPROOF_RECRUITER_PASSWORD="use-a-strong-password"   # quote values containing #
```

Demo mode creates a sample candidate when explicitly enabled:

```bash
DEMO_MODE=1
SKILLPROOF_DEMO_CANDIDATE_PASSWORD=demo1234
```

Run `bun run db:seed` after changing these values; the seed rotates the recruiter hash only when the configured password differs from the stored one.

### Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Dev server on port 3000 |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript, no emit |
| `bun run test` | Test suite (`tests/`) via bun test |
| `bun run verify` | lint + typecheck + test |
| `bun run db:push` | Push `prisma/schema.prisma` to SQLite |
| `bun run db:seed` | Provision recruiter/demo accounts |
| `bun run preflight` | Production preflight checks |
| `bun run build` / `bun run start` | Production build and serve |

## Project structure

```
├─ src/
│  ├─ app/                  # App Router pages and /api routes (auth, assessments,
│  │                        # questions, timer policy, certificates, proctor)
│  ├─ components/
│  │  ├─ skillproof/        # Feature UI: landing, assessment runner, recruiter
│  │  │                     # dashboard, certificates, question bank
│  │  └─ ui/                # shadcn/ui primitives
│  └─ lib/                  # Zustand store, question bank, scoring, proctor
│                           # client, server/ (auth, engine, executors, pdf)
├─ prisma/schema.prisma     # Users, Assessments, Questions, TimerPolicy,
│                           # Certificates, PipelineEvents
├─ tests/                   # bun test suite (auth, authz, engine, leakage, regressions)
├─ scripts/                 # seed, demo seed, prod preflight
├─ mini-services/
│  └─ proctor-service/      # socket.io live-proctoring service
└─ public/monaco-vs/        # Self-hosted Monaco editor runtime
```
https://preview-chat-4ea8059e-2899-4423-9142-6969e8daa15b.space-z.ai/
## Design language

Sage on cream: a cream paper ground, sage ink, hairline rules, mono uppercase micro-labels, one sage accent, Fraunces display serif with Archivo and IBM Plex Mono. Flat cards, no shadows; evidence is presented like a printed record. Status colors (emerald, amber, rose) are reserved for meaning — pass, warning, failure — never decoration. Both themes are first-class; dark mode is a moss-charcoal sheet with cream text and pale-sage anchors.
