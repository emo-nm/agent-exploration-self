# Annotated roadmap — what each phase buys us

The granular plan is the handoff ([`eve-flue-smithers-codex-handoff.md`](log/2026-07-11-eve-flue-smithers-codex-handoff.md),
section 23); this doc annotates it with *the point of each step* and tracks
status. Update status markers here (and STATE.md) as phases land.

## Phase 0 — Scaffolds [done] (commit `b644873`)

**1. Scaffold monorepo + all frameworks with stock defaults.**
Fair starting line + first data: scaffold friction, versions, Node floors are
already findings (Flue's init writes one config file; Mastra ships a full demo
agent; Eve wants Node 24).

## Phase 1 — Shared framework-neutral layer [done] (findings.md Phase 2)

**2. Contracts, domain, persistence.**
Everything that isn't framework glue is written once. Same zod schemas → tool
typing compared fairly (criterion 3). Same domain functions → behavioral
differences are provably the framework's fault. Shared Postgres schema →
threads/approvals/effects live outside any framework, making lock-in
measurable (criterion 5).

**3. Deterministic fixture corpus + idempotent flaky publish effect.**
The two instruments of the experiment. The corpus removes search luck so runs
are repeatable; the flaky-but-idempotent publish (`DEMO_FAIL_PUBLISH_ATTEMPTS`,
crash-after-effect) is the probe jabbed into each framework to observe
retry/durability behavior. Idempotency keys are what make that safe to test.

## Phase 2 — Direct baselines (the core comparison) [built — unrun against a model; steps 6-7 todo]

**4. Eve baseline** — research-and-publish agent in Eve's native idiom
(filesystem `agent/`, durable session API, typed client).
**5. Flue baseline** — identical agent in Flue's idiom (hand-authored;
its scaffold is minimal).
**5b. Mastra baseline** [built] — research-and-publish agent in Mastra's native
idiom (agents + tools + native subagent via `agents` field + Memory); tools thin
over the shared layer; `@demo/mastra-adapter` added; app-owned approval (native
tool suspend/resume noted as the alternative). typecheck/tests/build pass, server
to :3003 health. Model run + Drizzle path blocked on keys/DB. Notes:
`docs/log/2026-07-11-mastra-baseline-notes.md`.
The experiment itself: same brain (shared prompts/skill), same tools, same DB
— only the framework differs. Directly scores criteria 1–4, 7, 8 (sessions,
approvals, tool typing, observability, skills, auth). Eve's auth/Connect
story gets verified [live] here.

**6. Shared comparison UI** — `apps/web`: `/direct/eve`, `/direct/flue`
(+ mastra), later `/smithers/*`; transcript, live stream, tool/subagent
activity, approval card, raw-event inspector.
The approve/resume loop needs a human surface; side-by-side streams make
differences visible instead of anecdotal. Raw inspector preserves native
events while normalized events enable comparison.

**7. Durability + failure tests.**
Verdict-generator for the headline criterion: kill mid-model-call, kill
between tool and next step, restart with approval pending, resume an old
thread, duplicate approvals/publishes (8 scenarios, test-plan). Exactly-once
publication is the pass/fail line. **GATE: no Smithers work until direct Eve
and Flue pass** — otherwise integration bugs are unattributable.

## Phase 3 — Smithers integration (both directions) [todo]

**8. Initialize the Smithers control plane** (`apps/smithers` HTTP/Gateway;
`.smithers/` authoring pack already exists).
**9. Remote-agent adapters** — `EveRemoteAgent`/`FlueRemoteAgent`
implementing `AgentLike`, with tests (preflight, cancellation, timeout,
session isolation, credential hygiene).
Pattern A: Smithers owns the run, frameworks are workers. Adapter LOC/pain is
itself a finding: how orchestratable is each framework from outside?

**10. Comparison workflow** — same prompt to Eve+Flue in parallel, blinded
reviewer scores both, metrics → `comparison_runs`.
Turns A/B comparison into a durable, repeatable pipeline — generates the
memo's quantitative table without human bias.

**11. Eve/Flue → Smithers tools** — `start_smithers_workflow` etc. over a
shared HTTP client with a fixed workflow allowlist (no arbitrary paths/URLs
from the model).
Pattern B: the realistic production topology (product agent delegates a
bounded long job). Tests the section-4 ownership rule under fire: parent
session stays live, child run does the work, nobody double-retries an effect.

## Phase 4 — Ship and decide [todo]

**12. Deployment configs** — web+Eve on Vercel, Flue on a Node host,
Smithers on a Bun container, shared Neon Postgres.
Deployment effort is a scored metric; Eve's platform advantage is only real
if measured deployed, not on localhost.

**13. Full matrix + findings + decision memo.**
The product of the repo: multiple eval runs (separate framework behavior from
model variance), scores against all 8 criteria, [live] evidence only, and a
recommendation — landing in sprint docs + the Notion ticket, not only here.

## Why this order

Each phase de-risks the next: shared layer before agents (agents stay thin),
baselines before UI (UI has something to show), tests before Smithers (the
gate), integration before deployment, everything before the memo. Commit per
phase; update findings every phase; never weaken a failing parity test.

## Standing open items

- Extend demo-agent spec + layout to Mastra (5b prerequisite).
- Eve + Flue license check (criterion 5).
- Claude Agent SDK / Vercel AI SDK: evaluated elsewhere or dropped? (ticket).
- Create Neon Postgres via Vercel Marketplace → `DATABASE_URL` (unblocks
  Drizzle-path tests and deployment).
