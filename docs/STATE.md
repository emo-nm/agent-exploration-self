# Project state — the map

> Read this first. It's the index of what's current here — a map, not the
> truth; open the linked code/notes before relying on a row. If your session
> changes the verdicts or the code, update this file in the same commit.

Last updated: **2026-07-13c** (EVE DEPLOYED TO VERCEL PROD [live]: full hosted loop passed (exactly-once on Neon); redeploy-mid-turn -> same-session reattach in 2.7s — local replay-storm defect confirmed HOSTED-ONLY-ABSENT; auth enforced (placeholder 401s in prod, service-token AuthFn ~20 lines). FINAL RECOMMENDATION FLIPPED TO EVE+VERCEL (memo): hosted eve best-in-test on recovery + team won't operate non-Vercel hosts; owned neutral core = walk-away insurance. usage/cost event normalized across all 3 [live]; voice loop built 3x + verified live; smithers 3-way compare incl. EVE [live] with verdict persisted to comparison_runs. all three baselines pass the FULL LIVE loop
[live]. Prompt caching fixed + measured (@demo/model). Comparison UI built.
Durability: mastra 8/8, eve 7/8, flue 6/8 — exactly-once held everywhere.
Scenario-1 (kill-mid-turn) resolved by a 600s rerun on clean stores:
**flue is SLOW not stuck** (passes at 260.9s), **eve is STUCK** (fails at
600s — poison-message replay storm confirmed as a hard defect in its local
world). NEW PRODUCT BAR (user, 07-13): crash-resume must complete in <=60s;
harness now encodes it (SETTLE_TURN_MS=60s). Suite made fast + parallel
(short durability turn, per-backend DBs, `scripts/eval-durability-all.sh`;
all three in ~2.5 min). FAST-SUITE MATRIX under the bar: **flue 8/8**
(99s — earlier fails were turn-length; fixed ~45s recovery overhead, so
real-length turns still exceed the bar), **mastra 8/8** (83s, third
consecutive), **eve 6/8** (s1 replay-storm defect + s4 collateral: the
storm degrades later resumes). Smithers gate ruling superseded 07-13: user reframed transient/local
failures as non-disqualifying, so Smithers phase ran (after the memo, by
design) — patterns A+B live, 3-way compare incl. Eve, verdicts persisted.
Canonical results: log/2026-07-12-durability-matrix-results.md.
**DECISION MEMO FINAL: [`decision-memo.md`](decision-memo.md)** —
Eve+Vercel behind our owned framework-neutral core (flipped from the
pre-deploy Flue lean by the hosted results above + the no-external-hosting
constraint). Mastra = velocity runner-up / exit candidate; Flue =
correctness pick for a team that operates hosts. Auth: product middleware,
not framework territory (eve's service-token AuthFn measured at ~20 lines).
Next: memo to sprint board/Notion (INT-27).
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
| Deployment | [`deployment.md`](deployment.md) | Eve DEPLOYED to Vercel prod [live] 07-13 (native-money/eve + Neon); full hosted loop + redeploy-mid-turn validated; flue/mastra/smithers local-only by scope decision |
| Sandbox/isolation comparison (Eve microVM default vs Flue/Mastra BYO) | [`log/2026-07-12-sandbox-research.md`](log/2026-07-12-sandbox-research.md) | [doc] researched 07-12 — only Eve isolates by default in prod; justbash pin removed 07-13 |
| Smithers integration (patterns A+B live, 3-way compare, observability answer) | [`log/2026-07-13-smithers-patterns-live.md`](log/2026-07-13-smithers-patterns-live.md) | [live] 07-13 — use LOCAL .smithers CLI, global has React clash |
| Voice loop 3x (@demo/voice seam; mastra native vs eve/flue BYO) | [`log/2026-07-13-voice-wiring.md`](log/2026-07-13-voice-wiring.md) | [live] 07-13 — criterion 6 closed |
| Normalized usage/cost event (all 3 adapters + UI + evals) | [`log/2026-07-13-usage-event.md`](log/2026-07-13-usage-event.md) | [live] 07-13 — mastra exposes no cost on stream (finding) |
| DECISION MEMO (FINAL: Eve+Vercel behind owned neutral core; hosted deciding-match results) | [`decision-memo.md`](decision-memo.md) | FINAL 07-13 — next: copy to sprint board/Notion |
| Findings per framework | [`findings.md`](findings.md) (from `findings-template.md`) | phases 1-3 recorded per candidate |
| Learnings synthesis (through first live runs + first matrix) | [`log/2026-07-12-learnings-so-far.md`](log/2026-07-12-learnings-so-far.md) | snapshot 07-12 — headline: all three complete the loop [live]; Eve escape-hatch/lock-in finding; Flue driver invalidated its first matrix; Mastra 8/8 credible |

## Criteria (from INT-27 — score each candidate on these in the memo)

1. Long-lived conversations that pause/resume across days
2. Human-approval steps (a pending action that waits for a yes)
3. Typed tool interfaces
4. Eval/observability hooks
5. Lock-in — how hard to walk away, incl. license. All three Apache-2.0
   [live] (checked 07-12). Behavioral lock-in differs: see memo (Eve deepest;
   the shared-core structure is the mitigation)
6. Can it host a live voice loop? — BUILT 3x + [live] 07-13: shared
   @demo/voice seam (AI SDK tts-1/whisper-1); Mastra wired via its NATIVE
   voice module (CompositeVoice — only framework with one, but it does NOT
   auto-expose HTTP routes, and its voice types lag on AI SDK v5); Eve and
   Flue have NO voice concept — each got a thin BYO /voice/turn endpoint.
   Live: seam round-trip exact (5.3s), and a full spoken-question ->
   agent-turn -> spoken-answer loop against flue :3002 [live]. Finding:
   voice is app work everywhere; mastra only wins the speech-provider glue.
   See log/2026-07-13-voice-wiring.md.
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
| Eve (direct) | full live loop PASSES [live]; durability 6/8 under the 60s bar [live] — REAL defect: SIGKILL mid-turn leaves forever-replaying poisoned queue messages in the local world, degrading resume (isolated repro proves clean crash-resume works otherwise, 12.9s); scenario-5 fail was our adapter cursor bug (fixed) | direct-provider path sheds platform defaults silently (caching, subagent provider, ctx window) — top lock-in finding; native input.requested approval pause is the most product-shaped; only framework with isolated-by-default prod sandbox (microVM) [doc]; justbash local pin REMOVED 07-13 (stock defaults restored; build verified); Apache-2.0 [live] | eve notes + [`log/2026-07-11-first-live-runs.md`](log/2026-07-11-first-live-runs.md) + sandbox research |
| Flue (direct) | full live loop PASSES [live]; durability **8/8 under the 60s bar** [live] with the fast suite (crash-resume 56.7s) — earlier fails were turn-length: recovery overhead is fixed ~45s, so real-length turns exceed the bar (260.9s measured); exactly-once held everywhere | cleanest provider story (config not agent code); most assembly required; Valibot/zod double-validation tax; build output can't load raw-TS workspace pkgs (dev-mode here; fix = build step for @demo/*); default sandbox is NOT an isolation boundary [doc]; Apache-2.0 [live] | flue notes + first-live-runs + sandbox research |
| Mastra (direct) | full live loop PASSES [live]; durability 8/8 TWICE [live] (pre- and post-caching, 152s total cached) — cleanest durability record of the three | lowest wiring friction; zod4 fine; native subagents; NO skill concept [live] (criterion 7); thin/BYO auth; no default isolation (BYO provider) [doc]; slowest boot ~6.5s; Apache-2.0 [live] | mastra notes + first-live-runs + sandbox research |
| Smithers orchestrating the frameworks (pattern A) | DONE [live] 07-13: flue-research workflow (settled Flue turn -> durable Approval -> refine on same thread); compare-backends fans the same prompt to ALL THREE in parallel, blinded 3-way judge, verdict persisted to comparison_runs (row cmp_run-1783924514000) | adapter pain finding: Flue ~1 HTTP call (?wait=result), Mastra ~25 lines (thread+SSE), Eve NDJSON session stream; all fit in compute tasks | [`log/2026-07-13-smithers-patterns-live.md`](log/2026-07-13-smithers-patterns-live.md) |
| Product agent launching bounded Smithers job (pattern B) | DONE [live] 07-13: Flue tool start_smithers_workflow (fixed allowlist) spawned a detached compare run; parent session stayed live, child run finished independently — section-4 ownership rule held | expected prod topology per memo: framework owns the conversation, Smithers runs own the jobs | same log |

## Open questions

- INT-27's ticket text also names Claude Agent SDK and Vercel AI SDK; Mastra
  is now covered here, those two still aren't. Reconcile on the ticket
  (evaluated elsewhere, or dropped?).
- Where the decision memo lands (sprint canonical docs + the Notion ticket —
  not only here).
