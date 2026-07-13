# Learnings so far (through first live runs + first durability matrix)

Snapshot synthesis, 2026-07-12. Sources: findings.md phases 1-3, the
per-framework baseline notes, first-live-runs, and the (partially invalid)
first durability matrix. Tier tags per STATE.md convention.

## The headline so far

All three frameworks CAN do the job [live]: same research-and-publish agent,
same model, real Postgres, approval gate, flaky-but-idempotent publish,
restart-resume — all three completed the full loop first try once wired.
The decision will be made on ergonomics, cost mechanics, lock-in, and
durability edges, not on "can it work."

## Eve

- Scaffold assumes its home platform. Runs outside Vercel only after pinning
  a sandbox backend (`justbash`) and hand-configuring build externals [live].
- The provider escape hatch exists but sheds platform value silently [live]:
  bring-your-own model via OpenRouter and (1) prompt caching disappears
  (cache tokens 0, input tokens climb every step — cost + latency compound
  per turn), (2) the custom provider does NOT propagate to subagents (the
  researcher silently fell back to Vercel's AI Gateway and broke), (3)
  context-window metadata must be set by hand. Nothing warns you. This is
  the sharpest lock-in evidence we have (criterion 5): leaving the rails
  costs you a stack of invisible defaults, not a rewrite.
- Native HITL: pending approval surfaced as an `input.requested` pause
  [live] — the most product-shaped approval primitive of the three.
- Slowest run in the matrix largely because of the no-caching tax [live].
- Durability: kill-mid-model-turn resume and stream-reconnect FAILED in the
  first matrix — root cause under investigation (driver bug vs real defect;
  unresolved as of this snapshot).
- Filesystem-first authoring (agent/ dir, skills as files) is coherent and
  the typed client is good [live]. Apache-2.0 [live].

## Flue

- Cleanest provider story: `openrouter` is a built-in provider id; model
  config lives in app config, not agent code [live]. Cheapest to walk away
  from on this axis (criterion 5). Apache-2.0 [live]. Still 1.0.0-beta.
- Most durable-by-default execution shape [live]: a submission keeps running
  server-side after the client disconnects; the agent self-polled the
  approval wait to completion inside ONE submission (no second user turn).
  Flip side: async submit-then-observe made our first durability "passes"
  meaningless — the test harness (and any product UI) must consume the
  observe stream, not the submit ack. Both facts are the same coin: the
  runtime, not the connection, owns the work.
- Only framework exposing per-prompt cost (usage.cost) [live] (criterion 4).
- Most assembly required: `flue init` writes one config file; everything
  else is hand-authored [live]. Tool schemas are Valibot while our contracts
  are zod — double validation per tool (criterion 3 tax) [live].
- Its build output can't load raw-TS workspace packages — dev-mode only in
  this repo for now [live].

## Mastra

- Lowest wiring friction overall [live]: first-party OpenRouter provider
  slots straight in; richest scaffold; zod-4 compatible despite peer
  warnings (verified, not just claimed).
- NO first-class skill concept [live] (criterion 7): nearest equivalent is
  instruction strings. If skills-as-files matters to the product, Mastra
  makes you build that layer.
- Native subagents via the `agents` field (auto-generated delegation tool)
  [live]; tool-level suspend/resume exists as the native approval shape —
  we used app-owned approval for fairness, but the primitive is there.
- Durability: 8/8 matrix pass with credible timings [live] — kills,
  restarts, exactly-once, all real. Slowest server boot (~6.5s) of the
  three.
- Scaffold pins TypeScript 7 but its own build tooling breaks on it; needed
  a TS 5.9 pin [live]. Auth is thin/BYO (criterion 8). Apache-2.0 [live].

## Cross-cutting

- The shared framework-neutral layer worked exactly as designed: identical
  brain/tools/DB in all three, so every observed difference above is
  attributable to the framework. Framework glue stayed thin in all three.
- Idempotency-key + unique constraint held everywhere [live]: with
  DEMO_FAIL_PUBLISH_ATTEMPTS=2, every framework produced exactly one
  publication_effects row (attempt_count=3) every time. Exactly-once is a
  property of the effect layer, not the framework — which is the point.
- Event streams are the least standardized surface [live]: three adapters,
  three shapes (Eve collect-then-return NDJSON, Flue submit-then-observe
  materialized history, Mastra true async-generator). Every adapter's
  event mapping was wrong somewhere until checked against a live stream.
  Budget real time for this in any product integration.
- Prompt caching is nobody's default off the home path (fix in flight —
  shared cache_control wrapper, uniform across frameworks).
- Testing durability of async agents is subtle: "the API accepted my
  request" and "the agent is doing work" are different states, and a
  harness (or monitoring system) that conflates them reports fiction.
- Local-first eval stack (brew Postgres, in-memory repo double, fixture
  corpus, OpenRouter) held up: no cloud dependency has been needed yet.

## Open questions carried forward

- Eve durability failures: real or harness artifact? (in flight)
- Post-caching-fix cost/latency comparison (in flight)
- Criteria not yet touched live: voice loop (6), user-A/user-B thread
  isolation (8), eval/observability hooks in anger (4).
- Smithers phases entirely unstarted (gate pending corrected matrix).
