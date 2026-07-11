# Deployment

Scaffold notes. Fill in with measured details as services are implemented (see
handoff §6 "Runtime topology" and §22 "Definition of done").

## Topology

| Service        | Local URL               | Deploy target                         |
| -------------- | ----------------------- | ------------------------------------- |
| `apps/web`     | http://localhost:3000   | **Vercel**                            |
| `apps/eve`     | http://localhost:3001   | **Vercel**                            |
| `apps/flue`    | http://localhost:3002   | Persistent Node / container host      |
| `apps/smithers`| http://localhost:7331   | Bun-capable container                 |
| Postgres       | —                       | Shared managed Postgres               |

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

## TODO

- Deploy `apps/eve` to Vercel (separate project) once the Eve baseline exists.
- Provision the Flue host and Smithers Bun container.
- Provision shared Postgres and set `DATABASE_URL`.
