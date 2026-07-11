# Eve vs. Flue Evaluation Repo — Codex Handoff

**Date:** July 11, 2026  
**Goal:** Build one repository that compares Eve and Flue as product-agent frameworks, while also demonstrating how Smithers can orchestrate either framework and how either framework can launch a bounded Smithers workflow.

## 1. Objective

Create a working, documented monorepo that answers:

1. How do Eve and Flue compare when implementing the same durable product agent?
2. Which differences come from the framework versus the surrounding platform?
3. What is the practical migration boundary between them?
4. How can Smithers integrate with both without conflating the baseline comparison?
5. Which stack is preferable for a user-facing product agent, and which pieces should remain framework-neutral?

The primary comparison is **Eve vs. Flue**. Smithers is a separate orchestration layer and must not be inserted into the baseline request path.

## 2. Working model of the three systems

### Eve

Eve is a filesystem-first durable agent framework. An agent is authored under `agent/` with instructions, tools, skills, subagents, connections, channels, schedules, and sandbox configuration. It exposes a durable HTTP session API and a typed `eve/client` client. On Vercel, it integrates closely with Workflows, Sandbox, AI Gateway, Connect, and Agent Runs.

### Flue

Flue is a programmable TypeScript agent harness. It has persistent agents, finite workflows, tools, skills, subagent profiles, sandboxes, schedules, SDK clients, and Node/Cloudflare targets. It is more explicit and infrastructure-selectable than Eve.

### Smithers

Smithers is a durable agent-workflow runtime. It can execute SDK and CLI agents through a common `AgentLike` interface, persist workflow steps, pause for approvals, retry, stream events, and rewind or fork runs.

There is no known first-party Smithers-to-Eve or Smithers-to-Flue adapter. Implement thin local adapters.

## 3. Important integration conclusion

Implement two distinct integration directions.

### A. Smithers owns orchestration; Eve or Flue is a worker

Implement:

- `EveRemoteAgent implements AgentLike`
- `FlueRemoteAgent implements AgentLike`

A Smithers `<Task>` can then use either framework as its agent worker.

Use this for:

- side-by-side A/B runs;
- parallel independent answers;
- model/framework review workflows;
- fallback experiments;
- durable evaluation pipelines.

### B. Eve or Flue owns the conversation; Smithers runs a bounded child job

Add equivalent narrow tools to both agents:

- `start_smithers_workflow`
- `get_smithers_run`
- `submit_smithers_approval`
- optionally `cancel_smithers_run`

These call the Smithers HTTP server.

Use this for:

- a product agent delegating a long-running bounded operation;
- a user-facing session launching an implementation/research workflow;
- preserving the product agent conversation while Smithers owns the child workflow.

### MCP caveat

For this repo, use the Smithers HTTP server rather than MCP for Eve/Flue → Smithers.

Smithers’ built-in MCP server is documented as a **stdio** server. Eve’s MCP connection expects a remote Streamable HTTP or SSE server, and Flue’s `connectMcpServer()` also expects a remote HTTP/SSE endpoint. A transport bridge could be added later, but it is unnecessary for the initial demo.

## 4. Ownership rule: avoid nested durability confusion

For every operation, designate one owner.

### Smithers-owned run

Smithers owns:

- workflow graph;
- retries;
- approvals;
- run state;
- task sequencing.

Eve or Flue performs one bounded worker generation per Smithers task.

### Eve/Flue-owned session

Eve or Flue owns:

- user conversation;
- session continuity;
- agent tool loop;
- product-facing stream.

Smithers owns only the bounded child workflow launched by a tool.

### Never do this

Do not allow Smithers and Eve/Flue to independently retry the same external side effect. The shared effect service must require an idempotency key and enforce uniqueness in the database.

## 5. Repository layout

Use a Turborepo-style monorepo. Prefer `pnpm` at the root. Smithers code may execute under Bun while using dependencies installed in the workspace.

```text
eve-flue-smithers-demo/
├── apps/
│   ├── web/                         # Next.js comparison UI; deploy to Vercel
│   ├── eve/                         # Eve agent application
│   ├── flue/                        # Flue Node service
│   └── smithers/                    # Smithers Gateway/HTTP control plane
│
├── packages/
│   ├── contracts/                   # shared Zod schemas and API contracts
│   ├── domain/                      # framework-neutral business operations
│   ├── effects/                     # idempotent external-effect service
│   ├── persistence/                 # Drizzle schema/client
│   ├── prompts/                     # shared behavioral requirements
│   ├── evals/                       # common test cases and scoring
│   ├── eve-adapter/                 # web/server client for Eve
│   ├── flue-adapter/                # web/server client for Flue
│   └── smithers-adapters/           # AgentLike wrappers for Eve and Flue
│
├── .smithers/                       # Smithers authoring pack/skills
├── docs/
│   ├── architecture.md
│   ├── test-plan.md
│   ├── findings-template.md
│   └── deployment.md
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── README.md
```

If Eve’s scaffold strongly expects a project-root `agent/` directory, preserve its generated layout inside `apps/eve` rather than forcing an abstraction that fights the framework.

## 6. Runtime topology

### Local

```text
Next.js web            http://localhost:3000
Eve                    http://localhost:3001
Flue                   http://localhost:3002
Smithers HTTP/Gateway  http://localhost:7331
Postgres               shared product/effect data
```

Use separate ports and one root `pnpm dev` command.

### Deployed

```text
Vercel:
  apps/web
  apps/eve

Persistent Node/container host:
  apps/flue

Bun-capable container initially:
  apps/smithers

Shared managed Postgres:
  product records, approvals, effects, comparison metrics
```

Do not force Flue or Smithers into a Vercel runtime merely to say everything is deployed on Vercel. The web app may proxy all runtimes behind one UI.

Smithers’ current serverless documentation says the Bun container path is supported, while Node/Vercel Function engine support is still in progress. Treat Smithers as a Bun service for the first pass.

## 7. Prerequisites and scaffolding

Before changing code, inspect the current official docs because all three projects are moving quickly.

### Eve

Use the current official scaffold, presently documented as:

```bash
npx eve@latest init <directory>
```

The current tutorial requires Node 24 or newer.

### Flue

Install and initialize the Node target using the current documented flow:

```bash
pnpm add @flue/runtime
pnpm add -D @flue/cli
pnpm exec flue init --target node
```

Current Flue docs list Node `>=22.19.0`.

### Smithers

From the repository root:

```bash
bunx smithers-orchestrator init
```

Select Codex when prompted, or run non-interactively if appropriate. Keep the generated Smithers skill/MCP configuration project-scoped where possible.

### Version policy

- Install current package versions.
- Pin exact resolved versions in the lockfile.
- Record them in `docs/findings-template.md`.
- Do not blindly use API snippets in this handoff when the installed types disagree.
- Prefer imported public types and `satisfies` checks over copied interfaces.

## 8. Shared demo agent

Implement the same **research-and-publish agent** in Eve and Flue.

### User-visible behavior

The agent should:

1. accept a research request;
2. clarify only when the request is unusably ambiguous;
3. generate a short research plan;
4. delegate one focused subtask to a subagent;
5. use a deterministic mock research tool;
6. create a structured draft;
7. request application-owned approval before publication;
8. publish through an intentionally flaky but idempotent effect;
9. survive interruption/restart;
10. continue later in the same session;
11. report the final artifact and effect receipt.

### Why this scenario

It exercises:

- persistent conversation;
- tools;
- skills;
- subagents;
- structured outputs;
- approvals;
- side effects;
- retries;
- durability;
- observability;
- frontend streaming.

Avoid live web search in the first baseline. Use a deterministic fixture corpus so framework behavior is comparable. Add live search as a later optional test.

## 9. Shared framework-neutral layer

The following logic must not depend on Eve, Flue, or Smithers:

```text
packages/domain/
  create-research-plan.ts
  search-fixture-corpus.ts
  create-draft.ts
  create-publication-proposal.ts
  approve-proposal.ts
  publish-artifact.ts

packages/contracts/
  research-request.ts
  research-plan.ts
  research-result.ts
  publication-proposal.ts
  publication-receipt.ts
  agent-events.ts
```

Example domain boundary:

```ts
export interface PublishArtifactInput {
  proposalId: string;
  idempotencyKey: string;
  title: string;
  body: string;
}

export interface PublishArtifactResult {
  publicationId: string;
  created: boolean;
  checksum: string;
}

export async function publishArtifact(
  input: PublishArtifactInput,
  deps: PublishArtifactDeps,
): Promise<PublishArtifactResult> {
  // Transactionally insert by unique idempotency key.
  // Return the existing receipt on duplicate invocation.
}
```

The agent framework adapter validates tool input, supplies trusted identity/context, and calls this function.

## 10. Persistence schema

Use Postgres and Drizzle for shared application state.

Minimum tables:

```text
demo_threads
  id
  backend                 eve | flue
  external_session_id
  continuation_state_json
  created_at
  updated_at

publication_proposals
  id
  thread_id
  title
  body
  status                  pending | approved | denied | published
  created_at
  decided_at

publication_effects
  id
  proposal_id
  idempotency_key         UNIQUE
  request_checksum
  result_json
  attempt_count
  created_at
  updated_at

comparison_runs
  id
  prompt
  eve_thread_id
  flue_thread_id
  smithers_run_id
  metrics_json
  created_at
```

Smithers can use its own SQLite database locally. Add Postgres for Smithers only after the local integration works.

Do not mix Smithers’ internal run tables with application-owned product state.

## 11. Baseline Eve implementation

Create the Eve agent using its native project conventions:

```text
apps/eve/
├── agent/
│   ├── agent.ts
│   ├── instructions.md
│   ├── tools/
│   │   ├── search_fixture_corpus.ts
│   │   ├── create_publication_proposal.ts
│   │   ├── get_publication_status.ts
│   │   ├── publish_artifact.ts
│   │   └── start_smithers_workflow.ts
│   ├── skills/
│   │   └── research-and-publish/
│   │       └── SKILL.md
│   ├── subagents/
│   │   └── researcher/
│   └── channels/
│       └── eve.ts
└── ...
```

Requirements:

- Use the typed `eve/client` client from server-side callers.
- Persist Eve `SessionState` under the application thread record.
- Persist rendered conversation events separately; Eve session state is a cursor/resume handle, not the transcript.
- Use the same model/provider and behavioral instructions as Flue.
- Keep publication approval in the shared application database for the baseline.
- Add an optional second path demonstrating Eve-native durable approval only after the portable baseline works.
- Export health/info checks for adapters and tests.
- Enable traces and record how much setup is automatic on Vercel.

## 12. Baseline Flue implementation

Create a Node-target Flue service:

```text
apps/flue/
├── agents/
│   └── research-publisher.ts
├── src/
│   ├── skills/
│   │   └── research-and-publish/
│   │       └── SKILL.md
│   ├── subagents/
│   │   └── researcher.ts
│   ├── tools/
│   │   ├── search-fixture-corpus.ts
│   │   ├── create-publication-proposal.ts
│   │   ├── get-publication-status.ts
│   │   ├── publish-artifact.ts
│   │   └── start-smithers-workflow.ts
│   └── ...
├── flue.config.ts
└── ...
```

Requirements:

- Expose a persistent named agent.
- Use `@flue/sdk` from the web app and Smithers adapter.
- Map the application thread ID to a stable Flue agent instance ID.
- Use the same model/provider, prompts, fixtures, schemas, and domain functions as Eve.
- Configure persistence appropriate for durable local testing.
- Add a subagent profile and use `session.task(...)` or the current public equivalent.
- Record observability and run-inspection setup.
- Keep approvals application-owned in the baseline.

## 13. Shared comparison UI

Create one Next.js page with four modes:

```text
/direct/eve
/direct/flue
/smithers/compare
/smithers/child-job
```

### Direct Eve and Direct Flue

Provide the same UI:

- thread selector/new thread;
- transcript;
- live event stream;
- tool activity;
- subagent activity;
- pending approval card;
- approve/deny controls;
- final artifact;
- backend badge.

Do not use a UI abstraction that hides framework-specific events. Normalize common events, but preserve a raw event inspector.

### Smithers compare

Launch a Smithers workflow that sends the same prompt to both remote adapters, then shows:

- Eve output;
- Flue output;
- timing;
- token/cost data where available;
- tool traces;
- reviewer verdict;
- raw Smithers execution tree.

### Smithers child job

Allow either direct agent to call a tool that launches a Smithers workflow. Display:

- parent backend/session;
- Smithers child run ID;
- run status;
- pending Smithers approvals;
- final child output.

## 14. Smithers → Eve/Flue adapters

Create `packages/smithers-adapters`.

### `EveRemoteAgent`

Implement the current imported `AgentLike` contract rather than copying its shape.

Behavior:

1. `preflight` calls Eve health/info.
2. `generate` creates or restores an Eve client session.
3. Send `args.prompt`.
4. Forward useful stream text to Smithers callbacks when practical.
5. Return the final text or structured result.
6. Propagate `abortSignal` and timeout.
7. Default to a fresh Eve session per Smithers task.
8. Support an explicit stable session key only for tests that require continuation.
9. Initially set native structured-output support to false unless mapping Smithers’ schema to Eve’s current output-schema API is straightforward and tested.

Use:

```ts
import { Client } from "eve/client";
```

Do not expose the Eve continuation token to the model.

### `FlueRemoteAgent`

Behavior:

1. `preflight` checks the Flue endpoint.
2. `generate` calls the persistent agent using the current `@flue/sdk` API.
3. Use a deterministic instance ID derived from Smithers run/task IDs.
4. Forward stream output when practical.
5. Propagate cancellation and timeout.
6. Initially set native structured-output support to false unless a tested direct mapping exists.

Use the current equivalents of:

```ts
import { createFlueClient } from "@flue/sdk";

client.agents.prompt(agentName, instanceId, {
  message: prompt,
  signal,
});
```

### Required adapter tests

- successful generation;
- unavailable backend fails in `preflight`;
- cancellation;
- timeout;
- session isolation;
- stable-session continuation;
- malformed response handling;
- no credential leakage;
- output-schema fallback.

## 15. Smithers comparison workflow

Create:

```text
apps/smithers/workflows/compare-eve-flue.tsx
```

Logical graph:

```text
Input prompt
   ├── Eve task
   └── Flue task
          ↓
Normalize outputs
          ↓
Independent reviewer
          ↓
Persist comparison result
```

Requirements:

- Run Eve and Flue tasks in parallel.
- Use the two custom `AgentLike` adapters.
- Reviewer must receive both outputs without knowing which is which for one blinded score.
- Also produce an unblinded operational comparison.
- Persist metrics in `comparison_runs`.
- Expose run events through Smithers Gateway/HTTP.
- Include retry policy only around safe remote generation calls.
- Do not retry the shared publication effect from this workflow.

Create a second workflow:

```text
apps/smithers/workflows/fallback.tsx
```

It should try one backend, classify the failure, and invoke the other only for configured transient failures. Do not use it in the baseline scoring.

## 16. Eve/Flue → Smithers tools

Implement the same logical tools in both frameworks over a shared client package.

```text
packages/domain/src/smithers-client.ts
```

Minimum client operations:

```ts
interface SmithersClient {
  startRun(input: {
    workflowPath: string;
    input: unknown;
    idempotencyKey: string;
  }): Promise<{ runId: string }>;

  getRun(runId: string): Promise<SmithersRunSummary>;

  submitApproval(input: {
    runId: string;
    approvalId: string;
    decision: "approve" | "deny";
  }): Promise<void>;

  cancelRun(runId: string): Promise<void>;
}
```

Use the authenticated Smithers HTTP API. Keep the bearer token in trusted server code.

Model-facing tools must not accept:

- arbitrary URLs;
- arbitrary filesystem workflow paths;
- arbitrary auth headers.

Instead, expose a fixed allowlist:

```text
research-report
validate-artifact
compare-backends
```

Map each public workflow name to a trusted internal workflow path.

## 17. Approval baseline

Use one application-owned approval flow for both frameworks.

```text
Agent creates proposal
  ↓
DB row status=pending
  ↓
UI renders approval
  ↓
User approves/denies
  ↓
Agent is notified or polls through a bounded tool
  ↓
Publish tool revalidates status and executes idempotently
```

This holds the product policy constant.

After this passes, optionally add separate framework-native approval demonstrations. Keep their results out of the baseline reliability score because they are not equivalent APIs.

## 18. Failure injection

Add deterministic environment-controlled failure modes:

```text
DEMO_FAIL_PUBLISH_ATTEMPTS=2
DEMO_CRASH_AFTER_EFFECT=true
DEMO_AGENT_TIMEOUT_MS=...
DEMO_FORCE_SUBAGENT_FAILURE=true
```

`publishArtifact` must:

1. increment attempt count;
2. fail for the configured first N attempts;
3. insert or retrieve by unique idempotency key;
4. return the same receipt on duplicate calls.

Add a development-only endpoint or script to terminate each runtime at defined checkpoints.

## 19. Test matrix

Automate the following for both Eve and Flue.

### Core behavior

- same prompt and deterministic fixtures;
- same model/provider/settings;
- same tools and schemas;
- same skill content;
- one delegated subagent task;
- same final structured artifact.

### Durability

1. terminate during model work;
2. terminate after tool success but before next model step;
3. restart while approval is pending;
4. resume a saved conversation;
5. disconnect and reconnect stream;
6. submit duplicate user input;
7. submit duplicate approval;
8. invoke duplicate publication request.

### Security and boundaries

- user A cannot resume user B’s thread;
- tool cannot publish an unapproved proposal;
- tool cannot change publication destination;
- agent never receives raw provider or Smithers credentials;
- arbitrary Smithers workflow paths are rejected;
- sandbox cannot access unrelated host files.

### Smithers integration

- Smithers invokes Eve as a worker;
- Smithers invokes Flue as a worker;
- both run in parallel;
- one backend failure does not corrupt the other task;
- Eve launches a Smithers child run;
- Flue launches a Smithers child run;
- Smithers approval can be completed from the web UI;
- parent session can retrieve final child output.

## 20. Evaluation metrics

Record:

```text
Implementation
  setup time
  framework-specific LOC
  shared LOC
  adapter LOC
  number of custom infrastructure components

Runtime
  first-token latency
  total latency
  model calls
  input/output tokens
  estimated cost
  tool calls
  duplicate-effect count
  recovery time

Developer experience
  local setup
  type quality
  docs accuracy
  debugging clarity
  event readability
  approval ergonomics
  subagent ergonomics
  sandbox ergonomics
  deployment effort

Portability
  framework-neutral business logic percentage
  UI coupling
  persistence coupling
  auth coupling
  observability coupling
  in-flight migration feasibility
```

Do not claim a winner based only on elapsed time from one run. Run the deterministic eval suite multiple times and separate framework behavior from model variance.

## 21. Expected hypotheses

Treat these as hypotheses to test, not conclusions:

- Eve will likely be faster to integrate into a Vercel-hosted product surface.
- Eve will likely have the most cohesive built-in session, frontend, sandbox, and observability path on Vercel.
- Flue will likely expose more harness/runtime choices directly in TypeScript.
- Flue will likely require more assembly for auth, product UI, and operations.
- Flue will likely be easier to move across infrastructure providers.
- Smithers can orchestrate both effectively through thin remote `AgentLike` adapters.
- Smithers is not a substitute for either baseline product-agent runtime; it is an optional durable outer workflow or bounded child-workflow engine.

## 22. Definition of done

The repository is complete when:

- `pnpm install` succeeds from a clean checkout;
- `pnpm dev` starts all four services;
- the same conversation can be run against Eve and Flue;
- each implementation uses a skill, tool, subagent, durable session, approval, and idempotent effect;
- the UI can approve and resume both;
- restart tests pass;
- Smithers can invoke Eve and Flue through `AgentLike` adapters;
- Eve and Flue can each launch a Smithers child workflow through HTTP;
- no raw secret is exposed in model context or browser payloads;
- tests prove the publication side effect occurs exactly once;
- deployment instructions are documented;
- `docs/findings.md` contains measured results and unresolved issues.

## 23. Implementation order

Follow this order and commit after each phase:

1. scaffold monorepo and services;
2. add shared contracts/domain/persistence;
3. implement deterministic fixture tools and idempotent effect;
4. implement Eve baseline;
5. implement Flue baseline;
6. implement shared web comparison UI;
7. add durability/failure tests;
8. initialize Smithers;
9. implement Smithers remote-agent adapters;
10. implement Smithers comparison workflow;
11. add Eve/Flue → Smithers HTTP tools;
12. add deployment configs;
13. run full matrix and write findings.

Do not begin Smithers integration until direct Eve and direct Flue behavior passes the same baseline tests.

## 24. Codex operating instructions

- Read current official documentation before using each public API.
- Prefer the framework’s current scaffold over manually reproducing old examples.
- Keep framework-specific code thin.
- Do not refactor shared behavior into a lowest-common-denominator agent abstraction that prevents testing native framework ergonomics.
- Share domain operations, contracts, fixtures, effect logic, and evaluation inputs.
- Preserve separate native event streams.
- Add TODOs with links when a current framework limitation blocks parity.
- Never hide a failed parity test by weakening the test.
- Commit small, reviewable phases with descriptive messages.
- At the end of every phase, update `docs/findings.md` with:
  - what worked;
  - what differed from docs;
  - framework-specific workarounds;
  - unresolved issues;
  - measured LOC/setup/runtime data.

## 25. Environment variables

Create `.env.example` with at least:

```bash
# Shared model configuration
DEMO_MODEL_PROVIDER=
DEMO_MODEL_ID=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
AI_GATEWAY_API_KEY=
VERCEL_OIDC_TOKEN=

# Service URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
EVE_BASE_URL=http://localhost:3001
FLUE_BASE_URL=http://localhost:3002
SMITHERS_BASE_URL=http://localhost:7331

# Auth
EVE_SERVICE_TOKEN=
FLUE_SERVICE_TOKEN=
SMITHERS_API_KEY=

# Persistence
DATABASE_URL=

# Failure injection
DEMO_FAIL_PUBLISH_ATTEMPTS=2
DEMO_CRASH_AFTER_EFFECT=false
DEMO_FORCE_SUBAGENT_FAILURE=false
```

Use one direct model provider for the baseline if possible, so the comparison does not accidentally become AI Gateway versus direct-provider access. Add AI Gateway as a separate Eve platform-integration experiment.

## 26. Source references

Use these as starting points and verify their current content before implementation:

- Eve concepts: https://vercel.com/docs/eve/concepts
- Eve repository/docs: https://github.com/vercel/eve
- Eve TypeScript client: https://github.com/vercel/eve/blob/main/docs/guides/client/overview.mdx
- Eve MCP connections: https://github.com/vercel/eve/blob/main/docs/connections/mcp.mdx
- Flue getting started: https://flueframework.com/docs/getting-started/quickstart/
- Flue agents: https://flueframework.com/docs/guide/building-agents/
- Flue tools and MCP: https://flueframework.com/docs/guide/tools/
- Flue SDK agents: https://flueframework.com/docs/sdk/agents/
- Smithers getting started: https://smithers.sh/guide/get-started
- Smithers AgentLike API: https://smithers.sh/reference/agents
- Smithers HTTP server: https://smithers.sh/integrations/server
- Smithers MCP server: https://smithers.sh/integrations/mcp-server
- Smithers serverless deployment: https://smithers.sh/deployment/serverless
- Smithers production hardening: https://smithers.sh/deployment/production-hardening
