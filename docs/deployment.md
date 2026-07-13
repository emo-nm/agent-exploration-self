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

**Scope decision (James, 07-13): nothing gets hosted outside Vercel for this
eval — no time.** So web + Eve deploy to Vercel (project `native-money/eve`,
rootDirectory=apps/eve, framework auto-detected `eve`); Flue, Mastra, and
Smithers stay local-only, and the memo carries "Flue hosted behavior
untested" as an accepted risk rather than a to-do.

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

## Eve -> Vercel runbook (READY — build verified 07-13; needs the account)

The deciding test from decision-memo.md. `pnpm --filter eve build` passes
clean (nitro `.output/`, Vercel-native, bundles @vercel/oidc). Steps, all
mechanical once logged into Vercel:

1. `cd apps/eve && vercel link` (new project, root = apps/eve).
2. Project env vars: `DATABASE_URL` (Neon — provision via Vercel
   Marketplace), `OPENROUTER_API_KEY`, `DEMO_MODEL_ID`. Migrate:
   `DATABASE_URL=... pnpm --filter @demo/persistence exec drizzle-kit migrate`.
3. Confirm no local sandbox pin ships (apps/eve/agent/sandbox.ts — prod
   must resolve to Vercel Sandbox microVM).
4. `vercel deploy --prod`, then point the harness at it:
   `EVE_BASE_URL=https://<deployment> pnpm eval:durability --backend eve`
   (kill scenarios become redeploy-mid-turn: `vercel redeploy` during a
   turn instead of SIGKILL).
5. What it decides (memo's open questions): does the hosted queue
   dead-letter interrupted turns (vs the local replay storm); is
   observability/auth/sandbox genuinely pre-wired with good UX; what the
   platform dashboard actually shows per run.

## TODO (rest of phase 4)

- Deploy `apps/eve` to Vercel per the runbook above; verify sandbox
  resolves to Vercel Sandbox microVM (no lingering local backend pin).
- Provision the Flue host and Smithers Bun container.
- Neon Postgres via Vercel Marketplace; swap `DATABASE_URL`; re-run
  migrations; keep local brew Postgres for dev.
- Mastra deploy target decision (plain Node host vs Mastra Cloud).
