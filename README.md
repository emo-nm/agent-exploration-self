# eve-flue-smithers-demo

One repository comparing **Eve** and **Flue** as durable product-agent
frameworks, and demonstrating how **Smithers** can orchestrate either framework
(and how either framework can launch a bounded Smithers workflow).

> **Status: scaffold only.** This commit lays out the monorepo skeleton and
> Vercel wiring. No agent, domain, or UI logic is implemented yet. The full plan
> lives in [`docs/log/2026-07-11-eve-flue-smithers-codex-handoff.md`](./docs/log/2026-07-11-eve-flue-smithers-codex-handoff.md).

## Layout

```text
apps/
  web/        Next.js comparison UI            → Vercel
  eve/        Eve agent application            → Vercel
  flue/       Flue Node service                → persistent host
  smithers/   Smithers Gateway/HTTP control    → Bun container
packages/
  contracts/         shared Zod schemas / API contracts
  domain/            framework-neutral business operations
  effects/           idempotent external-effect service
  persistence/       Drizzle schema/client
  prompts/           shared behavioral requirements
  evals/             common test cases and scoring
  eve-adapter/       web/server client for Eve
  flue-adapter/      web/server client for Flue
  smithers-adapters/ AgentLike wrappers for Eve and Flue
.smithers/    Smithers authoring pack/skills
docs/         architecture, test plan, deployment, findings, handoff
```

## Toolchain

- **pnpm** workspaces + **Turborepo**. Node `>=22.19.0` (Eve tutorial wants
  Node 24; Smithers runs under Bun).
- `pnpm install`, then `pnpm dev` to start all services (once implemented).

## Deployment

The web app deploys to Vercel. See [`docs/deployment.md`](./docs/deployment.md).

## Next steps

Follow the implementation order in the handoff doc section 23. Each app directory is a
placeholder — initialize Eve, Flue, and Smithers with their own current scaffold
tooling rather than hand-reproducing examples (section 7, section 24).
