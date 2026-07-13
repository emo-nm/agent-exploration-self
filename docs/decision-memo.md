# Decision memo: agent framework for the wealth-management product (INT-27)

2026-07-13. Verdicts from first-hand runs in this repo ([live]) unless
tagged [doc]. Method: identical agent built in Eve, Flue, and Mastra over a
shared framework-neutral core; identical 8-scenario durability suite,
identical model/key/database. Full evidence:
`docs/log/2026-07-12-durability-matrix-results.md`.

## The recommendation

**Flue for the durable agent core, structured so we can walk away from it.**
Runner-up: Mastra, if we decide iteration speed outweighs its architectural
durability gap. Eve: not worth it unless we decide to go all-in on Vercel
as our platform — its best features are inseparable from that commitment.

One validation required before final commitment (not tonight): run the same
suite against prod-shaped deployments (Flue on a real Node host, Eve on
Vercel). Everything below is measured locally; local-environment artifacts
are excluded from scoring per James's direction.

## How to structure it (this is the strongest finding of the whole eval)

Own the core, rent the framework. In this repo the agent's contracts,
domain logic, side effects, persistence, and prompts are framework-neutral
packages; each framework touches them only through ~20-line tool wrappers.
That's why we could build the SAME agent three times in days. Ship the
product the same way:

- `contracts` (zod), `effects` (idempotent, keyed side effects — this is
  what made exactly-once hold in every scenario on every framework),
  `persistence` (our Postgres, our approval rows), `prompts/skills` — ours.
- The framework is a replaceable runtime behind a thin adapter. Migration
  cost stays days, not months. For a wealth-management product this is the
  real risk control: no framework bet becomes a rewrite.
- Approvals stay application-owned (a DB row a human flips), never
  framework-owned. We proved this works identically on all three; it is
  also the compliance-shaped choice — the audit trail lives in OUR
  database regardless of runtime.

## Scorecard against what we need

**Durable.** Exactly-once side effects held in EVERY scenario on EVERY
framework [live] — the shared idempotent-effects layer deserves most of the
credit; all three are compatible with it. Architecture differs though:
- Flue: strongest model. Turns are durable server-side submissions with
  strict per-session ordering and autonomous crash-recovery (verified in
  its source and live: kill -9 mid-turn, the turn resumes and completes by
  itself ~30s later, nothing lost). Client can vanish; work continues.
- Eve: same server-side durability model [live], equally real.
- Mastra: cleanest test record (8/8 three times) BUT turns are driven by
  the client's HTTP request — a dropped caller can kill a turn mid-flight.
  For long money-adjacent operations that's the wrong default; you'd adopt
  their separate workflow engine to compensate.

Crash-recovery overhead (time from process death to a working conversation,
minimal turn): Mastra ~10-20s, Flue ~33s (a hard-coded 30s watchdog — not
tunable without patching), Eve locally unbounded (its local queue melts
down after a mid-turn kill; explicitly NOT counted against Eve here since
prod Eve runs Vercel's hosted queues — deploy-phase question).

**Observable.** All three emit streamable events our UI renders with raw
framework payloads preserved [live]. Flue stands out for audit: its
conversation history is a durable materialized read with explicit
settlement records per submission — closest thing to a built-in audit log
of the three, a real asset for a regulated product. Cost/token
observability is nobody's strength out of the box; we built it ourselves
(`@demo/model` caching wrapper + `check:caching`) and would productionize
that pattern (normalized usage event per turn) regardless of framework.
Watch item: Eve silently sheds platform defaults (prompt caching, context
management) when pointed at a non-Vercel model path — it still works, just
degrades quietly. That's an observability hazard as much as a cost one.

**Flexible.** Mastra is the most bring-your-own (any provider, any store,
zod-native, lowest wiring friction [live]). Flue is config-driven and
clean but wants its own validation library (valibot) at the edges and its
build can't consume raw-TS workspace packages (needs a build step — an
annoyance, not a blocker [live]). Eve is the least flexible by design:
its best features (sandbox, auth, queues) are Vercel platform features.

**Powerful.** Skills: Eve and Flue have first-class skill/instruction
packaging [live]; Mastra has NO skill concept [live] — we generated its
instructions from our own prompts package, which works but means we own
that layer entirely. Subagents: all three, all verified live. Sandboxing:
Eve is the only one with isolated-by-default execution in prod (microVM)
[doc]; Flue/Mastra run tools on the host unless we bring isolation. For a
wealth app, tool sandboxing is likely something we want explicitly designed
regardless — treat Eve's default as a convenience, not a differentiator.

## Direct answers

**Is Eve worth it?** Only as a platform decision, not a framework decision.
If we commit to Vercel end-to-end, Eve buys real things: the most
product-shaped approval pause, default sandboxing, integrated auth/queues.
Off that path it quietly loses its advantages (the silent-degradation
finding) and carries the deepest lock-in. We are structuring specifically
to avoid platform bets, so: no.

**Is Flue good?** Yes — architecturally it is the best match for this
product: durable ordered submissions, autonomous recovery, settlement-based
audit history, and it passed the full suite once budgets reflected its
design. Its real costs: it's a beta (1.0.0-beta.9), it's the most assembly
required, and its 30s recovery constant is hard-coded. Those are maturity
costs, not design flaws. Given "transient failures aren't a reason not to
use it" (James, 07-13), the 30s recovery latency is acceptable: it's the
price of never double-executing, which for money workflows is the right
side of the trade.

**Is Mastra actually what we need?** It's what we'd *enjoy* — best DX,
cleanest test record, most flexible — but its durability is
request-scoped by default, which is the one property this product can't
compromise on. Choosing Mastra means also adopting its workflow engine for
anything long-running, at which point its simplicity advantage shrinks.
Keep it as the runner-up; our shared-core structure means switching to it
later is cheap if Flue's beta maturity bites.

**Auth.** James is right that there's no real auth test here, and mostly
there can't be: for Flue and Mastra, auth is simply not framework territory
— sessions are keyed by IDs we mint, so user identity, thread ownership,
and "can A resume B's thread" are OUR middleware's job (same code
regardless of framework — not a differentiator, nothing to bake off). The
only framework with an opinion is Eve, whose auth is Vercel-integrated
[doc] — testable only by deploying, and it's lock-in-shaped anyway. So:
drop auth as an eval criterion, spec it as product middleware (JWT/session
check in front of the agent routes + ownership column on threads — the
schema already has thread ownership fields ready).

## What happens next (in order, none of it tonight)

1. Prod-shaped validation: deploy Flue to a Node host + Eve to Vercel, run
   the suite remotely (redeploy-mid-turn replaces SIGKILL). Confirms the
   recommendation or promotes Mastra.
2. Productionize the usage/cost event (approved 07-12) into the winner.
3. Smithers orchestration patterns against the winner (pattern A/B from the
   test plan) — deliberately after the framework choice, not before.
4. Memo copy to the sprint board / Notion ticket (INT-27; note Claude Agent
   SDK + Vercel AI SDK named on the ticket remain unevaluated here).
