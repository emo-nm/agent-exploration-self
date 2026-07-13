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

## Not done / parked

- Deployment (plan item 12) needs Vercel account actions — parked for a
  session with James present; it is also the memo's one outstanding
  validation.
- comparison_runs DB write from the judge (schema exists; wire when the
  comparison pipeline is used in anger).
