# Project state — the map

> Read this first. It's the index of what's current here — a map, not the
> truth; open the linked code/notes before relying on a row. If your session
> changes the verdicts or the code, update this file in the same commit.

Last updated: **2026-07-11** (all three direct baselines BUILT: same
research-and-publish agent in Eve, Flue, and Mastra native idioms + adapter
packages; typecheck/tests/build pass at root; persistence verified [live]
against local Postgres. NOT yet run against a model — no API key — so no
live agent behavior verdicts yet. Comparison UI built (/direct/*, approval
round-trip verified on Postgres [live]); durability harness in progress.
Details: [`findings.md`](findings.md); roadmap: [`plan.md`](plan.md).)

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
| Deployment | [`deployment.md`](deployment.md) | placeholder — promote when phase 4 starts |
| Findings per framework | [`findings.md`](findings.md) (from `findings-template.md`) | Phase 1 (scaffold) recorded per candidate |

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
| Eve (direct) | baseline BUILT (agent+tools+skill+subagent+eve-adapter); tests pass; served health [live]. Model loop unrun (no key) | needed sandbox pin (`justbash`) + build externalDependencies to run outside Vercel; Apache-2.0 [live] | [`log/2026-07-11-eve-baseline-notes.md`](log/2026-07-11-eve-baseline-notes.md) |
| Flue (direct) | baseline BUILT (agent+tools+skill+subagent profile+flue-adapter); tests pass; `flue dev` health [live]. Model loop unrun (no key) | Valibot-vs-zod double validation tax; `flue build` output can't load raw-TS workspace pkgs (dev-mode only for now); Apache-2.0 [live] | [`log/2026-07-11-flue-baseline-notes.md`](log/2026-07-11-flue-baseline-notes.md) |
| Mastra (direct) | baseline **built** — research-and-publish agent + native subagent + 4 thin tools + `@demo/mastra-adapter`; typecheck/tests/build pass, server to :3003 health [live] | [live] zod@4.4.3 works (peer warning only); native subagents + tool suspend/resume approval; NO SKILL.md concept (criterion 7 finding); Apache-2.0; ships scorers+observability. Model run + Drizzle path blocked (no keys/DB). See [`log/2026-07-11-mastra-baseline-notes.md`](log/2026-07-11-mastra-baseline-notes.md) | scaffolded Node 24; baseline notes |
| Smithers orchestrating Eve/Flue (pattern A) | not started — blocked on direct baselines (test-plan) | — | — |
| Eve/Flue launching bounded Smithers job (pattern B) | not started — same gate | — | — |

## Open questions

- INT-27's ticket text also names Claude Agent SDK and Vercel AI SDK; Mastra
  is now covered here, those two still aren't. Reconcile on the ticket
  (evaluated elsewhere, or dropped?).
- Where the decision memo lands (sprint canonical docs + the Notion ticket —
  not only here).
