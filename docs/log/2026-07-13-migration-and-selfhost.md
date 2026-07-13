# Two follow-ups for the team (2026-07-13)

Asked by James after the final memo: (1) a concrete migration walkthrough
for OUR product shape (Plaid OAuth, bank OAuth, compliance approvals), and
(2) what it would take to make self-hosted Flue feel like hosted Eve does.

## 1. The walk-away walkthrough (wealth-management shaped)

The product agent: client chats; connects brokerage/bank via Plaid OAuth;
agent reads holdings; drafts a rebalance proposal; compliance approves; a
transfer executes exactly once. Built on Eve today. Suppose in March we
must leave (pricing, deprecation, policy). With the owned-core layout:

**Does NOT move (ours):**
- Plaid/bank OAuth end to end. The callback route is OUR middleware; access
  tokens encrypted in OUR Postgres keyed by userId; tools receive {userId}
  and resolve tokens server-side from our vault. The framework never sees a
  credential -> migration touches zero tokens; NO user re-consents or
  re-links accounts. (The trap avoided: storing connections in the
  framework/platform OAuth store means leaving = every client re-linking
  every account. That silently turns "we can leave" into a lie.)
- executeTransfer(idempotencyKey) + exactly-once discipline (packages/
  effects) — the mechanism that held in all 24 durability runs here.
- Compliance approvals + audit trail (our DB rows; regulators ask us).
- Contracts (zod), prompts, normalized usage/cost event, and the
  durability suite — which already has drivers per framework and becomes
  the migration's ACCEPTANCE TEST.

**Moves (the framework shell):**
- 4 tool wrappers (~20 lines each — measured in all three apps here).
- 1 agent definition (~50 lines).
- 1 session adapter (start/continue/stream; the packages/*-adapter files
  here are 200-400 lines).
- Re-mount auth middleware + voice endpoint on the new server's routes.
- Rerun the 8-scenario matrix until green.

Evidence this is real: this repo built the same agent three times in days
with exactly this layout.

## 2. Report: standing up Flue to feel like hosted Eve

What Vercel silently gives hosted Eve (all measured this week): 39s
git-push deploys w/ instant rollback aliases; TLS/domains; SSO deployment
protection BY DEFAULT (+ bypass tokens); hosted durable queue that
survived redeploy-mid-turn (2.7s same-session reattach); one-click Neon w/
env injection; secrets; log/trace dashboards; autoscaling; microVM tool
sandbox. Measured cost to get there: ~1 hour.

To match with Flue we would stand up:
1. Persistent host (Fly/Railway/Render container) — flue is a long-lived
   stateful server; serverless is out by design.
2. Durable state: volume + backups for its runtime store (verify its
   beta Postgres-backed option); we measured a stale-SQLite crash-boot
   gotcha (503s >60s after a hard kill on a cold start).
3. Deploy pipeline: Dockerfile, CI, health-gated rollout, graceful
   SIGTERM drain, rollback drills.
4. Auth: our middleware on /agents/* + service tokens (we'd write this
   anyway; but nothing is protected by default).
5. Observability: log shipping, metrics, alerting, dashboard (flue has a
   great audit API, no console).
6. Recovery tuning: the 30s takeover wait is a hard-coded constant
   (FLUE_AGENT_SUBMISSION_WAKE_SECONDS, dist/internal.mjs). We verified
   we're on latest (1.0.0-beta.9 = dist-tag latest); upstream has adjacent
   issues (#457 stale-attempt-marker recovery block, #425 stranded
   terminalization) but nothing on this; we patched the constant
   env-overridable via pnpm patch (patches/@flue__runtime.patch). ROOT
   CAUSE PINNED + VALIDATED [live]: on the Node target the wait is a
   dead-man's-switch lease — LEASE_DURATION_MS=30s renewed by a 10s
   heartbeat; after SIGKILL the boot reconcile SKIPS still-leased
   submissions (anti-double-execution) and a 15s periodic lease scan
   re-drives after expiry, so worst case = lease remainder + scan (matches
   observed 32-37s). Tuning via the patch (lease 5s / heartbeat 2s / scan
   2s): resume-turn 37s -> 12.1s, scenario total 19.9s — PASSES the 60s
   bar with a real margin. My first patch hit the Cloudflare coordinator's
   FLUE_AGENT_SUBMISSION_WAKE_SECONDS — wrong target for the Node runtime
   (a finding about the dual-target codebase in itself). Upstream issue
   filed asking to expose the knobs / add a single-owner boot fast path.
7. Tool sandbox: bring our own isolation (container/gVisor); flue's
   default sandbox is not an isolation boundary.

Estimate: 2-4 engineer-days for a first respectable stand-up; 1-2 weeks
to be genuinely Eve-like (drain, rollback drills, redeploy-survival
testing, dashboards). Then a permanent operational commitment: disk,
upgrades, restarts, pager. That standing cost is why "flue has the best
durability architecture" and "we should run flue" are different claims.
Eve's advantage isn't the framework — it's that Vercel is the platform
team we don't have to hire. The owned core keeps that from becoming a
trap.
