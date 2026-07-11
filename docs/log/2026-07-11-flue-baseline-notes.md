# Flue baseline — session notes (2026-07-11)

Phase 2 step 5: the research-and-publish demo agent (handoff §8) implemented in
`apps/flue` using Flue's **native idiom**, plus the web/server client in
`packages/flue-adapter`. Versions: `@flue/runtime` + `@flue/cli` + `@flue/sdk`
`1.0.0-beta.9`, Node 24, pnpm. No API keys present → model turns are not run
live; everything below `[blocked]` is recorded, not faked.

## Status

- `pnpm install`, `pnpm typecheck` (13 tasks), `pnpm test` (5 tasks),
  `pnpm build` (5 tasks) all pass from the repo root.
- Flue tool wrappers unit-tested against the in-memory repo (`vitest`,
  6 tests). Adapter normalization unit-tested (4 tests) — every normalized
  event validated against `@demo/contracts` `AgentEventSchema`.
- Service verified live far enough to serve traffic: `flue dev --target node
  --port 3002` starts, `GET /health` → `{"status":"ok"}`, `GET /info` returns
  the agent/persistence/endpoint map, and the application-owned approval route
  `POST /proposals/:id/decision` responds (409 for an unknown proposal).

## What worked (native idiom)

- **Discovery-based project layout.** `flue build`/`flue dev` discover
  `src/agents/research-publisher.ts` (filename → agent name), `src/app.ts`
  (custom Hono composition), and `src/db.ts` (persistence adapter). Build
  output: `dist/server.mjs`, listens on `PORT` (default 3000; dev uses the
  `--port`).
- **Agent = `defineAgent(({ id }) => config)`.** The instance `id` is the
  caller-chosen path segment in `POST /agents/<name>/<id>`; we map the
  application thread id to it directly (identity + URL-safe escaping, see
  `src/shared/instance-id.ts` and the mirror in the adapter). Flue owns no
  separate instance registry, so no mapping table is needed — the app owns the
  id namespace.
- **Tools** via `defineTool({ name, description, input, output, run })`. Thin
  wrappers: validate/parse with `@demo/contracts` (zod), then call
  `@demo/domain` / `@demo/effects` with the repo from `@demo/persistence`.
- **Subagent** via `defineAgentProfile({ name, description, instructions,
  tools })`, provided through the agent's `subagents: [...]`. The model
  delegates with the built-in `task` capability; a workflow could call
  `session.task(text, { agent: 'researcher' })` directly (current equivalent of
  the handoff's `session.task(...)`).
- **Skill** imported with the JS import-attribute `import skill from
  '.../SKILL.md' with { type: 'skill' }` and passed in `skills: [...]`. Flue
  validates it against the agentskills.io spec at build time and packages the
  directory into the artifact.
- **Persistence** via `db.ts` default-exporting `sqlite('./data/flue.db')` from
  `@flue/runtime/node` — file-backed SQLite that survives restart (durable
  local testing, handoff §12). Node 24 ships `node:sqlite`, so no native build.
- **Application-owned approval (§17)** kept out of the framework: the agent
  creates a `pending` proposal, then polls `get_publication_status` (the bounded
  poll tool) until the app writes a decision via the Hono route
  `POST /proposals/:id/decision`. Proposal state transitions are the pure
  `@demo/domain` functions; the store is `src/shared/proposals.ts`.
- **Idempotent flaky publish (§18)** works end-to-end in tests: first configured
  attempt throws, retry commits (`created: true`), duplicate returns the same
  receipt (`created: false`). Exactly-once is enforced by the effect's
  idempotency key, not by proposal status.

## API differences vs. the handoff

- The handoff says "Use `@flue/sdk`" and `session.task(...)`. Both are current:
  `@flue/sdk` exports `createFlueClient(...)` with `client.agents.{send,prompt,
  wait,observe,history,abort}`; `session.task(text, { agent, result })` is the
  live delegation API. There is **no** `client.agents.events()` — agent
  event access is `observe()` (materialized conversation) / `wait({ onEvent })`;
  raw `FlueEvent` streaming (`stream()`/`events()`) exists only for **workflow
  runs**, not direct agent instances. The adapter therefore normalizes
  `observe()`'s materialized `FlueConversationMessage` parts (`text`,
  `reasoning`, `dynamic-tool`, `file`) into `@demo/contracts` `AgentEvent`s,
  keeping the raw part on each event's `raw` field.
- **Tool schemas are Valibot, not zod.** `defineTool.input/output` take
  `valibot` schemas (Flue re-exports valibot internally). Our shared contracts
  are zod (`@demo/contracts`). Resolution: the Valibot schema gives the model
  typed params + Flue's own validation; the wrapper then re-validates/parses
  with the authoritative zod contract inside `run`. This is genuine friction —
  a double schema per tool — and the clearest tax of using Flue with a
  zod-based shared layer (criterion 3).
- `flue init` still writes only `flue.config.ts` (confirmed) — all agent code is
  hand-authored, as previously recorded.

## Friction

- **`flue build` artifact cannot run our raw-TS workspace packages.**
  `flue build` *externalizes* application dependencies rather than bundling
  them. Our `@demo/*` packages export raw TypeScript (`main: ./src/index.ts`,
  no build step) and use `.js`-suffixed relative specifiers (e.g.
  `@demo/domain` imports `./corpus.js`). `node dist/server.mjs` then fails with
  `ERR_MODULE_NOT_FOUND: .../corpus.js` (Node's type-stripping does not rewrite
  `.js`→`.ts`). `flue dev` works because it transpiles through Vite. See
  **Blocked** — production `start` needs the shared packages emitted to JS (a
  repo-wide Phase-1 decision), or Flue's build configured to bundle them.
- **Dev reload loop on file-backed SQLite.** The dev watcher fires on every
  `data/flue.db-wal`/`-shm` write, reloading continuously. Fixed by
  `flue.config.ts`'s `vite.server.watch.ignored: ['**/data/**']`. Exported as a
  plain object (not `vite`'s `defineConfig`) because `vite` is not hoisted as a
  direct dependency.
- `db.ts`'s default export needed an explicit `PersistenceAdapter` type
  annotation (imported from `@flue/runtime/adapter`) — otherwise `tsc` errors
  TS2742 ("inferred type cannot be named") on the internal adapter type.
- `allowImportingTsExtensions` had to be enabled in `apps/flue/tsconfig.json`
  because the app's own modules import each other with `.ts` extensions (Flue's
  Vite build resolves them); the adapter package, built by plain `tsc`, imports
  workspace deps extensionless instead.

## Skill authoring & discovery (criterion 7) — mostly [live]

- Skills are **static `SKILL.md` files** imported at build time with
  `with { type: 'skill' }`; there is also a runtime `defineSkill({ name,
  description, instructions, files })` for programmatic skills. Frontmatter is
  validated against the agentskills.io spec (`name` must match the directory
  name; `description` required; `license`/`compatibility`/`metadata`/
  `allowed-tools` accepted, `allowed-tools` **not enforced**). Workspace skills
  are also auto-discovered from `<cwd>/.agents/skills/`.
- **Tension with "import, don't fork the brain."** The shared skill content
  lives in `@demo/prompts` (a TS string), but the import-attribute needs a real
  file. Resolution: `scripts/generate-skill.mjs` codegens
  `src/skills/research-and-publish/SKILL.md` from
  `@demo/prompts.RESEARCH_AND_PUBLISH_SKILL_MD` before every build/dev/typecheck
  (wired via `prebuild`/`predev`/`pretypecheck`). `@demo/prompts` stays the
  single source of truth; the `SKILL.md` is generated, never hand-edited. Agent
  `instructions` (and the new `RESEARCHER_INSTRUCTIONS` added to `@demo/prompts`
  for the subagent) are imported directly as strings — no codegen needed there.
- Skill discovery is first-class and hot-reloads under `flue dev` (Vite). No
  runtime "skill registry" API beyond `session.skill(name)` and the agent
  `skills: [...]` config.

## Auth story (criterion 8) — [doc], boundary exercised

- Flue owns **no end-user identity**. Each agent module can export a `route`
  (an ordinary Hono middleware) that runs before agent work; the application
  authenticates the caller and authorizes them against the requested instance
  `id` there. Docs are explicit: "A tool's parameters are model-selected
  inputs, not an authorization boundary… your route must authenticate the
  caller and ensure they may access the selected agent `id`." So "can user A
  resume user B's thread?" is entirely the app's `route` check — Flue does not
  answer it for you.
- Service-to-service auth: the SDK client takes a `token` (bearer) and/or
  `headers` (static or per-request function). Our adapter passes a server-side
  token and never exposes it to the browser (createThread/sendMessage/
  streamEvents/getThread all run server-side).
- External-tool OAuth/connections: no framework-owned connection store; the
  channels/tools guides show the app supplying provider credentials from
  trusted code (`connectMcpServer(headers)`, provider SDKs in tool closures).
- Our `src/auth.ts` demonstrates the boundary: it requires an instance id and,
  when `FLUE_AUTH_TOKEN` is set, a matching bearer token; otherwise it allows
  all callers (no auth infra in this spike). **Not verified against a real IdP
  or multi-user resume — [doc].** Weigh against lock-in (criterion 5): because
  Flue owns *no* auth, the walk-away cost here is zero, unlike Eve's
  Vercel-integrated auth.

## License (criterion 5) — [live], checked in node_modules

- `@flue/runtime`, `@flue/cli`, and `@flue/sdk` all declare
  `"license": "Apache-2.0"` in their `package.json` (verified in
  `node_modules/.pnpm/@flue+*`). No source-available/AGPL/BUSL/SSPL clause
  observed — permissive, fork rights, patent grant. On par with Mastra
  (Apache-2.0) for lock-in.

## LOC split (this session)

| Area | LOC |
|---|---|
| `apps/flue/src` (agent, tools, subagent, app, db, stores, auth — non-test) | 637 |
| — of which Drizzle proposal store (untested DB path) | 100 |
| `apps/flue` tool tests | 116 |
| `packages/flue-adapter/src/index.ts` (SDK client + normalization) | 195 |
| adapter tests | 92 |
| skill codegen + flue.config + generated SKILL.md | 64 |

Thin-wrapper observation: the four tools total ~178 LOC and are mostly the
Valibot-schema/zod-revalidation boilerplate forced by the schema mismatch; the
actual logic is one call each into `@demo/domain`/`@demo/effects`.

## Blocked (not faked)

- **Live model runs** — no `ANTHROPIC_API_KEY`/provider key. The full agent
  loop (plan → delegate → search → draft → propose → await approval → publish →
  report) is wired and typed but not executed against a model. Gate this on a
  key.
- **Durability / failure-injection live tests (handoff §18–19, plan step 7).**
  The idempotent-publish/retry logic is unit-tested, but the kill-mid-run /
  restart-with-approval-pending scenarios need `node dist/server.mjs` to run,
  which is currently blocked by the raw-TS externalization issue above. Options:
  emit `@demo/*` to JS, or run those scenarios under `flue dev`. Also gated on a
  model key.
- **Drizzle/Postgres path** — `DATABASE_URL` unset, no Neon yet. `stores.ts`
  selects `DrizzleEffectsRepo` + `DrizzleProposalStore` when set; both typecheck
  but are **untested** (mirrors the Phase-1 note that the Drizzle path is
  unexercised). `DrizzleProposalStore` upserts a `demo_threads` row before
  inserting a proposal to satisfy the FK.
- **Adapter live streaming** — `streamEvents`/`getThread` compile against
  `@flue/sdk` and normalize correctly in unit tests, but were not run against a
  live Flue stream (needs the running service + a model to produce events).
