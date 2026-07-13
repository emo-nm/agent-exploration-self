# Deployment (living spec)

Promoted from the historical handoff (sections 6, 25) + measured local setup.
Fill in measured deploy details as phase 4 lands.

## Topology

| Service        | Local URL               | Deploy target                         |
| -------------- | ----------------------- | ------------------------------------- |
| `apps/web`     | http://localhost:3000   | **Vercel**                            |
| `apps/eve`     | http://localhost:3001   | **Vercel**                            |
| `apps/flue`    | http://localhost:3002   | Persistent Node / container host      |
| `apps/mastra`  | http://localhost:3003   | Node host / Mastra Cloud (evaluate)   |
| `apps/smithers`| http://localhost:7331   | Bun-capable container                 |
| Postgres       | localhost:5432 (brew)   | Neon via Vercel Marketplace           |

Do not force Flue or Smithers into a Vercel runtime just to say everything is on
Vercel. The web app may proxy all runtimes behind one UI.

## Vercel (apps/web)

This repo is a pnpm + Turborepo monorepo. Two supported ways to deploy `apps/web`:

**Option A — root `vercel.json` (checked in).** The repo root `vercel.json`
already sets:

- `framework: nextjs`
- `installCommand: pnpm install --frozen-lockfile`
- `buildCommand: turbo run build --filter=web`
- `outputDirectory: apps/web/.next`

Import the repo into Vercel with the **root** directory as the project root and
it will use this config.

**Option B — set Root Directory to `apps/web`.** In Vercel project settings,
set *Root Directory* = `apps/web`. Vercel auto-detects Next.js and the pnpm
workspace, and you can delete the root `vercel.json` build overrides. Use this if
you prefer Vercel's zero-config monorepo detection.

Pick one; do not mix. Option A is the default checked in here.

### Environment variables

Copy `.env.example` and set the relevant values in the Vercel project. At
minimum the web app needs `NEXT_PUBLIC_APP_URL` and the `*_BASE_URL` /
`*_SERVICE_TOKEN` pairs for whichever runtimes it proxies.

## Local development (working today, [live])

- Node 24 (`.nvmrc`; `fnm use 24`). `pnpm install` from root.
- Postgres: brew `postgresql@17` service, db `agent_eval`, migrated via
  drizzle-kit (`packages/persistence`). launchd keeps it up; `pg_isready`
  to check. `.env`: `DATABASE_URL=postgresql://localhost:5432/agent_eval`.
- Model: OpenRouter (`OPENROUTER_API_KEY`, `DEMO_MODEL_ID` in `.env`) — one
  provider for all three frameworks (comparison fairness). Prompt caching
  via `@demo/model` wrapper (Eve/Mastra) and natively (Flue);
  `pnpm check:caching` verifies (costs money, not in default tests).
- Eve local: use `eve dev` (auto-installs sandbox backend), NOT `eve start`
  (prod serve; the justbash pin that worked around this is being removed —
  see log/2026-07-12-sandbox-research.md).
- Durability matrix: `pnpm eval:durability --backend eve|flue|mastra`
  (results in `.eval-results/`, gitignored).

## TODO (phase 4)

- Deploy `apps/eve` to Vercel (separate project); verify sandbox resolves
  to Vercel Sandbox microVM (no lingering local backend pin).
- Provision the Flue host and Smithers Bun container.
- Neon Postgres via Vercel Marketplace; swap `DATABASE_URL`; re-run
  migrations; keep local brew Postgres for dev.
- Mastra deploy target decision (plain Node host vs Mastra Cloud).
