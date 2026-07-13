# Durability harness — design + dry-run notes (2026-07-11)

Built the durability/failure test harness for the 8-scenario suite in
`test-plan.md`, runnable per candidate (eve|flue|mastra). No API key exists in
this environment, so the model-driven scenarios can't run live yet; the harness
is wired so they fire unchanged the moment `OPENROUTER_API_KEY` lands, and
everything that doesn't need a model is verified here.

## How to run

```
pnpm eval:durability --backend eve|flue|mastra [--scenario N] [--dry] [--no-service]
```

- `--dry` — model-free run: start + health-check the backend, then exercise the
  model-free scenarios (2, 3, 7, 8) end-to-end against the durable repo. The
  model-driven scenarios (1, 4, 5, 6) report BLOCKED.
- `--scenario N` — run only scenario N (1..8).
- `--no-service` — don't spawn the backend (repo-only; used for quick smoke).
- Env: `DATABASE_URL` (shared Postgres, TRUNCATEd between scenarios; falls back
  to an in-memory repo when unset), `OPENROUTER_API_KEY` (enables 1, 4, 5, 6).

Results: one JSON file per run under `.eval-results/` (gitignored) at repo root,
plus a printed summary table. JSON carries per-scenario status, elapsed ms, and
attempt counts (publish attempts, restarts) for the memo's metrics section.

## Design

Everything lives in `packages/evals/src/harness/`:

- `backends.ts` — per-candidate start config (command, port, health URL,
  health predicate). One place for the start-mode quirks below.
- `terminator.ts` — process control. Spawns the dev server *detached* (own
  process group) so a `SIGKILL` to `-pid` takes the whole tree — a hard crash,
  no graceful shutdown. `waitForHealth` polls the health URL; `killService`
  resolves on child exit.
- `exactly-once.ts` — the pass/fail line. `foldEffectRows` + `assertExactlyOnce`
  work over grouped `publication_effects` counts from either Postgres
  (`countPublicationEffects`) or the in-memory repo (`listEffects`), so the same
  invariant runs in live, dry, and unit-test modes. Invariant: for every
  idempotency key, exactly one effect row and at most one committed receipt.
- `scenario-machine.ts` — a tiny pure state machine: runs an ordered phase list,
  records a timed trace, stops at the first failure, and *gates* `needsModel`
  phases to BLOCKED when no model is available. Fully unit-tested with fakes.
- `scenarios.ts` — the 8 scenarios as phase lists. Reusable phases: reset,
  seed proposal, assert-pending, flip-approval (application-owned, via the
  repo), publish (through the shared idempotent effect), restart (kill+respawn),
  assert-exactly-once.
- `drivers.ts` — model-driven conversation drivers, one per backend, backed by
  the shipped adapter packages (`@demo/{eve,flue,mastra}-adapter`), lazy-imported
  so dry runs / unit tests never load a framework SDK.
- `context.ts` — the shared context phases operate on (durable repo, driver,
  process-control hooks, effect-count source, per-scenario counters + scratch).
- `report.ts` — JSON result + summary table + counts.
- `runner.ts` / `cli.ts` — wire a live context and drive the suite.

### Failure-injection hooks

Reused the existing `DEMO_*` env hooks in `@demo/effects`
(`DEMO_FAIL_PUBLISH_ATTEMPTS`, `DEMO_CRASH_AFTER_EFFECT`). Added one minimal hook
needed for deterministic kill timing:

- `DEMO_PAUSE_BEFORE_COMMIT_MS` — in `publishArtifact`, sleep after the attempt
  row is reserved (attempt_count bumped) but before the effect commits. This
  widens the "mid-tool-work" window so a harness `SIGKILL` lands deterministically
  between "tool started" and "effect committed" (scenario 2) instead of racing
  the model.

Also extended `@demo/persistence` minimally (harness-only, kept out of the
app-facing surface where possible):

- `truncateDemoTables(pool)` / `DEMO_TABLES` — TRUNCATE (never DROP) between
  scenarios.
- `countPublicationEffects(pool)` + `EffectCountRow` — table-level grouped
  counts for the exactly-once assertion.
- `InMemory*Repo.listEffects()` — the in-memory equivalent.

### Approval automation

Scenarios that need approval assert the proposal is `pending`, then flip it via
`repo.setProposalStatus(id, "approved")` directly — application-owned approval,
never the model or framework (test-plan security line). Duplicate approval
(scenario 7) flips twice to prove idempotence.

## Per-backend start-mode quirks

All three are driven in **dev mode** — matches the baseline findings that the
build outputs can't yet load the raw-TS workspace packages:

- **eve** (`pnpm dev` = `eve dev --no-ui --port 3001`): health at
  `GET /eve/v1/health`. Boots fast; restart (kill+health) ~2.0-2.3s.
- **flue** (`pnpm dev` = `flue dev --target node --port 3002`): health at
  `GET /health`. Fastest restart, ~1.5s. `predev` regenerates the SKILL.md.
- **mastra** (`pnpm dev`, port 3003): mastra ships a built-in `GET /health`
  ({"success":true}) that shadows custom routes, so the demo health is at
  `GET /demo/health`. Slowest to boot — restart (kill+health) ~6.5s.

## What the dry run verified (all against live local Postgres 17, migrated)

`pnpm eval:durability --backend <b> --dry` with
`DATABASE_URL=postgresql://localhost:5432/agent_eval`, all three backends:

```
scenario                        eve      flue     mastra
1 kill-during-model-work        BLOCKED  BLOCKED  BLOCKED   (needs model)
2 kill-after-tool-success       PASS     PASS     PASS
3 restart-approval-pending      PASS     PASS     PASS
4 resume-saved-thread           BLOCKED  BLOCKED  BLOCKED   (needs model)
5 stream-disconnect-reconnect   BLOCKED  BLOCKED  BLOCKED   (needs model)
6 duplicate-user-input          BLOCKED  BLOCKED  BLOCKED   (needs model)
7 duplicate-approval            PASS     PASS     PASS
8 duplicate-publication-request PASS     PASS     PASS
```

4 pass / 4 blocked per backend, 0 failures. The passing four genuinely
exercise, without a model: service spawn + health, real `SIGKILL` + respawn
(scenarios 2, 3), application-owned approval flips (3, 7), duplicate publish
through the idempotent effect (8), and the exactly-once assertion counting rows
directly in `publication_effects` after a TRUNCATE-clean start.

Unit tests (`pnpm --filter @demo/evals test`, 15 tests): scenario state machine
(pass/fail/blocked/skip transitions), terminator (real spawn -> health ->
SIGKILL of a throwaway node server, plus unhealthy path), exactly-once assertion
(single/duplicate-row/double-commit/missing-key + a real duplicate publish and a
mid-commit-crash-then-retry fold), and JSON reporting + table rendering.

Root suite green with Node 24: `pnpm install`, `typecheck`, `test`, `build`.

## Ready-to-fire once the key lands

- Scenarios 1, 4, 5, 6 (BLOCKED today) drive real agent turns through the
  backend adapters. They're wired end-to-end; setting `OPENROUTER_API_KEY` and
  dropping `--dry` runs them. No code change needed.
- Live mode already shares Postgres between harness and backend across restarts,
  so state survival is real (not simulated).

## Blocked / honest caveats

- **No model loop ran.** The four model-driven scenarios are structurally
  complete but unverified against a real agent. Their `driveResearchTurn` phase
  assumes the agent creates a proposal the later phases read; with a key, confirm
  the adapters surface the created proposal id (the drivers currently rely on a
  seeded proposal id in the scratch bag — revisit once we can see real agent
  output). This is the one place the live wiring may need a small adjustment.
- Scenario 2's kill-mid-commit is exercised at the effect layer (pause hook +
  retry) rather than by SIGKILLing the live model mid-publish; the latter needs
  the model loop to actually reach the publish tool.
- Adapter stream/normalization field mappings remain unverified live (same
  caveat as the baseline notes).
```
