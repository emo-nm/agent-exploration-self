# Findings

> Live results from running things first-hand in this repo. Docs claims are
> marked [doc]; everything else here was observed [live]. Started from
> `docs/findings-template.md` (section 24). This first entry covers **Phase 1:
> scaffolding only** — no demo agent / domain / UI logic yet.

Last updated: **2026-07-11**

## Environment

- Machine: darwin (arm64), pnpm 9.12.0, bun 1.3.14.
- Node via `fnm`: available 20.20.0, 22.20.0 (shell default), 24.18.0.
- `.nvmrc` pins **24**. Root `package.json` `engines.node` is `>=22.19.0`.
  Eve's scaffold pins `engines.node: 24.x`; Flue docs list `>=22.19.0`.
  The shell default (22.20.0) satisfies Flue/Mastra/Smithers but **not** Eve —
  Eve was scaffolded and installed under Node 24.18.0 (`fnm use 24`). No
  hard mismatch: `.nvmrc=24` is the correct repo-wide floor (Eve is the
  strictest). Just remember to `fnm use 24` before Eve/Mastra work.

## Resolved package versions

Exact resolved versions from `pnpm-lock.yaml`.

| Package | Version |
| ------- | ------- |
| eve     | 0.22.5 |
| @vercel/connect (eve dep) | 0.2.2 |
| ai (eve dep) | 7.0.22 |
| zod (eve/mastra dep) | 4.4.3 |
| @flue/runtime | 1.0.0-beta.9 |
| @flue/cli | 1.0.0-beta.9 |
| mastra (CLI) | 1.18.2 |
| @mastra/core | 1.50.1 |
| @mastra/memory | 1.22.2 |
| smithers-orchestrator | 0.27.0 |
| @smithers-orchestrator/cli | 0.27.0 |
| next (apps/web) | 15.5.20 |
| turbo (root) | ^2.5.0 |

All four framework packages resolved on the public npm registry and match the
handoff's descriptions (Eve = "Filesystem-first framework for durable backend
AI agents", `smithers-orchestrator` = "Public Smithers facade…"). No private
registry / auth was required.

## Per-framework

### Eve — `apps/eve/`

- **Command used:** `npx eve@latest init --yes .` (run in a temp dir under Node
  24, then contents moved into `apps/eve/`). `eve init --help` confirmed the CLI
  is non-interactive: only `--channel-web-nextjs` and `-y/--yes` flags exist
  (and `--yes` is a documented no-op accepted "for compatibility"). Matches
  handoff section 7 (`npx eve@latest init <directory>`).
- **Version landed:** `eve@0.22.5`.
- **Generated layout (preserved):** `agent/agent.ts`, `agent/instructions.md`,
  `agent/channels/eve.ts`, plus `package.json`, `tsconfig.json`, `AGENTS.md`,
  `CLAUDE.md`, `.gitignore`, `.vercelignore`. This is the filesystem-first
  `agent/` layout the handoff section 5/section 11 anticipated — kept as-is inside `apps/eve`.
- **Deviations / friction:**
  - Scaffold assumes it owns the project root: it emitted its own `.git`,
    `package-lock.json` (npm, not pnpm), and `node_modules`. Removed all three
    before moving into the workspace; deps are managed by root pnpm instead.
  - It generated its own `CLAUDE.md` (1 line) and `AGENTS.md` inside `apps/eve`
    — left in place (scaffold default), scoped to the sub-app.
  - Package `name` was `eve-scaffold`; renamed to `eve` + added `private: true`
    to match the workspace's existing placeholder.
  - Pins bleeding-edge toolchain by default: `typescript@7.0.2`,
    `@types/node@24.x`, `ai@^7`, `engines.node: 24.x`. The TS 7 pin causes peer
    warnings elsewhere (see Mastra).
- **Install:** passes as part of root `pnpm install`.

### Flue — `apps/flue/`

- **Commands used (exactly per handoff section 7 / quickstart):** inside `apps/flue`:
  `pnpm add @flue/runtime`, `pnpm add -D @flue/cli`, `pnpm exec flue init
  --target node`. `flue init` is non-interactive by design (`--target` is a
  required flag; `--force` to overwrite). Run under Node 22.20.0.
- **Versions landed:** `@flue/runtime@1.0.0-beta.9`, `@flue/cli@1.0.0-beta.9`
  (still **beta**).
- **Generated layout:** `flue init` is minimal — it wrote only `flue.config.ts`.
  It did **not** create agents/tools/src dirs or touch `package.json` scripts
  (still the placeholder `echo` scripts). Its "next step" output points to
  fetching `https://flueframework.com/start.md` to author an agent — i.e. Flue
  expects the agent code to be hand-authored (or AI-authored via its blueprint
  `flue add` command), not scaffolded. Consistent with the handoff's "more
  explicit" characterization.
- **Friction:**
  - Native-addon build noise during install: `node-liblzma` compiles via
    node-gyp and emits arch/version linker warnings against Homebrew `xz`
    (`ignoring file … found architecture 'arm64', required architecture
    'x86_64'`). Install still succeeded; no action taken.
  - Pulls a large dep tree (~430+ pkgs including `workerd`, `@google/genai`,
    esbuild) even for the Node target.
- **Install:** passes.

### Mastra — `apps/mastra/` (NEW app)

- **Command used:** `npx create-mastra@latest mastra-scaffold --default
  --no-observe` (run in temp dir under Node 24, then moved into `apps/mastra/`).
  `--default` = non-interactive quick start (src layout, OpenAI provider,
  example code). Matches current Mastra guidance.
- **Versions landed:** CLI `mastra@1.18.2`; deps `@mastra/core@1.50.1`,
  `@mastra/memory@1.22.2`, plus `@mastra/{duckdb,evals,libsql,loggers,
  observability}`, `zod@4.4.3`. License: Apache-2.0 (per STATE criterion 5).
- **Generated layout:** the stock weather example —
  `src/mastra/index.ts`, `src/mastra/agents/weather-agent.ts`,
  `src/mastra/tools/weather-tool.ts`, `src/mastra/workflows/weather-workflow.ts`,
  `src/mastra/scorers/weather-scorer.ts`, plus `.env.example`, `tsconfig.json`.
  This is the richest stock scaffold of the four (agent + tool + workflow +
  scorer out of the box).
- **Deviations / friction:**
  - Like Eve, assumes it owns the dir: emitted `package-lock.json` (npm) +
    `node_modules`; removed both. Package `name` was `mastra-scaffold`, `license:
    ISC`, `main: index.js` — renamed to `mastra` + `private: true`.
  - Pins `typescript@^7.0.2` and `@types/node@^26.1.1` — again bleeding edge.
  - **Peer-dep warnings on root install** (non-fatal, install still succeeds):
    `@ai-sdk/*` (via `@mastra/core`) wants `zod@^3.23.8` but resolves `zod@4.4.3`;
    `@hono/node-ws` wants `@hono/node-server@^1.19.11` but got `2.0.8`;
    `typescript-paths` wants TS `^4.7.2 || ^5 || ^6` but got `7.0.2`. Flagged as
    an unresolved risk to revisit when building the Mastra agent.
  - EBADENGINE warning from `create-mastra` under Node 22.20.0 (`posthog-node`
    wants `>=22.22.0`); avoided by scaffolding under Node 24.

### Smithers — `.smithers/` (authoring pack)

- **Command used:** `bunx smithers-orchestrator init --yes --no-skill` from repo
  root. `--yes`/`--non-interactive` is a first-class flag (safe for agents/CI).
  Matches handoff section 7 (`bunx smithers-orchestrator init`). Did NOT select
  Codex-only; installed the full default pack (agents for claude-code, codex,
  opencode, antigravity).
- **Version landed:** `smithers-orchestrator@0.27.0`,
  `@smithers-orchestrator/cli@0.27.0`.
- **Result:** wrote ~198 files under `.smithers/` — a large stock workflow pack
  (`workflows/`, `prompts/`, `components/`, `ui/`, `agents/`, `smithers.config.ts`,
  `gateway.ts`). It ran its own `bun install` inside `.smithers/` (own
  `bun.lock`, 379 pkgs). `.smithers/package.json` is name `smithers-workflows`,
  Bun/React-based. Correctly **outside** the pnpm workspace globs
  (`apps/*`, `packages/*`), so root pnpm ignores it — matches handoff section 6
  (Smithers runs under Bun).
- **Deviations / friction:**
  - **`--no-skill` did not fully suppress skill install:** it still printed
    "Smithers refreshed the `smithers` agent skill (Claude Code, Pi)" and a
    `smithers` skill now exists at the **global** `~/.claude/skills/smithers`.
    It did NOT modify this repo's `CLAUDE.md`/`AGENTS.md` and wrote nothing to a
    repo-local `.claude/`, so the repo stays project-scoped, but the flag's
    behavior deviates from its `--help` description (a global-scope side effect).
  - It appended Smithers run-store ignore lines to the **root** `.gitignore`
    (`smithers.db`, `.smithers/*.sqlite`, etc.) — expected/benign.
  - `bun install` reported "Blocked 2 postinstalls" (untrusted) and a peer
    warning `typescript@7.0.2`. Not investigated (scaffold phase).
  - Note: `apps/smithers/` (the Gateway/HTTP control-plane app, handoff section 5)
    still holds only its placeholder — the control-plane app is later work; this
    task only initialized the `.smithers/` authoring pack per item 5.

## Root wiring

- `pnpm-workspace.yaml` already globs `apps/*` + `packages/*`; all of `eve`,
  `flue`, `mastra`, `web`, `smithers` (placeholder) and the `@demo/*` packages
  are recognized by `pnpm ls -r`.
- `pnpm install` from repo root **succeeds** (exit 0) under Node 24.18.0. Only
  warnings: 3 deprecated subdeps and the Mastra peer-dep set above.

## Unresolved / to revisit

- Mastra `zod@3` vs `zod@4` peer mismatch — verify Mastra runtime actually works
  with zod 4 when the agent is built, or pin zod down for `apps/mastra`.
- TypeScript `7.0.2` pinned by Eve + Mastra scaffolds vs root `^5.6.0` — confirm
  `turbo run typecheck` behaves across the mixed TS majors.
- Smithers global-skill side effect from `--no-skill` — cosmetic here, but note
  it mutates `~/.claude` outside the repo.

---

# Phase 2 — shared framework-neutral layer (2026-07-11)

Built with no Eve/Flue/Mastra/Smithers imports anywhere (verified by grep).
~1.1k LOC of TS across packages. `pnpm -r build` and `pnpm test` pass at root
(19 tests: contracts 8, effects 4, domain 7 — no live DB, no network).

## What was built

- **@demo/contracts** — zod v4 schemas: research-request/plan/result,
  publication-proposal/receipt, normalized agent-event union with `raw`
  passthrough. zod 4 API worked without friction (no v3 patterns needed).
- **@demo/persistence** — Drizzle schema for demo_threads (backend enum incl.
  `mastra`), publication_proposals, publication_effects (UNIQUE idempotency
  key), comparison_runs. node-postgres client + drizzle-kit config + initial
  migration in `drizzle/`. Small repo interface (`repo.ts`) with a
  `memory-repo.ts` in-memory double so effects/domain tests run with no DB.
  TODO: neon-http client for Vercel functions.
- **@demo/effects** — `publishArtifact` with injected repo deps: attempt
  counting, `DEMO_FAIL_PUBLISH_ATTEMPTS` failure injection, insert-or-retrieve
  by idempotency key (duplicate call → identical receipt, `created:false`),
  guarded `DEMO_CRASH_AFTER_EFFECT` process-exit hook.
- **@demo/domain** — create-research-plan, search-fixture-corpus
  (deterministic embedded corpus + keyword scoring), create-draft,
  create-publication-proposal, approve-proposal, publish-artifact
  orchestration. Pure functions over contracts types.
- **@demo/prompts** — canonical instructions + shared research-and-publish
  SKILL.md content, so every framework gets the identical brain.
- **@demo/evals** — canonical test prompts + scoring stub (harness later).

## Friction / deviations

- `apps/mastra` stock scaffold ships `"test": "exit 1"`, which fails
  `turbo run test` at root. Removed the stub script (smallest deviation from
  stock; noted here per the fighting-the-framework rule).
- Tests verified idempotency/failure-injection against the in-memory repo
  only; the Drizzle repo path is untested until a real `DATABASE_URL`
  (Neon) exists.

## Next phase needs to know

- Frameworks wrap domain functions thinly: validate with contracts schema →
  call domain fn with repo from persistence. Effects deps are injected.
- Approval is application-owned: proposals table status flip, not
  framework-native approval, for the baseline.

---

# Phase 3 — direct baselines built in all three frameworks (2026-07-11)

Same research-and-publish agent (shared brain from @demo/prompts, thin tools
over @demo/domain//@demo/effects, app-owned approval) implemented in Eve,
Flue, and Mastra native idioms, plus typed adapter packages for the web app.
Built in parallel isolated worktrees; persistence APIs unified on merge
(DemoRepo + createDemoRepo(); setProposalStatus canonical). All: root
typecheck 15/15, tests 8/8 tasks (eve 5, flue 6, mastra 6 new), build 5/5.
Drizzle path verified [live] against local Postgres 17 (brew). Model loop
NOT run anywhere — no API key yet — durability matrix pending.

Per-framework details + criteria notes (skills, auth, license):
- docs/log/2026-07-11-eve-baseline-notes.md (sandbox pin + build friction)
- docs/log/2026-07-11-flue-baseline-notes.md (valibot/zod tax, build-output
  module issue, SQLite dev-reload loop)
- docs/log/2026-07-11-mastra-baseline-notes.md (zod4 ok, no skill concept,
  TS pin)
