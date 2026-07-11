# Eve baseline — session notes (2026-07-11)

Phase 2, step 4 of `docs/plan.md`: the research-and-publish demo agent built in
Eve's native, filesystem-first idiom (`eve@0.22.5`, Node 24). All claims below
are **[live]** (ran here) unless tagged **[doc]**. No API keys exist in this
environment, so anything requiring a real model call or real durable session is
recorded as **blocked**, not faked.

## What was built

Framework-specific (`apps/eve/agent/`, ~316 LOC incl. subagent + sandbox):

- `agent.ts` — `defineAgent` (model `anthropic/claude-sonnet-5`,
  `maxSubagentDepth: 1`, `build.externalDependencies` for the DB driver).
- `instructions.ts` — `defineInstructions({ markdown: AGENT_INSTRUCTIONS })`,
  the shared brain imported from `@demo/prompts` (not forked). Replaced the
  scaffold's static `instructions.md`.
- `skills/research-and-publish.ts` — `defineSkill` fed the shared
  `RESEARCH_AND_PUBLISH_SKILL_MD` from `@demo/prompts`.
- `tools/{search_fixture_corpus,create_publication_proposal,get_publication_status,publish_artifact}.ts`
  — thin wrappers: zod input (from `@demo/contracts` shapes) → `@demo/domain` /
  `@demo/effects` with a repo from `@demo/persistence`.
- `subagents/researcher/` — declared subagent (`agent.ts` + `instructions.md` +
  its own `tools/search_fixture_corpus.ts`).
- `lib/repos.ts` — repo factory (in-memory when `DATABASE_URL` unset, Drizzle
  when set) + a `__setReposForTest` seam. `lib/search-tool.ts` — one search-tool
  definition shared by the root and the researcher (subagents don't inherit
  tools).
- `sandbox.ts` — pins the `just-bash` backend (see friction).

Shared layer (framework-neutral, reused by Flue/Mastra later):

- `@demo/persistence` gained `ThreadsRepo` + `ProposalsRepo` (interfaces,
  in-memory doubles, Drizzle impls; +243 LOC). The scaffold only had
  `EffectsRepo`; the demo needs thread session-state and proposal rows.
- `@demo/eve-adapter` (214 LOC) — typed server-side client over `eve/client`:
  `createThread` / `sendMessage` / `streamEvents` / `getThread`, persisting the
  eve `SessionState` cursor into `demo_threads.continuation_state_json` via the
  `ThreadsRepo`, and normalizing eve stream events into `@demo/contracts`
  `AgentEvent` (raw native event kept on every normalized event).

Tests: `apps/eve/test/tools.test.ts` (5 tests) drive the tool wrappers against
the in-memory repo — search determinism, pending-proposal creation, publish
refused before approval, idempotent republish (created=false, one effect row),
and survival across the flaky-publish window (`DEMO_FAIL_PUBLISH_ATTEMPTS=2`).

## Verification status [live]

- `pnpm install` — clean (Mastra's zod3/zod4 + hono peer warnings pre-exist).
- `pnpm -r typecheck` — all packages + all apps pass.
- `pnpm -r test` — 24 tests pass (contracts 8, effects 4, domain 7, **eve 5**).
- `pnpm build` (root turbo) — 5/5 apps build, including `eve build`.
- `eve build` → clean compile (0 errors/warnings); `eve info` confirms
  instructions.ts, skill `research-and-publish`, 4 tools, subagent `researcher`,
  and the generated packaged `skills/research-and-publish/SKILL.md`.
- `eve start --port 3001` → serves; `GET /eve/v1/health` returns
  `{"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}`
  and `GET /eve/v1/info` returns the agent snapshot. Health/info are the
  adapter surface (§11); local port 3001 matches topology.

## API differences vs the handoff

- The handoff's `apps/eve/agent/skills/research-and-publish/SKILL.md` is a
  *static* file. Requirement: skill content must come from `@demo/prompts`
  without forking. A static `.md` can't import, so I authored the skill in
  TypeScript with `defineSkill` (`eve/skills`), which eve **compiles into** the
  packaged `SKILL.md` at build (verified in
  `.eve/compile/workspace-resources/.../SKILL.md`). Same for instructions:
  `defineInstructions` (`eve/instructions`) over the shared constant.
- Eve's durable HTTP API is exactly as documented: `POST /eve/v1/session`,
  `POST /eve/v1/session/:id`, `GET /eve/v1/session/:id/stream` (NDJSON), plus
  public `GET /eve/v1/health` and `GET /eve/v1/info`. `SessionState` is the
  `{ continuationToken, sessionId, streamIndex }` cursor — a resume handle, NOT
  the transcript (matches handoff §11: persist events separately).
- `eve/client` `Client` / `ClientSession.send()` / `.stream()` / `.state` match
  the docs; the adapter is built directly on them.
- Subagent tool isolation is real and stricter than the handoff implies: a
  declared subagent inherits *nothing* from the root (tools, skills, sandbox),
  so the researcher needs its own `tools/`. I share one definition via `lib/`.

## Framework friction (findings)

1. **Sandbox backend blocks `eve start`.** The default backend
   (`microsandbox`) needs an unbundled npm package + VM and fails to prewarm on
   production `eve start` (only `eve dev` auto-installs). Our agent does no
   sandbox work, but every eve agent has one and it prewarms regardless. Fix:
   `agent/sandbox.ts` pinning `justbash()` + adding `just-bash` as a dep. This
   is a real deploy-time gotcha — the stock scaffold doesn't serve under
   `eve start` on a plain host without this.
2. **`eve build` can't resolve transitive native deps.** Tools import the
   shared `@demo/persistence`, whose index eagerly loads the Postgres client
   (`pg`) + `drizzle-orm`. eve compiles authored modules into a cache dir and
   its import resolution couldn't find `pg` (a *transitive* dep under pnpm's
   strict layout). Fix required BOTH `build.externalDependencies: ["pg",
   "drizzle-orm"]` AND adding `pg`/`drizzle-orm` as direct `apps/eve` deps.
   Cleaner long-term: give `@demo/persistence` a sub-entry so the in-memory
   path never pulls the DB driver.
3. Otherwise low friction: filesystem discovery "just worked" — dropping files
   into `tools/`, `skills/`, `subagents/researcher/` registered them with zero
   wiring, and `eve info` is an excellent inspection surface.

## Skill authoring & discovery (criterion 7) [live]

- Skills are load-on-demand via a framework-owned `load_skill` tool
  (progressive disclosure, Agent Skills standard). Two forms: flat markdown, or
  a packaged dir with a `SKILL.md` + siblings. `defineSkill` (TS) is the escape
  hatch when you need to generate content — which is exactly what let us source
  from `@demo/prompts` without forking.
- Discovery is pure filesystem: `agent/skills/*` auto-registered; `eve info`
  lists them. `eve dev` has HMR [doc]. Skills are **scoped per agent** — a
  subagent's skills are invisible to the root and vice-versa; no shared-skill
  mechanism (share executable helpers via `lib/` instead). Clean, but means
  duplicating skill markdown across agents that both need it.

## Auth story (criterion 8) [doc unless noted]

Eve has **two independent** auth systems
(`node_modules/eve/docs/guides/auth-and-route-protection.md`):

- **Route auth (inbound)** on the channel (`agent/channels/eve.ts`) via an
  ordered `auth: AuthFn[]` walk gating the three session routes. Fails closed;
  `GET /eve/v1/health` is always public [live — served without creds].
  Helpers: `vercelOidc()`, `localDev()`, `none()`, `httpBasic()`, `jwtHmac()`,
  `jwtEcdsa()`, `oidc()`. Custom `AuthFn` can fully replace Vercel OIDC — a
  point in favor on lock-in (criterion 5): the scaffold defaults to
  `[vercelOidc(), localDev(), placeholderAuth()]` but the app owns identity.
- **Session identity**: `ctx.session.auth.current` (this turn's caller) vs
  `.initiator` (session creator). Approval policies and tools guard on these.
  **"Can user A resume user B's thread?"** — the continuation token is the
  resume handle; route auth + a custom `AuthFn` returning `principalId` is what
  must scope it. Not verified live (no auth provider / keys); flagged for the
  durability/security matrix (§19).
- **Service-to-service**: `vercelOidc()` accepts same-project tokens with zero
  config (internal subagent/runtime callers); cross-project via
  `subjects: [vercelSubject(...)]`. The `eve/client` `Client` sends bearer /
  basic / `vercelOidc` credentials, resolved per request (works for token
  rotation).
- **Connect/OAuth (outbound)**: tool/connection auth is separate — connections
  to OAuth MCP/OpenAPI servers surface `authorization.required` /
  `authorization.completed` stream events; `@vercel/connect` is scaffolded in.
  Not exercised (the demo uses only local typed tools).
- **Lock-in read**: auth is genuinely pluggable (custom `AuthFn` first-class),
  but `vercelOidc()` + Vercel Sandbox + AI Gateway are the frictionless default
  path — the platform pull is real even though the escape hatches exist.
- **License (criterion 5)**: eve is **Apache-2.0** [live — checked
  `node_modules/eve` LICENSE + package.json]. No source-available/BUSL/SSPL
  obligation. Good for walk-away.

## Blocked pending keys / DATABASE_URL

- **Live model loop** — plan → delegate to `researcher` → search → draft →
  propose → await approval → publish → report needs a model credential
  (`AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY` or `vercel link`). Build/health
  work; the actual turn does not. This is the gate for durability scenarios
  §19.1–8 (kill mid-call, resume, duplicate approval/publish).
- **Drizzle/Postgres path** — `DrizzleThreadsRepo` / `DrizzleProposalsRepo` /
  `DrizzleEffectsRepo` typecheck and the factory selects them when
  `DATABASE_URL` is set, but no Neon DB exists yet, so only the in-memory path
  is exercised [live].
- **Adapter event-field mapping** — `normalizeEvent` maps eve stream events to
  `AgentEvent` using best-effort field access (exact payload field names for
  `actions.requested` / `action.result` / `subagent.*` not confirmed against a
  live stream). Raw event is always preserved as `raw`. Revisit when a keyed
  run produces real events.
- **Eve-native durable approval** — baseline uses the application-owned
  approval flow (poll `get_publication_status`; publish revalidates status,
  handoff §17). Eve's native HITL (`approval: always()` / `ask_question`,
  `input.requested` pause) is a documented alternative to add as an optional
  second path after the portable baseline — not the baseline score.
