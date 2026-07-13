# First live-model runs — Eve / Flue / Mastra (2026-07-12)

First live-model signal in the INT-27 evaluation. Wired OpenRouter
(OpenAI-compatible, `https://openrouter.ai/api/v1`) as the model provider in all
three baselines with the SAME model id (`DEMO_MODEL_ID=anthropic/claude-sonnet-5`,
which OpenRouter resolves to `anthropic/claude-sonnet-5-20260630` via Amazon
Bedrock — confirmed 200 with a raw curl before any framework work). Real local
Postgres 17 (`DATABASE_URL`), migrated.

Loop under test (canonical prompt `eval-durable`: "How does durable execution
survive a restart?", expect doc-1/doc-10): plan -> subagent delegation -> fixture
corpus search -> draft -> proposal (pending in Postgres) -> flip approval via repo
-> agent polls -> publish with `DEMO_FAIL_PUBLISH_ATTEMPTS=2` (two failures then
success, exactly one `publication_effects` row) -> final artifact + receipt.
Resume check: follow-up turn on the SAME thread after a service restart.

Demo tables truncated (never dropped) between frameworks:
`TRUNCATE demo_threads, publication_proposals, publication_effects RESTART
IDENTITY CASCADE;` (`comparison_runs` is the web-UI table — left alone).

Provider-wiring friction per framework is a criterion-3 / lock-in finding and is
recorded below.

## Summary

All three baselines completed the full loop LIVE against OpenRouter, and all
three survived a service restart (durability scenario-4 quick check). This is the
first [live] model signal in the evaluation.

| Framework | Full loop live | Resume | Sequencing to publish | Exactly-one effect row | Prompt caching |
|---|---|---|---|---|---|
| Mastra | PASS | PASS (LibSQL memory) | 2 turns (turn 2 to publish) | verified (attempt_count=3) | not observed |
| Flue | PASS | PASS (SQLite history) | 1 durable submission, self-polled | verified (attempt_count=3) | yes (cacheRead 8926 on resume) |
| Eve | PASS | PASS (SessionState cursor) | 2 turns (turn 2 to publish) | verified (attempt_count=3) | NO (cache tokens 0 on direct path) |

Model everywhere: `anthropic/claude-sonnet-5` (OpenRouter -> `...-20260630`, Bedrock).
Each run hit the expected corpus docs (doc-1 + doc-10) for the canonical prompt.
Each framework's process runs from its own app dir and does NOT auto-load the
monorepo-root `.env` — in every case env was exported at launch (no secret
copied into a committed file). With `DATABASE_URL` set, all three routed to the
Drizzle/Postgres repo — the first live exercise of that path in all three; it
works.

Notable divergence: **Flue self-polled the approval wait to completion inside one
durable submission** (agent even `sleep`-ed between polls via a built-in bash/
sandbox tool, and the submission kept running server-side after the client
disconnected). Mastra and Eve each needed a second turn to publish after approval
was flipped out of band. Eve additionally emitted a native `input.requested`
(HITL pause) at the pending step.

## Mastra

**Wiring (low friction).** Installed `@openrouter/ai-sdk-provider@3.0.0`
(pulls `@ai-sdk/provider@4` / AI SDK v7, which Mastra's `provider-v7` slot
accepts natively). New shared helper `apps/mastra/src/mastra/lib/model.ts`:
one `createOpenRouter({apiKey}).chat(DEMO_MODEL_ID)` instance imported by both
agents (throws if `OPENROUTER_API_KEY` missing, so it can't silently fall back
to Mastra's own gateway). Both agents changed from hardcoded
`openai/gpt-5-mini` -> `demoModel`. `pnpm` peer warnings only (cosmetic).

**Full loop: PASS.** Turn 1: plan -> delegate to `researcher` (auto-generated
`agent-researcher` delegation tool) -> `search_fixture_corpus` x2 (doc-1, doc-10
+ others) -> draft -> `create_publication_proposal` (PENDING in Postgres) ->
polled `get_publication_status` once (pending) -> turn ended. Out-of-band
approval via SQL UPDATE. Turn 2 (same thread, "proposal was approved, proceed"):
status approved -> `publish_artifact` FAIL, FAIL, SUCCESS (attempt 3), same
idempotency key across attempts. Postgres: exactly ONE `publication_effects`
row, `attempt_count=3`, proposal `published`.

**Resume: PASS.** Killed server, started fresh, follow-up on same memory thread;
agent recalled the exact artifact title and cited docs without re-researching.
LibSQL-backed memory (`file:./mastra.db`) survived restart.

**Stream findings + normalizer fixes** (`packages/mastra-adapter/src/index.ts`):
live chunk shape is `{type, runId, from, payload}`. Two mappings were wrong:
- `tool-output` was mapped to `tool-result` — live it's an intermediate
  `from:"USER"` chunk firing ~100x/run; it flooded the stream (130 -> 28 events
  after removal). Removed it; the terminal `tool-result` (one per call) is the
  real signal.
- `error`/`tool-error` message extraction produced `"[object Object]"`; the live
  payload nests the error as an object. New code digs `cause.message` ->
  `details.errorMessage` -> `error.message` -> JSON fallback.
Delegation surfaces as a normal tool-call `agent-researcher` (no dedicated
subagent chunk); left mapped as tool-call. Suspend/approval chunk cases never
fired (baseline is app-owned). Adapter unit tests still green.

**Token/latency.** ~15-40s wall per turn; turn-2 poll + 3 publish attempts ~7s.
Token usage NOT surfaced in the stream (no `usage` on finish chunks, no cost on
SSE).

**Unresolved.** Proposals created with `threadId: null` (model doesn't pass the
memory thread id into `create_publication_proposal`) — not linked to
`demo_threads`; didn't affect the loop. `health()` hits the built-in
`GET /health`, not `/demo/health` (cosmetic).

**Bugs fixed.** The two normalizer mappings above. No tool-wrapper bugs. Files:
`apps/mastra/src/mastra/lib/model.ts` (new), both agent files,
`apps/mastra/package.json`, `packages/mastra-adapter/src/index.ts`,
`apps/mastra/scripts/live-run.ts` (throwaway).

## Flue

**Wiring (low friction, clean lock-in posture).** `openrouter` is a built-in
Flue provider id; the stock path is "set `OPENROUTER_API_KEY`, use model
specifier `openrouter/<id>`". Used the documented `registerProvider("openrouter",
{api:"openai-completions", baseUrl:"https://openrouter.ai/api/v1", apiKey, models:
{[DEMO_MODEL_ID]:{...}}})` override in `apps/flue/src/app.ts` (belt-and-suspenders
in case the catalog didn't know the 2026 model id). Agent model set to
`openrouter/${DEMO_MODEL_ID}`; the researcher subagent inherits the parent model
(one place to change). Provider config lives in `app.ts`, not agent code (as the
docs direct) — good for lock-in. **Env gotcha worth recording:** Flue's CLI loads
the *agent-app* project root `.env` (`apps/flue`), not the monorepo root — a
multi-package repo must feed env in itself. `/info` confirmed
`persistence: "drizzle"` (Postgres routing live). Ran under `flue dev` (the known
`flue build` raw-TS externalization issue still stands).

**Full loop: PASS, on a single durable submission.** Plan -> delegate to
`researcher` (built-in `task` tool) -> `search_fixture_corpus` (doc-1, doc-10 +
others) -> draft -> `create_publication_proposal` (PENDING in Postgres) -> polled
`get_publication_status`. `client.agents.prompt` blocked past the 120s client
timeout, but Flue's durable execution kept the submission running server-side
after the client disconnected; the agent self-polled the whole approval wait
(even `sleep`-ing between polls via the built-in bash/sandbox tool). Approved
out of band through the intended app-owned route `POST /proposals/:id/decision`;
the running submission detected it and published ~60s later:
`publish_artifact` FAIL, FAIL, SUCCESS (attempt 3). Postgres: exactly ONE
`publication_effects` row, `attempt_count=3`, proposal `published`. No second
turn was needed.

**Resume: PASS.** Killed `flue dev`, restarted (SQLite `data/flue.db`
checkpointed, no `-wal`/`-shm`), follow-up on the same instance id; agent
recalled topic + exact artifact title; `cacheRead: 8926` tokens (history replayed
from durable store).

**Stream findings + normalizer fixes** (`packages/flue-adapter/src/index.ts`).
Confirmed live: direct agent instances expose only `observe()`/`history()`
(materialized conversation), no raw `FlueEvent` stream. In materialized history
`dynamic-tool` parts are always terminal (18 `output-available`, 2
`output-error`, ZERO `input-available` — that only exists transiently on a live
stream). The real bug: `output-available` mapped to a single `tool-result` only,
so replaying a settled conversation produced ZERO tool-calls and dropped every
tool input (34 events, no tool-calls). Fixed `normalizePart` to return
`AgentEvent[]`: `output-available` -> synthesized `tool-call` (from `part.input`)
+ `tool-result` (54 events, all inputs visible); `output-error` -> `tool-call` +
`error` with the tool name prefixed into the message (contract's error event has
no tool fields); `input-available` retained for live mid-flight. Adapter tests
updated, green (4).

**Token/latency.** Usage/cost visible per prompt via
`AgentPromptResponse.usage.cost`. Resume turn: input 2, output 113, cacheRead
8926, cacheWrite 787, total 9828, cost ~$0.0049 (heavy prompt-cache reuse).
Turn-1 loop was one long submission dominated by the polling `sleep` wait, not
model latency.

**Unresolved.** The stock Flue agent has a code-exec (bash/sandbox) tool
available by default here — flag it. `registerProvider` override was
belt-and-suspenders; plain built-in `openrouter` (key only) may also work,
unconfirmed. Normalizer still surfaces subagent/approval/publish as generic
tool-call/tool-result (inferable from tool names; not a wrong mapping, left).

**Bugs fixed.** `apps/flue/src/agents/research-publisher.ts` (model),
`apps/flue/src/app.ts` (registerProvider), `packages/flue-adapter/src/index.ts`
(normalizer) + its test, `apps/flue/scripts/live-run.mjs` (throwaway driver).

## Eve

**Wiring — the key finding: Eve accepts OpenRouter, but the escape hatch has
sharp edges (real criterion-5 lock-in signal).** Stock `model` is a Vercel AI
Gateway model-id string routing through the Gateway (needs `AI_GATEWAY_API_KEY`/
linked project). Documented alternative (`node_modules/eve/docs/agent-config.md`):
pass a provider-authored `LanguageModel`. That path works — added
`@openrouter/ai-sdk-provider@3.0.0` (emits `specificationVersion 'v4'`, matches
eve's `ai@7`), `createOpenRouter({apiKey}).chat(DEMO_MODEL_ID)`. Three friction
points, all lock-in relevant:
1. **A direct model breaks compaction at build.** `eve build` failed:
   "primary compaction trigger model ... does not have known AI Gateway context
   window metadata." Eve derives the context window from the Gateway catalog;
   a provider-authored model carries none. Fix: hand-set
   `modelContextWindowTokens: 200_000` on `defineAgent`. Leaving the Gateway
   forces you to hand-maintain metadata Eve otherwise gets for free.
2. **Provider does NOT propagate to subagents.** First run, the root ran on
   OpenRouter but the `researcher` subagent failed with "AI Gateway received no
   credentials. Run `eve link`" — it silently fell back to the Gateway. A
   declared subagent inherits nothing (known for tools; now confirmed for the
   model provider). Had to repeat the full wiring in
   `subagents/researcher/agent.ts`.
3. **No prompt caching on this path.** All `step.completed` usage showed
   `cacheReadTokens: 0 / cacheWriteTokens: 0`; input tokens climb every step.
   The Gateway path presumably enables Anthropic caching; direct-OpenRouter did
   not — a real cost delta.
Env exported at launch; `DATABASE_URL` set -> Drizzle/Postgres repos; rows landed
in Postgres. Build bundled the provider cleanly.

**Full loop: PASS (two turns).** Turn 1: `load_skill` -> plan -> delegate to
`researcher` -> `search_fixture_corpus` (doc-1, doc-10) -> draft ->
`create_publication_proposal` (PENDING in Postgres) -> polled status (pending) ->
emitted native `input.requested` (HITL) and stopped asking for approval. Approved
out of band via SQL UPDATE. Turn 2 (same session): status approved ->
`publish_artifact` FAIL, FAIL, SUCCESS (attempt 3), same idempotency key.
Postgres: exactly ONE `publication_effects` row, `attempt_count=3`, proposal
`published`, continuation persisted.

**Resume: PASS.** Killed process, restarted `eve start`, resumed same thread from
the persisted `SessionState` cursor in `demo_threads.continuation_state_json`;
agent recalled the original question and the published artifact id.

**Real event-stream shape + normalizer fixes** (`packages/eve-adapter/src/index.ts`).
Live events are `{type, data, meta?}`. Observed types: `session.started,
turn.started, message.received, step.started, reasoning.appended,
actions.requested, action.result, step.completed, message.appended,
message.completed, subagent.called, turn.completed, session.waiting`. Subagent
completion arrives as an `action.result` with `data.result.kind:
"subagent-result"`, not `subagent.completed`. Fixes:
- `action.result` (the real bug): fields nest under `data.result`
  (`{callId, kind, output, toolName|subagentName, isError?}`), not flattened on
  `data` — old code produced `toolName:"unknown", callId:""` for every result.
  Now reads `result.toolName ?? result.subagentName`, `result.callId`,
  `result.output`.
- `subagent.completed`: field is `data.subagentName` (not `data.name`); surface
  `data.output` into detail.
- `subagent.started`: added (was unhandled).
- `input.requested`: payload is `data.requests[]` (`InputRequest[]` with a
  `key`), not `data.proposalId`.
- `actions.requested` and `subagent.called` were already correct against live
  data.

**Token/latency.** Per-step `step.completed.usage`. Turn 1 (~12 model steps):
~6k input growing to ~16k/step, no caching. Wall: turn 1 ~90s, turn 2 ~24s,
resume ~5s. Per-call cost not surfaced in the eve stream.

**Unresolved.** No prompt caching on the direct path (cost). On restart a stale
queued run from the prior session replayed and logged `handlerError: "Unhandled
queue"` (local Workflow world persists queue state to disk) — harmless (health
stayed ready, fresh threads worked) but a note on local-world durability. Needed
`pnpm dlx tsx` to run the driver (Node 24 type-stripping can't remap `.js`->`.ts`
workspace specifiers).

**Bugs fixed.** `apps/eve/agent/agent.ts` (OpenRouter + `modelContextWindowTokens`),
`apps/eve/agent/subagents/researcher/agent.ts` (same wiring — was failing),
`apps/eve/package.json` (dep), `packages/eve-adapter/src/index.ts` (normalizer).

