# Mastra baseline — implementation notes (2026-07-11)

Phase 2 step 5b. Research-and-publish demo agent in `apps/mastra`, native Mastra
idiom (`mastra@1.18.2` / `@mastra/core@1.50.1`). Same shared brain / tools /
domain / effects / repo as the (specced) Eve and Flue baselines; only the
framework differs. Tier: **[live]** for build/typecheck/tests/server-to-health;
model-driven end-to-end run is **blocked** (no API keys — see Blocked).

## Status

- `pnpm typecheck` — 15/15 pass (incl. `mastra`, `@demo/mastra-adapter`).
- `pnpm test` — all pass; new: 6 tool tests + 5 adapter tests (in-memory repo, no DB/keys).
- `pnpm build` — 5/5 pass; `mastra build` emits `.mastra/output`.
- Server: `node .mastra/output/index.mjs` binds **:3003**; `GET /health` → `{"success":true}` (built-in), `GET /demo/health` → `{status,backend,agents[]}` (custom).

## What was built

- `apps/mastra/src/mastra/tools/research-tools.ts` — 4 thin tools + exported
  `*Impl` functions (contracts-validate → `@demo/domain`/`@demo/effects` with a
  repo): `search_fixture_corpus`, `create_publication_proposal`,
  `get_publication_status`, `publish_artifact`.
- `agents/researcher-agent.ts` — the subagent; `agents/research-publisher-agent.ts`
  — the main agent (shared instructions, tools, `agents:{researcher}`, `Memory`).
- `skills/research-and-publish.ts` — SKILL.md equivalent (see criterion 7).
- `lib/repo.ts` — `createDemoRepo()` singleton (in-memory / Drizzle switch).
- `index.ts` — registers the two new agents alongside the **retained** stock
  weather agent/workflow/scorers; adds `server.port=3003` + custom health route.
- `packages/mastra-adapter/` (NEW) — typed server client mirroring
  eve/flue-adapter shape: `MastraAdapter` (`health`/`createThread`/`sendMessage`/
  `streamEvents`/`getThread`) + pure `normalizeMastraChunk` → `@demo/contracts`
  `AgentEvent` with `raw` passthrough. Fetch-based (no `@mastra/client-js`
  runtime dep, same posture as the other adapters).
- `packages/persistence` — extended the repo surface (was effects-only) with
  `ProposalsRepo`, `ThreadsRepo`, combined `DemoRepo`, `InMemoryDemoRepo`,
  `DrizzleDemoRepo`, and `createDemoRepo()`. Reused by any framework app.

## zod resolution (the KNOWN ISSUE)

Left at repo default **zod@4.4.3** — no pin needed. `@mastra/core@1.50.1` and
`@mastra/memory` resolved against zod 4.4.3 and build/run fine. The only fallout
is a peer **warning** (not error) from transitive AI-SDK deps
(`@ai-sdk/ui-utils`, `@ai-sdk/provider-utils`) that still declare
`peer zod@^3.23.8`. Contracts (zod v4) schemas pass through cleanly: reused
`ResearchRequestSchema`/`PublicationProposalSchema` for validation inside tools,
and zod-v4 `z.object(...)` `inputSchema`s on `createTool` typecheck and bundle
without complaint. Verdict: **Mastra 1.x is zod-4-compatible; the zod-3 peer
warning is cosmetic.**

## TypeScript pin (unexpected friction — build blocker, resolved)

The stock `create-mastra` scaffold pinned `typescript@^7.0.2` (a pre-release) and
`@types/node@^26.1.1`. The weather-only scaffold built fine, but once the app
imported workspace TS packages (`@demo/*`), `mastra build` failed in the deployer
with `Failed to analyze Mastra application: Cannot read properties of undefined
(reading 'readFile')`. Cause: `@mastra/deployer` resolves workspace TS deps via
`typescript-paths` (peer `typescript ^4.7.2 || ^5 || ^6`), which breaks on TS 7.
**Fix:** pinned `typescript@^5.9.3` in `apps/mastra` only (matches root). Recorded
as scaffold-vs-toolchain friction, not worked around silently.

## Subagent equivalent (criterion — delegation)

Mastra has a **first-class native subagent**: an `Agent` referenced from a parent
agent's `agents` field. Mastra auto-generates a delegation tool per entry, so the
parent hands off one focused subtask with no hand-rolled agent-as-tool wrapper.
This is the closest analogue to Eve's `subagents/` and Flue's `session.task(...)`,
and is arguably cleaner (no manual tool plumbing). Implemented as `researcherAgent`
in `research-publisher-agent`'s `agents:{researcher}`.

## Skill authoring & discovery (criterion 7 — a finding)

**Confirmed: Mastra has no first-class SKILL.md concept** (verified against
`@mastra/core@1.50.1` types — no `skills` field on `AgentConfig`, no SKILL.md
discovery, frontmatter, or hot-reload). Its authoring primitives are `Agent`
`instructions` (string), `tools`, sub-`agents`, and `workflows`. Nearest
equivalent: a plain instructions string. We fed the shared `AGENT_INSTRUCTIONS`
+ `RESEARCH_AND_PUBLISH_SKILL_MD` body from `@demo/prompts` into the agent's
`instructions` (`skills/research-and-publish.ts`). **Delta vs Eve/Flue:** no
discoverable/composable skill unit, no frontmatter metadata, no per-skill
hot-reload — a skill is just prompt text you concatenate. This absence is the
criterion-7 finding.

## Approval: application-owned vs Mastra-native (criterion 2)

Baseline uses the **application-owned** flow (handoff §17): agent creates a
`pending` proposal in the shared `publication_proposals` table, polls
`get_publication_status`, and only calls `publish_artifact` once an out-of-band
actor flips the row to `approved`; publish revalidates status and is idempotent
by key. This holds product policy constant across frameworks.

**Where Mastra-native would differ:** Mastra supports **tool-level
suspend/resume** — a tool declares `suspendSchema`/`resumeSchema` (plus
`RequireToolApproval`/`needsApproval` on the agent), the run **suspends** and
Mastra **persists a workflow snapshot** until `resume(runId, resumeData)` is
called. That is *framework-owned* durability: the pending state lives in Mastra
storage, not our proposals table, and resumption is a Mastra API call rather than
a status poll. Intentionally not used in the baseline (keeps parity with
Eve/Flue); noted as the native alternative to demo separately later. The adapter
normalizer already maps `*-suspended`/`*-approval` chunks to `approval-pending`.

## Memory / thread mapping (criterion 1)

Agents use `@mastra/memory` `Memory`, backed by the `Mastra` instance storage
(scaffold: LibSQL default + DuckDB observability domain). App thread id → Mastra
memory `thread`/`resource` ids are mapped into `demo_threads` via the repo
(`upsertThread`, `externalSessionId` ↔ Mastra threadId); the adapter's
`createThread` returns the handle to persist.

## [doc]-tier notes

- **License (criterion 5):** `@mastra/core@1.50.1` `package.json` license =
  **Apache-2.0** [live-ish: read from installed manifest]. No source-available
  obligation. Matches STATE.
- **Evals/observability (criterion 4):** ships **scorers** (`@mastra/evals`,
  `scorers` field on agent + `Mastra`) and a full `Observability` pipeline
  (`MastraStorageExporter`, `MastraPlatformExporter`, `SensitiveDataFilter`) in
  the stock scaffold — richest of the three out of the box [doc]. Not exercised
  live (needs a model run).
- **Auth (criterion 8):** thin / BYO as suspected. `ServerConfig` exposes
  `requiresAuth`, `MastraAuthConfig`/`defineAuth`, RBAC (`requiresPermission`)
  and FGA hooks, but no built-in end-user identity or OAuth-connection story —
  you wire your own. Adapter carries an optional bearer `serviceToken`. [doc]

## LOC split (hand-written, excl. retained weather scaffold)

| Area | Lines |
|---|---|
| `apps/mastra` agent+tools+skill+lib | ~274 |
| `apps/mastra` index.ts delta | +24 |
| `apps/mastra` tool tests | 77 |
| `packages/mastra-adapter` (src+test) | ~267 |
| `packages/persistence` additions | ~285 |

Framework-specific glue is thin: the tools are wrappers, the agent is
declarative config, and the subagent is one field. Most net-new lines are the
shared repo extension (reused by Eve/Flue) and the adapter.

## Blocked (honest)

- **End-to-end model run** — no `OPENAI_API_KEY`/gateway here, so the agent's
  actual plan→delegate→search→draft→propose→approve→publish loop is unverified
  live. Tool `*Impl`s, the approval gate, and idempotent publish ARE verified via
  unit tests against the in-memory repo; the server is verified to health only.
- **Drizzle/Postgres path** — `DrizzleDemoRepo` typechecks but is untested until
  a Neon `DATABASE_URL` exists (same gate as the rest of the repo).
- **Native suspend/resume approval demo** — deferred (baseline uses app-owned).
- **Adapter live streaming** — `streamEvents` shape is written against the Mastra
  server API but only the normalizer + health are unit-tested; live SSE parsing
  needs a running agent (keys).
