# apps/flue

Flue Node service (persistent host) — the research-and-publish baseline
(handoff #8/#12) in Flue's native idiom. Runs on `http://localhost:3002`.

## Layout (Flue discovery-based)

- `src/agents/research-publisher.ts` — the agent (`defineAgent`), instance id =
  application thread id. Shared "brain" imported from `@demo/prompts`.
- `src/subagents/researcher.ts` — researcher subagent profile.
- `src/tools/*` — thin tools: validate with `@demo/contracts`, call
  `@demo/domain`/`@demo/effects` with the repo from `@demo/persistence`.
- `src/skills/research-and-publish/SKILL.md` — generated from `@demo/prompts` by
  `scripts/generate-skill.mjs` (single source of truth; do not hand-edit).
- `src/app.ts` — Hono: `/health`, `/info`, and the application-owned approval
  routes, composed with Flue's `flue()` agent routes.
- `src/db.ts` — file-backed SQLite persistence (`@flue/runtime/node`).

## Run

```bash
fnm use 24
pnpm --filter flue dev        # flue dev --target node --port 3002 (transpiles)
pnpm --filter flue typecheck
pnpm --filter flue test
pnpm --filter flue build      # dist/server.mjs (see notes re: raw-TS deps)
```

Findings, API differences, friction, and blocked items:
[`../../docs/log/2026-07-11-flue-baseline-notes.md`](../../docs/log/2026-07-11-flue-baseline-notes.md).
Original spec: [`../../docs/log/2026-07-11-eve-flue-smithers-codex-handoff.md`](../../docs/log/2026-07-11-eve-flue-smithers-codex-handoff.md).
