# Project state — the map

> Read this first. It's the index of what's current here — a map, not the
> truth; open the linked code/notes before relying on a row. If your session
> changes the verdicts or the code, update this file in the same commit.

Last updated: **2026-07-13** (all three baselines pass the FULL LIVE loop
[live]. Prompt caching fixed + measured (@demo/model). Comparison UI built.
Durability: mastra 8/8, eve 7/8, flue 6/8 — exactly-once held everywhere.
Scenario-1 (kill-mid-turn) resolved by a 600s rerun on clean stores:
**flue is SLOW not stuck** (passes at 260.9s), **eve is STUCK** (fails at
600s — poison-message replay storm confirmed as a hard defect in its local
world). NEW PRODUCT BAR (user, 07-13): crash-resume must complete in <=60s;
harness now encodes it (SETTLE_TURN_MS=60s), and today only mastra meets it
(17.5s). Suite made fast + parallel: short durability prompt, per-backend
DBs, `scripts/eval-durability-all.sh`. Smithers gate NOT open (binds on
eve+flue passing kill-mid-turn under the bar).
Canonical results: log/2026-07-12-durability-matrix-results.md.
Details: [`findings.md`](findings.md); roadmap: [`plan.md`](plan.md);
synthesis: [`log/2026-07-12-learnings-so-far.md`](log/2026-07-12-learnings-so-far.md).)

## What this is

Evaluation repo serving **INT-27** on the Native sprint board (the agent-framework
decision, which also absorbs CORE-02): compare **Eve**, **Flue**, and
**Mastra** (added 07-10) as durable product-agent frameworks, and test how
**Smithers** orchestrates them (and how they launch a bounded Smithers job). Hands-on, deployed to Vercel —
verdicts from running things, not reading docs. The code is disposable; the
decision memo is the product. Parent context:
[native-markets/prototypes](https://github.com/native-markets/prototypes) →
`docs/STATE.md` (sprint ticket breakdown in
`docs/log/2026-07-10-intent-ticket-breakdown.md`).

## Topic index

| Topic | Authoritative source | Status |
|---|---|---|
| Original detailed spec (systems model, integration patterns, demo agent, test matrix) | [`docs/log/2026-07-11-eve-flue-smithers-codex-handoff.md`](log/2026-07-11-eve-flue-smithers-codex-handoff.md) | historical — content promoted into architecture/test-plan/deployment per phase; living docs win on conflict |
| Annotated roadmap (phases, what each step buys, status) | [`plan.md`](plan.md) | current — derived from handoff section 23 |
| Shared framework-neutral layer (contracts, persistence, effects, domain, prompts, evals) | `packages/*` + findings.md Phase 2 | [live] built + unit-tested; Drizzle path verified against local Postgres 17 |
| Ownership rule (never nest durability: Smithers-owned run XOR Eve/Flue-owned session) | handoff section 4 | [doc] standing constraint |
| Shared demo agent (same toy in each framework, so comparison is fair) | [`architecture.md`](architecture.md) + apps/{eve,flue,mastra} | [live] built in all three; model loop unrun (no key) |
| Architecture + demo-agent spec (incl. Mastra) | [`architecture.md`](architecture.md) | current — promoted from handoff 07-11 |
| Test plan (durability suite, gate, security, adapters) | [`test-plan.md`](test-plan.md) | current — promoted from handoff 07-11 |
| Deployment | [`deployment.md`](deployment.md) | local-dev section current [live]; deploy targets specced, unexecuted |
| Sandbox/isolation comparison (Eve microVM default vs Flue/Mastra BYO) | [`log/2026-07-12-sandbox-research.md`](log/2026-07-12-sandbox-research.md) | [doc] researched 07-12 — only Eve isolates by default in prod; our justbash pin was the wrong local lever (fix queued) |
| Findings per framework | [`findings.md`](findings.md) (from `findings-template.md`) | phases 1-3 recorded per candidate |
| Learnings synthesis (through first live runs + first matrix) | [`log/2026-07-12-learnings-so-far.md`](log/2026-07-12-learnings-so-far.md) | snapshot 07-12 — headline: all three complete the loop [live]; Eve escape-hatch/lock-in finding; Flue driver invalidated its first matrix; Mastra 8/8 credible |

## Criteria (from INT-27 — score each candidate on these in the memo)

1. Long-lived conversations that pause/resume across days
2. Human-approval steps (a pending action that waits for a yes)
3. Typed tool interfaces
4. Eval/observability hooks
5. Lock-in — how hard to walk away, incl. license (Mastra: Apache-2.0 ✓ — no
   source-available obligation, fork rights, patent grant; Eve + Flue licenses
   unchecked — verify, and flag anything AGPL/BUSL/SSPL-shaped)
6. Can it host a live voice loop (or only turn-based text)?
7. Skill authoring & discovery (added 07-11) — how custom skills are defined,
   discovered, and composed; hot-reload; what the framework's equivalent even
   is if it lacks a first-class "skill" concept (suspected for Mastra — that
   absence is itself a finding)
8. Auth story (added 07-11) — end-user identity on sessions (can user A
   resume user B's thread?), service-to-service auth, and connection/OAuth
   handling for external tools. Eve's Vercel-integrated auth looks [doc]
   convenient — verify live, and weigh it against lock-in (criterion 5):
   the more auth the framework owns, the harder the walk-away

## Verdict so far

Tiers: **[live]** = ran it here first-hand · **[doc]** = docs claim it,
untested · **[inf]** = inferred. Only [live] counts for the final memo.

| Candidate | Status | Verdict so far | Evidence |
|---|---|---|---|
| Eve (direct) | full live loop PASSES [live]; durability 7/8 [live] — REAL defect: SIGKILL mid-turn leaves forever-replaying poisoned queue messages in the local world, degrading resume (isolated repro proves clean crash-resume works otherwise, 12.9s); scenario-5 fail was our adapter cursor bug (fixed) | direct-provider path sheds platform defaults silently (caching, subagent provider, ctx window) — top lock-in finding; native input.requested approval pause is the most product-shaped; only framework with isolated-by-default prod sandbox (microVM) [doc]; justbash local pin was wrong lever (fix queued); Apache-2.0 [live] | eve notes + [`log/2026-07-11-first-live-runs.md`](log/2026-07-11-first-live-runs.md) + sandbox research |
| Flue (direct) | full live loop PASSES [live]; durability 6/8 [live] with corrected observe-to-checkpoint driver — both fails are >240s timeouts (self-polling cadence + stale-SQLite boot gotcha suspected), flake analysis in flight; exactly-once held everywhere | cleanest provider story (config not agent code); most assembly required; Valibot/zod double-validation tax; build output can't load raw-TS workspace pkgs (dev-mode here; fix = build step for @demo/*); default sandbox is NOT an isolation boundary [doc]; Apache-2.0 [live] | flue notes + first-live-runs + sandbox research |
| Mastra (direct) | full live loop PASSES [live]; durability 8/8 TWICE [live] (pre- and post-caching, 152s total cached) — cleanest durability record of the three | lowest wiring friction; zod4 fine; native subagents; NO skill concept [live] (criterion 7); thin/BYO auth; no default isolation (BYO provider) [doc]; slowest boot ~6.5s; Apache-2.0 [live] | mastra notes + first-live-runs + sandbox research |
| Smithers orchestrating Eve/Flue (pattern A) | not started — blocked on direct baselines (test-plan) | — | — |
| Eve/Flue launching bounded Smithers job (pattern B) | not started — same gate | — | — |

## Open questions

- INT-27's ticket text also names Claude Agent SDK and Vercel AI SDK; Mastra
  is now covered here, those two still aren't. Reconcile on the ticket
  (evaluated elsewhere, or dropped?).
- Where the decision memo lands (sprint canonical docs + the Notion ticket —
  not only here).
