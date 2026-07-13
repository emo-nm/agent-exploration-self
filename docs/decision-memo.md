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

## Reframe (07-13, James): the question is iteration speed x correctness

Direction: assume all three CAN do the product. The real question is which
lets us iterate fastest, most correctly, in the least time — and Eve's
benefits are unknowable until it runs hosted on Vercel. Scoring the
reframed criteria:

**Agents scoped to users (permissions over their data).** No framework does
data permissions for you — in all three, sessions are keyed by IDs we mint,
so "user A can't touch user B's threads/data" is our middleware plus an
ownership column, identical code everywhere [live-shaped: that's how all
three apps here are built]. Differences at the edges: Flue documents the
cleanest pattern (`app.use('/agents/*', requireUser)` — it's just Hono
middleware) [doc]; Mastra is the same BYO; Eve on Vercel claims integrated
user identity on sessions [doc] — potentially the least glue, but
unverified and lock-in-shaped. Verdict: near-tie locally; Eve MAY win in
the Vercel env — deploy test decides.

**Observability / persistence / retries — pre-set-up UX.**
- Locally measured: Mastra has the best dev-loop visibility (playground,
  storage you can open) [live]; Flue has the best audit substrate (durable
  materialized history + per-submission settlement records) [live]; Eve
  local was the most opaque — diagnosing its queue behavior took us a
  server-log archaeology session [live].
- Eve's whole pitch is that the HOSTED env flips this: platform dashboard,
  traces, queue management pre-integrated [doc]. That is exactly the
  unverified claim the deploy test exists for.
- Retries: Flue recovers autonomously and conservatively [live]; Mastra
  leaves retry of a dropped turn to the caller [live]; Eve local retried
  dead work forever [live, local-only].

**Workflows, expressiveness, typing, MDX, TS DX.**
- Typing: Mastra is zod4-native end to end — schemas in, typed tools out,
  no translation layer; the best DX of the three [live]. Flue pays a
  valibot/zod double-validation tax at every tool boundary [live]. Eve is
  TS-first and fine, filesystem-first agent layout [live].
- Workflow engines: all three ship one (Mastra workflows with
  suspend/resume, Eve's workflow world, Flue's detached workflows) — we
  exercised none of them in anger [not live]; this matters because
  framework-native workflows may cover our pipeline needs without Smithers.
- MDX/typed prompts: NONE of the three has typed-MDX prompts natively.
  Eve and Flue treat markdown skills as first-class files [live]; Mastra
  has no skill/prompt-file concept at all [live] — we generated its
  instructions from our own prompts package. (Smithers, notably, DOES have
  .mdx prompt components — an argument for keeping prompts in our own
  neutral package regardless, which is what we did.)
- Measured iteration proxy (time-to-working-agent during the build phase):
  Mastra fastest, Eve middle, Flue slowest (most assembly, plus its build
  can't load raw-TS workspace packages) [live].

**Reweighted bottom line.** Under "velocity x correctness":
- **Mastra** wins raw iteration speed and typing DX today [live], at the
  cost of owning more durability discipline ourselves (client-driven
  turns; we'd lean on its workflow engine).
- **Flue** wins correctness-by-construction [live], at a real velocity tax.
- **Eve** is the only one whose main value proposition is still unmeasured
  — it lives in the hosted env. If Vercel-hosted Eve delivers pre-wired
  observability, auth glue, sandbox, and sane queue behavior, it plausibly
  wins the overall question despite lock-in; if not, the answer is
  Mastra-for-velocity vs Flue-for-correctness, leaning Mastra given the
  reframe.
The deploy test is therefore not a formality — it's the deciding match.
**The repo is deploy-ready for it**: `apps/eve` builds clean
(`pnpm --filter eve build` → `.output/`, Vercel-native), runbook in
`docs/deployment.md`.

**Smithers, scoped to what matters:** works with Flue and Mastra [live —
pattern A ran both in parallel under one durable run; pattern B had the
Flue agent launch a bounded run via an allowlisted tool]. Eve would slot
into the same HTTP-worker shape via the adapter that already exists [inf].
Does it make sense here? Only when jobs span agents/backends and need
ops-grade run management; for a single app's pipelines, each framework's
OWN workflow engine likely suffices first. Park Smithers as an optional
layer; details in log/2026-07-13-smithers-patterns-live.md.

## The deciding match: Eve hosted on Vercel — RESULTS (07-13, all [live])

We deployed Eve to Vercel production (project `native-money/eve`, Neon
Postgres via the marketplace) and ran the loop for real. Everything below
happened first-hand against the deployed app.

**What passed:**
- Full loop hosted: real research turn (14.9s), corpus search, durable
  session; seeded approval in Neon; the deliberately-flaky publish failed
  twice ON VERCEL and succeeded on the third attempt with EXACTLY ONE
  effect row in Neon. The core correctness invariant holds hosted.
- **The decisive durability probe:** started a turn, confirmed model work
  in flight, then REDEPLOYED PRODUCTION mid-turn (a real instance
  replacement — prod's version of our SIGKILL tests). Reattached to the
  same session on the NEW deployment: complete answer, 22 events, in
  **2.7 seconds**. The turn had finished server-side despite the redeploy.
  The local "poison queue storm" defect DOES NOT EXIST hosted — it was a
  local-world artifact, exactly as we'd hypothesized and refused to score
  until proven.
- Auth is genuinely pre-wired and ENFORCED: Vercel SSO protects
  deployments by default (zero config), and eve refuses production
  traffic on placeholder auth (observed 401). Wiring a real service-token
  provider was ~20 lines. Criterion 8 answered.
- Deploy effort: about an hour from zero to validated prod, including the
  findings below. Neon provisioning was two clicks + CLI.

**What it cost (the lock-in taxes, all found live during this deploy):**
1. Eve's channel bundler requires one chunk per authored module — it could
   NOT load our shared raw-TS `@demo/voice` package (works in `eve dev`,
   fails in `eve build`). We had to inline the voice channel. Same family
   as the caching finding: leave eve's happy path and shared code breaks.
2. The checked-in root vercel.json (web app's) hijacks the build; eve needs
   its own config passed explicitly (`-A apps/eve/vercel.json`).
3. Everything good about hosted eve (queue durability, SSO, sandbox,
   dashboards) is Vercel infrastructure, not portable framework behavior.

## FINAL RECOMMENDATION (for the team)

**Build the product on Eve + Vercel, behind our owned framework-neutral
core.** This reverses the pre-deploy lean toward Flue, for one decisive
reason plus one practical one:

- Hosted eve measured BEST-IN-TEST on the property we care most about:
  crash/redeploy recovery in 2.7s (vs Flue's ~33s hard-coded takeover wait
  and Mastra's client-owned turns), with exactly-once intact and auth
  enforced by default.
- We are not going to operate a Node host, a Bun container, and a database
  for this (James, 07-13: nothing gets hosted outside Vercel — no time).
  That constraint eliminates Flue's deployment story in practice, whatever
  its architectural merits. An architecture we won't operate isn't an
  option; it's a slide.

The lock-in is real — three concrete escape-hatch taxes measured — and the
mitigation is the structure we already proved: contracts, effects
(idempotency), persistence, approvals, prompts, and the usage/cost event
all live in OUR packages; eve touches them through thin adapters. We built
the same agent three times in days with that layout; that is the walk-away
insurance if Vercel pricing/behavior turns against us. Keep the durability
suite green in CI against the deployed app so the insurance stays honest.

**Runner-ups, honestly stated:** Mastra remains the velocity pick and the
first candidate if we ever leave Vercel (best DX, cleanest matrix record,
native voice module — but client-driven turns mean we'd own more
durability discipline). Flue remains the correctness-by-construction pick
for a team willing to operate its host — we weren't. Smithers: optional
pipeline layer, proven working against all three; revisit when jobs span
agents.

## What happens next

1. Copy this memo to the sprint board / Notion ticket (INT-27; note Claude
   Agent SDK + Vercel AI SDK named on the ticket remain unevaluated here).
2. Point the durability suite at the deployed eve on a schedule
   (EVE_BASE_URL + service token; redeploy-mid-turn as the kill).
3. Product auth: swap the service-token AuthFn for Clerk/Auth.js + thread
   ownership column (schema already has the fields).
4. Keep the usage/cost event flowing into whatever observability stack the
   team standardizes on (it's already normalized at the contracts layer).
