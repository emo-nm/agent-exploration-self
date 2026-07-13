# Smithers integration: both patterns live (2026-07-13)

Phase 3 executed minimally but for real, after the decision memo (deliberate
order: Smithers orchestrates the winner, it doesn't pick it). All [live],
local. Smithers 0.27.0, `.smithers/` pack, run via the LOCAL CLI
(`.smithers/node_modules/.bin/smithers` — the global install has a
duplicate-React clash with the project pack; version-pin finding).

## Pattern A — Smithers owns the run, frameworks are workers

- `.smithers/workflows/flue-research.tsx`: research (one settled Flue turn
  via `POST /agents/research-publisher/<id>?wait=result`) -> durable
  `<Approval>` -> refine on the SAME Flue thread -> output. Run
  `run-1783922401773`: research settled in ~7s; the run then suspended as a
  ROW (waiting-approval) at zero cost; `smithers approve` + `--resume`
  finished it. Total 1m32s including the human gate.
- `.smithers/workflows/compare-backends.tsx` (plan item 10): same prompt to
  Flue (:3002) and Mastra (:3003) in PARALLEL, each task independently
  durable, then a blinded deterministic judge (A/B order randomized by run
  id; scores grounding/concision/latency). Run `run-1783923298787`: 15s
  total, verdict tie 4-4. Swap the compute judge for `llmJudge` when taste
  matters.
- Adapter pain (a finding the plan asked for): near zero for Flue —
  `?wait=result` makes a settled turn one HTTP call. Mastra needed thread
  creation + SSE text-delta reassembly (~25 lines). Both fit in compute
  tasks; no agent runtimes needed.

## Pattern B — the product agent launches a bounded Smithers job

- New Flue tool `start_smithers_workflow`
  (`apps/flue/src/tools/start-smithers-workflow.ts`): fixed workflow
  ALLOWLIST (never a model-chosen path/URL), spawns `smithers up --detach`,
  returns the run id immediately. The Flue session stays the durable parent;
  the Smithers run owns its own durability (section-4 ownership rule: never
  nested, cleanly split).
- Live: asked the Flue agent to launch compare-backends; it called the tool,
  reported `run-1783923368021`, kept its session live; the child run
  finished independently (verdict: mastra 4-2 that round — flue's answer
  didn't cite the corpus). Flue's response carried the usage/cost block
  (cacheRead 6597, $0.0039/turn) — caching confirmed on this path too.

## Observability answer (what the user asked to see)

Smithers gives the ORCHESTRATION layer what the frameworks give a single
conversation: `smithers ps` (all runs), `inspect <run>` (state machine +
blocked-on), `tree <run>` (live node tree), `logs <run> -f`, `node <id>
--run-id <run>` (validated output + attempts per step), `timeline/replay`
(time travel), `smithers monitor <run>` (live web UI), plus
Grafana/Prometheus/Tempo via `smithers observability --detach`. Every step's
output is persisted and typed (zod-validated) — that's the audit trail.

## Is Smithers necessary if the frameworks are already durable?

Two different layers, and the ownership rule keeps them from fighting:
- Flue/Eve/Mastra make ONE CONVERSATION durable (a thread that survives
  crashes and waits for approvals).
- Smithers makes a PIPELINE durable (multi-step jobs spanning several
  agents/backends/tools, with retries, gates, parallel fan-out, and
  step-level audit).
If the product is "a chat that sometimes pauses for approval," the framework
alone is enough — don't add Smithers. The moment the product runs jobs
("compare these, then draft, then wait for compliance, then publish, retry
what fails"), that's pipeline durability, and hand-rolling it inside an
agent framework is rebuilding Smithers badly. Wealth-management workflows
(review cycles, compliance gates, batch rebalancing narratives) are
pipeline-shaped, so the expected prod topology is pattern B: Flue owns the
client conversation; bounded Smithers runs own the jobs it kicks off.

## 3-way comparison + verdict persistence (2026-07-13, live)

- `compare-backends.tsx` now fans out to ALL THREE backends in parallel: added
  a plain fetch-based `askEve(prompt, tag)` (POST `/eve/v1/session` to start a
  durable session, then read the NDJSON stream and keep the `message.completed`
  event whose `finishReason === "stop"` — its `data.message` is the settled
  reply). Flue and Mastra worker calls unchanged.
- Judge is now 3-way: scores all three answers (grounding / concision /
  latency), presented in a blinded A/B/C order derived deterministically from a
  hash of the runId (FNV-1a seed -> LCG-driven Fisher-Yates), so the judge
  never sees a fixed backend order.
- A trailing `persist` compute task writes ONE row into the main `agent_eval`
  `comparison_runs` table via Bun's built-in `SQL` (DATABASE_URL from repo
  .env). Gotcha found live: pass the metrics OBJECT straight into the tagged
  template (`${metrics}`) — `JSON.stringify(...)::jsonb` double-encodes it and
  the column ends up a JSON string scalar (`jsonb_typeof` = `string`), not an
  object.
- Live 3-way run `run-1783924514000` (Eve :3001 + Flue :3002 + Mastra :3003,
  all booted locally): finished/succeeded, all three answers present and all
  cite the corpus, judge verdict **tie** (each scored 4 on
  grounding/concision/latency; blind order eve/flue/mastra). Row written:
  `id = cmp_run-1783924514000`, `smithers_run_id = run-1783924514000`,
  `metrics_json` a proper jsonb object (verdict + all three answers). Both
  workflows still `graph` clean (exit 0); servers killed after the run.

## Not done / parked

- Deployment (plan item 12) needs Vercel account actions — parked for a
  session with James present; it is also the memo's one outstanding
  validation.
