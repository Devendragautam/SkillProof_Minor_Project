# Setting up SkillProof in VS Code

A from-zero walkthrough: toolchain, workspace config, database, both services, and verification. Budget about 15 minutes. The repo already ships `.vscode/` and `.env.example`, so most of this is copy-paste.

## 0. What you need

| Tool | Version | Check with | Why |
|---|---|---|---|
| Node.js | >= 20.9.0 | `node -v` | Runs Next.js and the VS Code debugger (`engines` in package.json) |
| Bun | >= 1.2 | `bun -v` | Runs the seed scripts and the test suite (`prisma seed` is wired to bun) |
| Git | any recent | `git --version` | Clone and history |
| VS Code | any recent | — | Editor |
| Free ports | 3000 and 3003 | — | Web app and live-proctoring service |

## 1. Install the toolchain

macOS (Homebrew):

```bash
brew install node git oven-sh/bun/bun/bun
```

Windows (winget; run in PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS Git.Git OvenSh.Bun
```

Linux (nvm + official bun installer):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
curl -fsSL https://bun.sh/install | bash
```

Windows tip: after installing Git for Windows, set VS Code's default terminal profile to **Git Bash** (`Ctrl+Shift+P` > Terminal: Select Default Profile). Package scripts use POSIX syntax (`| tee`, `NODE_ENV=production`), which cmd.exe cannot run.

## 2. Get the code and open it

```bash
git clone <your-repo-url> skillproof
cd skillproof
code .
```

VS Code will ask "Do you trust the authors of the files in this folder?" — Yes.

## 3. Install the recommended extensions

The repo ships `.vscode/extensions.json`, so VS Code prompts on first open ("This workspace has extension recommendations") — click **Install**. Equivalently, install them by ID:

| Extension | ID | What it gives you |
|---|---|---|
| ESLint | `dbaeumer.vscode-eslint` | Inline lint errors, autofix on save (wired in workspace settings) |
| Tailwind CSS IntelliSense | `bradlc.vscode-tailwindcss` | Class autocomplete, color previews, variant guessing (Tailwind v4) |
| Prisma | `Prisma.prisma` | Schema syntax, formatting, jump-to-model |
| Error Lens | `usernamehw.errorlens` | TypeScript errors shown on the line they occur |
| GitLens | `eamodio.gitlens` | Inline blame and history |

## 4. Workspace config shipped in `.vscode/`

You do not need to create these; they are committed:

- `settings.json` — workspace TypeScript version (`node_modules/typescript/lib`), ESLint autofix on save, `*.css` mapped to Tailwind IntelliSense, and search/watcher excludes for the noisy paths (`public/monaco-vs/` is the vendored editor bundle, plus `.next/`, `node_modules/`, `db/`).
- `launch.json` — three debug configs (see section 11).
- `tasks.json` — Terminal > Run Task: `dev`, `proctor service`, `lint`, `typecheck`, `test`, `db push + seed`.

## 5. Install dependencies

```bash
bun install
```

`npm install` also works; either way the `postinstall` hook runs `prisma generate` so the typed `@prisma/client` exists before you compile anything. `bun.lock` is the authoritative lockfile — don't mix lockfiles.

## 6. Create the environment file

```bash
cp .env.example .env
```

Then edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | SQLite URL. Use an absolute path locally: `file:/home/you/skillproof/db/custom.db`. Relative paths resolve against `prisma/schema.prisma` (so `file:../db/custom.db`). Quote nothing here. |
| `SKILLPROOF_RECRUITER_NAME` | yes | Display name of the recruiter account |
| `SKILLPROOF_RECRUITER_EMAIL` | yes | Login email. The recruiter is provisioned from env — there is no self-registration. |
| `SKILLPROOF_RECRUITER_PASSWORD` | yes | Quote it if it contains `#` — unquoted `#` starts a comment and the seed stores the wrong hash. |
| `DEMO_MODE` | no | Set to `1` only when running the demo seed |
| `SKILLPROOF_DEMO_CANDIDATE_PASSWORD` | no | Password for the demo candidate |
| `NEXT_PUBLIC_PROCTOR_URL` | no | `http://localhost:3003` for local runs. `NEXT_PUBLIC_` variables are read at build/dev-server start — restart the dev server after changing them. |

## 7. Create the database

`db/` is gitignored, so a fresh clone does not have it — and Prisma cannot create a SQLite file inside a missing directory:

```bash
mkdir db
bun run db:generate
bun run db:push
bun run db:seed
```

`db:seed` provisions the recruiter from your env values and is safe to re-run (it rotates the stored hash only when the configured password differs). Optional demo candidate:

```bash
DEMO_MODE=1 bun run db:seed:demo
```

## 8. Run the app

Open two terminals (Terminal > Split Terminal), or use the two background tasks from `tasks.json`:

Terminal 1 — web app:

```bash
bun run dev        # http://localhost:3000
```

Terminal 2 — live-proctoring service (only needed for the recruiter dashboard's Live tab):

```bash
cd mini-services/proctor-service
bun install
bun run dev        # port 3003; health probe at http://localhost:3003/healthz
```

Then add the proctor URL to `.env` (see section 6) and restart terminal 1 so the `NEXT_PUBLIC_` variable is picked up. Without it, the Live tab reports the proctor as offline; everything else works.

## 9. Verify the setup

| Check | Expected |
|---|---|
| `curl http://localhost:3000/api/health` | `{"status":"ok",...}` |
| `curl http://localhost:3000/api/stats` | `{"questions":97,"skills":12,...}` |
| Open `http://localhost:3000` | Landing page renders in cream/sage theme |
| Log in (Recruiter) with `SKILLPROOF_RECRUITER_EMAIL` / `SKILLPROOF_RECRUITER_PASSWORD` | Dashboard opens with Question Bank / Candidates / Live / Insights tabs |
| Live tab | Streams events once a candidate assessment is running and the proctor service is up |

Candidate side: register an account, upload the sample resume offered in the first step, and the assessment runner starts from the skills it claims.

## 10. Daily workflow

| Command | Purpose |
|---|---|
| `bun run dev` | Dev server on port 3000 |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript, no emit |
| `bun run test` | Test suite (`tests/`) via bun test |
| `bun run verify` | lint + typecheck + test |
| `bun run db:push` | Push `prisma/schema.prisma` to SQLite (accepts data loss) |
| `bun run db:seed` | Re-provision recruiter/demo accounts from env |
| `bun run build` + `bun run start` | Production build and serve (see DEPLOY.md for Render) |

## 11. Debugging in VS Code

Run and Debug (`Ctrl+Shift+D`) offers three configs from `launch.json`:

- **Next.js: debug server-side** — launches `next dev` under the Node debugger; breakpoints in API route handlers (`src/app/api/**`) and server libraries (`src/lib/server/**`) bind normally. Cross-platform, unaffected by the `tee` pipe in the dev script.
- **Next.js: debug client-side** — opens Chrome with the DevTools protocol attached; breakpoints in client components bind in VS Code. Start the dev server first.
- **Next.js: debug full stack** — runs `npm run dev` in the integrated terminal and auto-attaches Chrome when the server reports ready.

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| Prisma error "Unable to open the database file" | The `db/` directory does not exist — `mkdir db`, then `bun run db:push` again |
| `@prisma/client did not initialize yet` | `bun run db:generate` (or reinstall, which triggers `postinstall`) |
| Port 3000 or 3003 already in use | Kill the stale process (`lsof -i :3000` / `netstat -ano | findstr :3000`) or pass `-p 3001` to dev |
| Live tab shows proctor offline | Proctor service not started, or `NEXT_PUBLIC_PROCTOR_URL` missing/wrong — set it and restart the web dev server |
| Recruiter login fails after changing env credentials | `bun run db:seed` — the hash is only rotated when the seed runs |
| Password containing `#` misbehaves | Wrap the value in double quotes in `.env` |
| Windows: `'tee' is not recognized` or `'NODE_ENV' is not recognized` | Run scripts from Git Bash or WSL, not cmd/PowerShell |
| Editor (Monaco) fails to load | `public/monaco-vs/` is the self-hosted editor runtime — it must not be deleted or emptied |

## 13. Project map

```
src/app/                 App Router pages + /api route handlers
src/components/skillproof/  Feature UI (landing, runner, recruiter dashboard, certificates)
src/components/ui/       shadcn/ui primitives
src/lib/                 client store, question bank, scoring, proctor client
src/lib/server/          auth, assessment engine, executors, PDF generators
prisma/schema.prisma     Users, Assessments, Questions, TimerPolicy, Certificates, PipelineEvents
tests/                   bun test suite (auth, authz, engine, leakage, regressions)
scripts/                 seed, demo seed, prod preflight
mini-services/proctor-service/  socket.io live-proctoring service (port 3003)
public/monaco-vs/        self-hosted Monaco editor runtime (no CDN)
```
