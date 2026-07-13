# Durability matrix — corrected drivers, live rerun (2026-07-12/13)

Follow-up to the first live durability matrix (results
`.eval-results/durability-*-live-2026-07-13T00-*.json`). That run had two
problems: (1) the Flue results were invalid — every scenario "passed" in 8.8s
total because the driver returned at submission-accept, before any model work;
(2) Eve scenarios 1 and 5 failed with an opaque "fetch failed" after ~385s/432s.
Both are diagnosed below; drivers were fixed and the FULL matrix rerun for all
three backends. Between the diagnostic reruns and the final run, the
prompt-caching wrapper landed (commit 028e53e: `@demo/model` `withPromptCaching`
in apps/eve and apps/mastra), so the final numbers are on the cached wiring for
all three.

All runs: live model (`anthropic/claude-sonnet-5` via OpenRouter), local
Postgres 17 (`DATABASE_URL`), demo tables TRUNCATEd between scenarios (harness
`reset` phase), backend local stores (eve `.workflow-data`, flue `data/`,
mastra `mastra.db*`) wiped before each backend's suite.

## Final matrix (live, cached wiring)

| # | scenario | eve | flue | mastra |
|---|---|---|---|---|
| 1 | kill-during-model-work | FAIL (resume >240s) | FAIL (resume >240s) | PASS 17.5s |
| 2 | kill-after-tool-success | PASS 3.3s | PASS 2.6s | PASS 6.6s |
| 3 | restart-approval-pending | PASS 2.0s | PASS 1.5s | PASS 6.6s |
| 4 | resume-saved-thread | PASS 56.8s | FAIL (settle >240s) | PASS 51.8s |
| 5 | stream-disconnect-reconnect | PASS 3.2s | PASS 3.1s | PASS 8.0s |
| 6 | duplicate-user-input | PASS 125.8s | PASS 316.7s | PASS 53.9s |
| 7 | duplicate-approval | PASS | PASS | PASS |
| 8 | duplicate-publication-request | PASS (1 effect row) | PASS (1 effect row) | PASS (1 effect row) |
| | **total** | **7/8, 440s** | **6/8, 813s** | **8/8, 152s** |

Exactly-once held in EVERY scenario on every backend (never a duplicate
publication effect — the failures are availability/resume failures, not
correctness failures).

Interpretation:
- **mastra 8/8** clean, second consecutive credible full pass (first run
  8/8 pre-caching, this run 8/8 cached and faster).
- **eve 7/8**: the one failure is exactly the diagnosed poison-message
  replay-storm defect (section b below): resume after kill-mid-model-turn
  exceeded 240s while interrupted-run queue messages replayed. Scenario 5,
  which failed in the first matrix, passes after the adapter cursor fix —
  that half was our bug, and the isolated repro proves clean crash-resume
  works (12.9s) when the queue isn't storming.
- **flue 6/8**: both failures are >240s timeouts, not wrong behavior, and
  scenario 6 PASSED at 316s — flue's durable self-polling submissions can
  legitimately exceed the 240s settle budget, and the stale-SQLite boot
  gotcha (below) can burn most of a resume budget after a hard kill.
  Flake-vs-defect not yet resolved: needs repeat runs and/or a budget
  calibrated to flue's polling cadence. Recorded honestly as OPEN.

## Problem 1 — Flue driver: submit-then-observe checkpoints

Root cause: Flue's `client.agents.send()` ADMITS a durable submission and
returns at accept; the model loop runs server-side afterward. The old driver
returned at admission, so:

- `kill-during-model-work` killed the service before any model work started
  (drive phase: 282ms in the invalid run) — it tested a kill during nothing.
- Every "model" scenario asserted against an empty conversation.

Fix (`packages/evals/src/harness/drivers.ts`): the driver now takes an explicit
per-turn checkpoint and OBSERVES the submission until that checkpoint is
reached, by polling `client.agents.history()` (a durable materialized read):

| Checkpoint | Meaning for Flue | Used by |
|---|---|---|
| `settled` | poll until `snapshot.settlements[]` contains this `submissionId` (terminal outcome recorded by Flue) | scenarios 4, 6 drive turns; all resume turns |
| `model-started` | poll until the conversation shows a real model event (assistant message / tool-call / tool-result / subagent), then return WITH THE SUBMISSION STILL RUNNING server-side | scenario 1 (so the SIGKILL lands mid-model-work), scenario 5 (so the reconnect is genuinely mid-stream) |

Each checkpoint has an explicit budget and a named failure
(`flue submission <id> did not reach '<checkpoint>' within <ms>`), never a bare
"fetch failed". `streamEvents` (reconnect) re-reads the durable snapshot.

The same checkpoint contract was applied to eve and mastra so scenario 1/5 are
symmetric across backends: eve streams the turn and breaks after the first
model event (the eve run keeps executing server-side — verified: the killed
run's session resumed with full context); mastra breaks its SSE reader the same
way (caveat: mastra's turn is driven BY the client request, so an abandoned
reader may cancel the in-flight turn server-side — the kill still lands
mid-work from the harness's perspective, but this is a weaker durability story
than eve/flue, where the turn provably continues without a client).

What the drive phases actually did in the corrected Flue run (evidence it now
tests what the titles say): scenario 1 drive reached model-started in ~4.1s,
kill, restart, resume produced 43 events in ~128s; scenario 4's settled drive
took ~196s / 42 events; scenario 6's ~148s / 38 events. Versus 8-282ms sham
drives in the invalid run.

## Problem 2 — Eve scenarios 1 and 5 root cause

Verdict: **part harness artifact, part REAL eve defect.** The opaque
"fetch failed" errors and one of the two failures (scenario 5) were
harness/driver bugs, now fixed. But underneath sits a genuine eve durability
defect: a SIGKILL mid-model-turn leaves poisoned queue messages in eve's local
Workflow world that replay forever on every restart, and resume of the
interrupted thread is unreliable while that storm runs — observed
succeeding once (12.2s) and failing twice (>240s, >300s) across three
full-suite runs. Three distinct things untangled:

### (a) The original "fetch failed" after ~385s/432s — harness artifact

Both failing phases died at almost exactly 300.9s inside the phase (undici's
default headers/body timeout of 300s on a fetch with no response activity), on
top of ~80s of prior turn time. Isolated reproduction
(`packages/evals/src/repro-eve.ts`, log
`.eval-results/eve-repro-server.log`): boot eve -> full research turn (85s) ->
SIGKILL process group -> restart (3.2s to healthy) -> resume the same thread
from the persisted `SessionState` cursor -> **RESUME OK in 12.9s, 4 events,
same session id `wrun_01KXCEJEHT3MF172PMGC80094J`**. Eve's crash-resume of a
thread works. The fix is per-phase budgets with named errors (see driver
changes) instead of riding into undici's opaque default.

### (b) The REAL eve defect — interrupted turns become a poison-message
### replay storm in the local Workflow world

Eve's local world persists workflow queue state to disk
(`apps/eve/.workflow-data`; grew to 17MB / 33 runs across the earlier session).
Runs interrupted by SIGKILL are replayed on every restart and REJECTED forever:

```
[world-local] Queue message failed (attempt 78, HTTP 400) {
  queueName: '__wkf_workflow_workflow//eve//turnWorkflow',
  runId: 'wrun_01KXCFAZDQVB9D6NW7RB0BF66D',
  handlerError: '{"error":"Unhandled queue"}'
}
```

In ONE full-suite run starting from a WIPED `.workflow-data`
(`.eval-results/eve-server-1783903876992.log`), 5 interrupted runIds were
retried 78-103 times each (460 failure log lines, still climbing at process
kill) across the suite's 4 restarts. There is no visible backoff ceiling or
dead-letter: the backlog re-arms on every restart and competes with live work.
Effect measured in that run: scenario 4's `resume-saved-thread` (a single
follow-up turn that takes ~8-12s on a quiet server) did not complete within a
240s budget while the replay storm was running. Scenarios that resumed earlier,
with fewer poisoned runs pending (scenario 1 resume: 12.2s), passed. This is a
first-hand [live] durability finding against eve's local world: **a hard crash
mid-turn leaves permanently-retrying poisoned queue messages that degrade the
restarted server**, and it compounds with each additional crash. (The
2026-07-12 first-live-runs note saw a single harmless-looking "Unhandled queue"
line; under the durability suite's repeated kills it is not harmless.)

### (c) Scenario 5's second failure mode — adapter cursor bug (fixed)

After the checkpoint redesign, scenario 5 failed differently: "thread has no
eve session to stream". Cause: eve's `session.state` does NOT carry the
`sessionId` until the response stream is iterated; only
`response.sessionId`/`response.continuationToken` are known right after the
POST. The new `streamMessage` persisted the pre-stream state, saving a cursor
without a session id. Fixed in `packages/eve-adapter/src/index.ts`: the
persisted cursor is composed from `session.state` overlaid with the response's
`sessionId`/`continuationToken`, and re-persisted after each streamed event so
an early break always leaves a resumable, streamable cursor.

## Driver / harness changes (all in this working tree, uncommitted)

- `packages/evals/src/harness/drivers.ts` — checkpoint contract
  (`until: "settled" | "model-started"`, per-call `timeoutMs`); Flue driver
  rewritten to observe via `history()` polling with settlement detection; eve
  driver streams + early-breaks for `model-started`; mastra driver early-breaks
  its SSE reader (caveat noted above).
- `packages/evals/src/harness/scenarios.ts` — scenario 1 and 5 drive to
  `model-started` (kill/reconnect genuinely mid-work); 4 and 6 drive to
  `settled`; every model phase has an explicit budget (`SETTLE_TURN_MS` 240s,
  `MODEL_STARTED_MS` 120s, `RECONNECT_MS` 60s) and a named timeout error.
- `packages/evals/src/harness/runner.ts` — backend server stdout/stderr now
  captured to `.eval-results/<backend>-server-<ts>.log` (the original failures
  had zero server-side evidence).
- `packages/eve-adapter/src/index.ts` — new `streamMessage()` (streaming send
  with early-persisted, event-fresh session cursor); cursor composition fix.
- `packages/evals/src/repro-eve.ts` — throwaway isolated repro for eve
  scenario 1 (kept for evidence).
- No changes to app code beyond what was already merged separately; sandbox
  semantics untouched.

Typecheck green (`@demo/evals`, `@demo/eve-adapter`, `@demo/flue-adapter`);
all 15 harness unit tests pass.

## Operational gotchas found while running

- **Flue stale-SQLite boot failure:** after a SIGKILL, `apps/flue/data/flue.db`
  was left with live `-wal`/`-shm`; the next `flue dev` served persistent 503
  `runtime_unavailable` from `/health` for >60s (never recovered within the
  budget). A fresh `data/` boots in ~3s. Kill-then-cold-start across harness
  invocations needs either flue's own recovery time or a wiped data dir; WITHIN
  a suite (same harness process respawning) restarts were clean.
- **Mastra local stores** (`mastra.db*`, `mastra.duckdb*`) accumulate; wiped
  between backend suites for comparability.

## Scenario-1 decisive rerun @600s budget, clean stores (2026-07-13)

Question: at 240s both eve and flue fail scenario 1 — are they slow or stuck?
Run: scenario 1 only, per backend, `EVAL_SETTLE_TURN_MS=600000`, wiped local
stores (`.eval-results/durability-{flue,eve}-live-2026-07-13T04-1*/2*.json`
era; console: flue PASS 260.9s, eve FAIL 605.5s).

- **flue: SLOW, not stuck.** Passed at 260.9s — the resumed turn does settle;
  it just exceeds any reasonable interactive budget. Root causes as suspected:
  submit-then-poll cadence + post-SIGKILL SQLite recovery.
- **eve: STUCK.** Failed even at 600s on a clean `.workflow-data`. The
  poison-message replay-storm defect is confirmed as a hard failure, not a
  slow path: one SIGKILL mid-turn is enough to make resume of that thread
  not complete in 10 minutes.

### Product bar set 2026-07-13: resume must complete within 60s

User requirement: a crash-resume that takes more than 1 minute is a failure
regardless of whether it eventually settles. The harness now encodes this —
`SETTLE_TURN_MS` defaults to 60s. Under that bar, TODAY: flue fails scenario 1
by pace (260.9s), eve fails it by defect. Mastra passed it in 17.5s.

### Harness speed changes (same date)

- Durability scenarios now drive a deliberately SHORT model turn (1-2 sentence
  answer, one search, no subagent, no proposal) — the durability question is
  "does the turn survive", not "can it do a long research task". Override with
  `EVAL_PROMPT` to run the full task.
- Suite parallelized across backends: `scripts/eval-durability-all.sh` runs
  all three concurrently, each against its own database
  (`agent_eval_{eve,flue,mastra}`) so reset/truncate can't cross-talk.

## Fast-suite matrix under the 60s bar (2026-07-13)

First full run of the fast suite (short constrained turn, 60s settle bar,
flue+mastra in parallel via `scripts/eval-durability-all.sh`, eve solo after
a harness crash — see gotcha below). Clean stores, per-backend databases.

| # | scenario | eve | flue | mastra |
|---|---|---|---|---|
| 1 | kill-during-model-work | FAIL >60s | PASS 56.7s | PASS 19.6s |
| 2 | kill-after-tool-success | PASS 2.3s | PASS 1.6s | PASS 7.1s |
| 3 | restart-approval-pending | PASS 2.1s | PASS 1.6s | PASS 6.6s |
| 4 | resume-saved-thread | FAIL >60s | PASS 22.9s | PASS 24.3s |
| 5 | stream-disconnect-reconnect | PASS 4.2s | PASS 3.1s | PASS 7.9s |
| 6 | duplicate-user-input | PASS 9.4s | PASS 11.1s | PASS 9.4s |
| 7 | duplicate-approval | PASS | PASS | PASS |
| 8 | duplicate-publication-request | PASS | PASS | PASS |
| | **total** | **6/8, 155s** | **8/8, 99s** | **8/8, 83s** |

Reading:
- **flue 8/8** — its earlier failures were turn-length, not durability: with
  a short turn, crash-resume settles at 56.7s (recovery overhead is roughly
  fixed ~45s: poll cadence + post-kill SQLite recovery). CAVEAT for the memo:
  56.7s is under the bar only because the turn is tiny; a real-length turn
  stacks on that fixed overhead and would exceed 60s (measured: 260.9s with
  the full research turn).
- **eve 6/8** — scenario 1 is the confirmed replay-storm defect failing fast
  at the bar; scenario 4's resume ALSO exceeds 60s in the same suite run
  (the storm from s1's kill degrades every later resume — compounding, as
  documented in section b). s4 passed at 56.8s under the old 240s budget on
  a less-poisoned world; under the 60s bar it fails.
- **mastra 8/8** — third consecutive full pass; comfortably under the bar
  everywhere (worst resume 24.3s).
- Suite wall-clock: ~2.5 min for all three (parallel), vs ~7-13+ min per
  backend sequential before.
- Harness gotcha: with all three suites in parallel, eve's harness process
  crashed on its first request with Node 24 undici `setTypeOfService EINVAL`
  (socket-close race on localhost under load). Our bug, not eve's; rerun
  solo passed cleanly. Add retry-on-EINVAL if it recurs.

## Flue's "fixed ~45s recovery overhead" decomposed (2026-07-13, traced)

Instrumented the flue driver's poll loop (`EVAL_TRACE=1`, drivers.ts) and
cross-referenced the captured server log. Scenario 1, one run, PASS 42.0s:

| window | duration | what's happening |
|---|---|---|
| kill -> flue serving again | ~2s | process restart; SQLite recovery was a non-issue this run |
| flue ready -> agent instance starts | **~32s** | DEAD TIME. Server log: `ready` 21:47:48, `[agent] ...started` 21:48:20. The conversation snapshot doesn't change at all. Flue's runtime waits ~30s before re-claiming the interrupted submission — looks like a lease/visibility timeout on the in-flight submission expiring before another worker may pick it up |
| instance start -> killed submission settles | ~1s | the interrupted turn is re-driven to completion (its pre-kill events had survived: message + tool-call + tool-result all present at first poll) |
| -> resume submission settles | ~3s | the "continue" turn runs and settles |

So the overhead is ONE thing, not many: a ~30s fixed wait before an
interrupted submission is resumed after restart. Not our polling (1s
cadence), not the model, and SQLite recovery contributed ~0 here (it CAN
contribute on cold cross-process starts — the 503 gotcha stands separately).
Implication for the 60s bar: flue passes only when (30s lease + turn length)
< 60s, i.e. real-length turns fail on the lease alone. [live]

Configurability: read the bundled @flue/runtime source — the candidate
constants (`LONG_POLL_TIMEOUT_MS = 30_000`; recovery retry backoff base
`TRANSIENT_MODEL_RETRY_BASE_DELAY_MS = 2_000`, doubling per attempt) are
hard-coded module constants, not exposed config. The ~30s takeover wait is
not tunable without patching the framework — itself a memo-grade finding
for crash-recovery-latency-sensitive products. (Which constant governs is
not fully pinned; the non-configurability is what matters.) [live]

## Classifying findings: architectural vs config/environment (user call, 07-13)

Direction from James: a lot of found downsides may be config or environment
setup — worth picking out, but not evidence for "which framework should we
use." Memo must score on the ARCHITECTURAL bucket; artifacts get demoted to
setup notes. Classification of everything so far:

**Architectural (survives any config — memo-grade):**
- flue: ~30s takeover wait on crash-resume is a HARD-CODED runtime constant
  (verified in bundled source), a deliberate no-double-execution lease
  trade. Not tunable without patching.
- mastra: turns are client-driven; an abandoned request can kill the turn.
  Weakest durability architecture despite the cleanest matrix record.
- eve: approval primitive most product-shaped; isolated-by-default prod
  sandbox; deepest platform coupling.
- all three: exactly-once held in every scenario (positive, architectural).
- skill concept (mastra: none), auth story, license — architectural.

**Config/environment artifacts (setup notes, NOT framework verdicts):**
- flue stale-SQLite cold-boot 503s (local dev store).
- eve local-world queue replay storm — [live] against the LOCAL world only;
  prod eve runs Vercel-hosted queues, may dead-letter properly. Deploy phase
  retests this before it's allowed to count against eve in the memo.
- our own: eve start-vs-dev, justbash pin, harness undici crash.

**Middle bucket — "just a default," but defaults are signal (repo rule):**
- eve silently shedding prompt caching (and other platform defaults) on the
  direct-provider path: fixable config, but the SILENCE of the degradation
  is lock-in evidence (criterion 5), not a durability demerit.

The deploy phase is the deconfounder: same scenarios against prod-shaped
environments decide which artifact-bucket items evaporate.

## Where this leaves the gate

Test-plan gate ("no Smithers work until direct eve and flue pass"): NOT open.
The 600s rerun resolved flake-vs-defect: eve fails scenario 1 with a confirmed
defect (stuck at 600s); flue completes but at 260.9s, over the 60s product bar
by 4x. Mastra alone meets the bar. The gate binds on eve+flue, so it stays
shut on kill-mid-turn; the fast parallel suite makes reruns cheap enough to
retest after any mitigation (e.g. flue tuning, eve queue drain).
