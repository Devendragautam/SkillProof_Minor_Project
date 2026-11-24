# Deploying SkillProof to Render

This guide takes the repo from zero to a working Render deployment:
main app (Next.js 16) + live-proctoring service (socket.io) + persistent
SQLite database + your own AI provider key.

> A `render.yaml` blueprint is included — Render creates both services
> automatically from it.

---

## 0. What runs where

| Piece | Service on Render | What it is |
|---|---|---|
| Main app | `skillproof-web` | Next.js 16 standalone server + Prisma/SQLite (on a mounted disk) |
| Live proctoring | `skillproof-proctor` | socket.io service (browser ⇄ recruiter live monitor, event transcripts) |

The database is **SQLite on a Render Persistent Disk** — no external database
service needed. The app seeds itself: the curated question bank and your
recruiter account are created automatically on first use.

---

## 1. Push this repo to GitHub

Render deploys from a Git repository (GitHub/GitLab/Bitbucket). Push this
project to a new GitHub repo first. `.env` is gitignored — good, secrets never
leave your machine; all production config lives in Render's dashboard.

## 2. Get your AI API key (one minute, you create it yourself)

The AI layer is **provider-agnostic** — it calls any OpenAI-compatible
`/chat/completions` endpoint. You need to create an API key in your own
account (keys are account-bound secrets; nobody can issue one for you):

**Option A — Z.ai GLM (recommended, matches the built-in prompts):**
1. Sign up / log in at **https://z.ai**
2. Open the API console: **https://z.ai/manage-apikey/apikey-list**
3. Click **Create API Key**, copy it (starts with a long random string)
4. You'll use: `AI_BASE_URL=https://api.z.ai/api/paas/v4`, `AI_MODEL=glm-4.6`

**Option B — any other OpenAI-compatible provider** (OpenAI, OpenRouter,
DeepSeek, …):

| Provider | AI_BASE_URL | AI_MODEL example |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api/v1` | `z-ai/glm-4.6` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |

Keep the key private — you'll paste it into Render's environment variables in
step 4, never into the code.

**What the AI powers:** resume → skill extraction, adaptive explain-questions,
code–explanation consistency scoring, code quality analysis, MCQ extraction
from question papers, recruiter role-fit requirements. **Without a key the app
still works** — every AI feature has a built-in heuristic fallback (degraded
quality, never broken). You can check the active provider any time at
`/api/health` → the `ai` field (shows model + endpoint, never the key).

## 3. Deploy via the Blueprint (recommended)

1. Render Dashboard → **New +** → **Blueprint** → pick your repo.
2. Render reads `render.yaml` and shows the services it will create.
3. It will prompt for the `sync: false` variables. Fill:

   | Variable | Service | Value |
   |---|---|---|
   | `AI_API_KEY` | web | your AI key from step 2 |
   | `SKILLPROOF_RECRUITER_EMAIL` | web | e.g. `recruiter@yourcompany.com` |
   | `SKILLPROOF_RECRUITER_PASSWORD` | web | a strong password (quote it if it contains `#`) |
   | `PROCTOR_INGEST_KEY` | web **and** proctor | one long random string — **must be identical on both** |
   | `NEXT_PUBLIC_PROCTOR_URL` | web | *(leave empty for now — fill after first deploy, step 5)* |
   | `PROCTOR_PERSIST_URL` | proctor | *(fill after first deploy, step 5)* |
   | `PROCTOR_CORS_ORIGIN` | proctor | *(fill after first deploy, step 5)* |

4. **Plan note:** the web service blueprint uses `starter` because the free
   plan **cannot mount persistent disks** (your SQLite data would be wiped on
   every deploy). The proctor service can stay on `free`.
5. Apply — Render builds and starts both services.

### Manual alternative (no blueprint)

Create two **Web Services** with:

| Setting | skillproof-web | skillproof-proctor |
|---|---|---|
| Root directory | *(repo root)* | `mini-services/proctor-service` |
| Build command | `npm install && npm run build` | `npm install` |
| Pre-deploy command | `npx prisma db push --skip-generate` | — |
| Start command | `npm run start:node` | `npm start` |
| Health check path | `/api/health` | `/healthz` |
| Disk | 1 GB mounted at `/var/data` | — |

Then add the environment variables from the table in `render.yaml`
(`SESSION_SECRET` → generate a 96-char random hex; `DATABASE_URL` →
`file:/var/data/skillproof.db`; `HOSTNAME=0.0.0.0`; `NODE_ENV=production`;
demo flags `0`).

## 3b. Zero-config deploys (Z.ai space / one-click containers)

The repo is now **self-bootstrapping** — a bare container with only
`npm install && npm run build && npm start` deploys successfully, with no
`.env` and no database:

| Failure that used to kill the deploy | What fixes it now |
|---|---|
| `next build` fetched Google Fonts over the network | Fonts are self-hosted (`src/app/fonts/*.woff2`, committed) via `next/font/local` — builds are fully offline |
| `db/` missing on a fresh clone → "unable to open database file" | `scripts/bootstrap-db.mjs` (runs inside `build`, `start`, `start:node`) creates `db/`, applies the schema with `prisma db push`, and seeds the question bank if it is empty |
| `DATABASE_URL` unset (gitignored `.env`) | `src/lib/db.ts` and the bootstrap script fall back to `<project-root>/db/custom.db` |
| `SESSION_SECRET` unset → hard boot error | `src/lib/server/auth.ts` generates a random secret, persists it to `db/.session-secret` (0600) and logs a warning instead of crashing |
| No recruiter account to log in with | A committed `.env.production` ships the demo credentials (see the file header); real env vars always win over it |

Notes:

- On **Render**, keep following sections 3–5 (explicit `SESSION_SECRET`,
  `DATABASE_URL` on the mounted disk, `HOSTNAME=0.0.0.0`) — explicit env vars
  always take precedence over the fallbacks above.
- The committed demo credentials are public. Rotate
  `SKILLPROOF_RECRUITER_PASSWORD` for any real deployment.
- **Build memory**: a measured `next build` of this repo peaks around
  **2.5 GB RSS** (Turbopack, 53 API routes + Monaco + MDX editor). Build
  containers need roughly 3 GB free RAM or the OOM killer ends the deploy
  before the start stage ever runs.
- The live-proctoring socket.io service is a separate process
  (`mini-services/proctor-service`). Single-container platforms run only the
  web app, so live proctoring degrades there (the assessment flow still works;
  proctor events buffer client-side). Render deploys it as its own service.

## 4. First-run checklist

Open `https://<your-web-service>.onrender.com/api/health` — expect:

```json
{
  "status": "ok",
  "db": "ok",
  "ai": { "configured": true, "model": "glm-4.6", "baseUrl": "https://api.z.ai/api/paas/v4" }
}
```

- `db: "ok"` → the disk + schema are good
- `ai.configured: true` → your AI key is being picked up
- Log in with your `SKILLPROOF_RECRUITER_EMAIL` / `SKILLPROOF_RECRUITER_PASSWORD`
  → the recruiter dashboard opens. The first login also provisions accounts
  and seeds the 95-question bank automatically.
- Create a candidate account from the sign-in screen and run a verification
  end-to-end.

## 5. Wire the live-proctoring loop (2 minutes, after both services exist)

1. Open the proctor service page in Render → copy its URL
   (e.g. `https://skillproof-proctor-abcd.onrender.com`).
2. On the **web** service: set
   `NEXT_PUBLIC_PROCTOR_URL=https://skillproof-proctor-abcd.onrender.com`
   (NEXT_PUBLIC_* is baked in at build time → trigger **Manual Deploy →
   Clear build cache & deploy**).
3. On the **proctor** service, set:
   - `PROCTOR_PERSIST_URL=https://<web-url>/api/proctor/events`
   - `PROCTOR_CORS_ORIGIN=https://<web-url>` (locks socket access to your app)
4. Verify: open the web app as a recruiter → **Live** tab shows the proctor
   connection dot as **live** while a candidate runs an assessment.

## 6. Operations notes

- **Free plan web service:** sleeps after ~15 min idle → first request takes
  ~50 s to wake. The browser proctor client reconnects automatically. For a
  serious deployment use `starter` for both services.
- **Build memory:** `next build` may exceed the free plan's 512 MB — another
  reason to run the web service on `starter` (2 GB).
- **Deploys & data:** `preDeployCommand` runs `prisma db push` (non-destructive;
  it refuses changes that would lose data). SQLite lives on the disk, so
  deploys and restarts keep your data.
- **Scaling:** single instance only — the rate limiter is in-memory and SQLite
  is single-writer by design. Do not enable auto-scaling on the web service.
- **Sessions:** rotating `SESSION_SECRET` signs everyone out (expected).
- **Backups:** download the SQLite file from the disk periodically, or snapshot
  the disk (Render → Disks → Snapshot).

## 7. Local development (unchanged)

```bash
cp .env.example .env    # fill in what you need
bun install
bun run dev             # app on :3000 (proctor service auto: :3003)
bun run verify          # lint + typecheck + tests
```

In the Z.ai sandbox the built-in AI SDK is used without a key; locally set
`AI_API_KEY` to exercise the same production code path.
