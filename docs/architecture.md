# Architecture (living spec)

Promoted from the historical handoff (`log/2026-07-11-eve-flue-smithers-codex-handoff.md`,
sections 2-6, 8-12) and extended to cover Mastra. This doc wins on conflict.

## Systems model

- **Eve** — filesystem-first durable agent framework (agent under `agent/`:
  instructions, tools, skills, subagents, channels). Durable HTTP session API,
  typed `eve/client`. Deep Vercel integration (Workflows, Sandbox, AI Gateway,
  Connect).
- **Flue** — programmable TypeScript agent harness: persistent agents, finite
  workflows, tools, skills, subagent profiles, SDK clients, Node/Cloudflare
  targets. More explicit, infrastructure-selectable.
- **Mastra** — TypeScript agent framework (added to scope 07-10): agents +
  zod tools + durable workflows with suspend/resume, memory/storage, built-in
  scorers/evals. No first-class skill concept known — verify (criterion 7).
- **Smithers** — durable agent-workflow runtime; runs SDK/CLI agents through
  an `AgentLike` interface, persists steps, pauses for approvals, retries,
  streams, rewinds/forks. NOT a candidate — an orchestration layer tested in
  combination (patterns A and B), never in the baseline request path.

## Ownership rule (standing constraint)

Exactly one system owns durability for any operation.

- **Smithers-owned run (pattern A):** Smithers owns graph/retries/approvals/
  state; Eve/Flue/Mastra do one bounded worker generation per task.
- **Framework-owned session (pattern B):** the framework owns the user
  conversation and tool loop; Smithers owns only a bounded child workflow
  launched by an allowlisted tool.
- Never both. The shared effect service requires an idempotency key with a DB
  unique constraint, so even a violation cannot double-fire a side effect.

## Shared demo agent (identical in Eve, Flue, and Mastra)

Research-and-publish agent. Behavior:

1. accept a research request; clarify only if unusably ambiguous;
2. generate a short research plan;
3. delegate one focused subtask to a subagent (Mastra: nearest equivalent —
   agent-as-tool or workflow step; record the delta);
4. use the deterministic fixture-corpus tool (no live web in baseline);
5. produce a structured draft;
6. request application-owned approval before publication;
7. publish through the intentionally flaky but idempotent effect;
8. survive interruption/restart; continue later in the same session;
9. report final artifact + effect receipt.

Shared brain: instructions + SKILL content come from `@demo/prompts`; tools
are thin wrappers (validate with `@demo/contracts` → call `@demo/domain` /
`@demo/effects` with a repo from `@demo/persistence`). Framework-specific
code stays thin — the thinness is a scored metric.

Tools per framework: search_fixture_corpus, create_publication_proposal,
get_publication_status, publish_artifact (+ start_smithers_workflow in
phase 3). Approval is application-owned in the baseline (proposals table
status flip); framework-native approval (e.g. Mastra suspend/resume, Eve
durable approval) is a separate later demonstration, kept out of baseline
scoring.

## Layout and topology

Monorepo: `apps/{web,eve,flue,mastra,smithers}` + `packages/{contracts,
domain,effects,persistence,prompts,evals,eve-adapter,flue-adapter,
mastra-adapter,smithers-adapters}` + `.smithers/` authoring pack.

Local ports: web 3000, Eve 3001, Flue 3002, Mastra 3003, Smithers 7331,
shared Postgres via `DATABASE_URL` (Neon in prod; in-memory repo double for
tests when unset).

Deployed: web+Eve on Vercel; Flue on a persistent Node host; Smithers as a
Bun container; shared Neon Postgres. Do not force everything onto Vercel —
the web app proxies all runtimes behind one UI.

## Web comparison UI

One Next.js app, modes: `/direct/eve`, `/direct/flue`, `/direct/mastra`,
`/smithers/compare`, `/smithers/child-job`. Direct modes share one surface:
thread selector, transcript, live event stream, tool + subagent activity,
pending-approval card with approve/deny, final artifact, backend badge.
Events are normalized to `@demo/contracts` agent-events for comparison, with
a raw native-event inspector preserved per framework.
