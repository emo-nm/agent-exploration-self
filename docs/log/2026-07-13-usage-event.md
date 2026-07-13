# 2026-07-13 — Normalized usage/cost event

Added a framework-neutral `usage` event to the `@demo/contracts` `AgentEvent`
union and wired it through all three adapters, the web comparison surface, and
the durability harness. The event is a fair per-backend view of token/cost
usage, normalized the same way we already normalize messages/tool calls, with
the native payload kept on `raw`.

## The contract

`AgentUsageEventSchema` (packages/contracts/src/index.ts):
`{ type: "usage", inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
totalTokens, costUsd, model?, ts, raw }`. All token/cost numbers default to `0`
(zod `.default(0)`) so a backend that omits a field still validates. Also added
`UsageTotals`, `emptyUsageTotals()`, and `sumUsageEvents(events)` so the web UI
and the harness total usage identically.

## Per backend

- **Flue** — least invasive seam is `normalizeConversation`: Flue attaches
  aggregated `PromptUsage` to the assistant message's `metadata.usage` (plus
  `metadata.model`) once a submission settles. We emit one usage event per
  message that carries it — effectively one-per-settled-submission, no extra
  network call. Full mapping incl. cost: `input/output/cacheRead/cacheWrite/
  totalTokens` and `cost.total -> costUsd`; `model = metadata.model.id`.
  This is the only backend that reports cost.

- **Eve** — added a `step.completed` case to `normalizeEvent`. Eve reports
  usage per completed model call on `data.usage`
  (`StepCompletedStreamEvent`), and its field names already match ours 1:1
  (`inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens/costUsd`). Eve
  has **no distinct totalTokens**, so we derive `totalTokens = input + output`.
  No model id is carried on that event, so `model` is left undefined. Eve DOES
  report cost (`costUsd`).

- **Mastra** — added `finish` / `step-finish` cases to `normalizeMastraChunk`.
  Usage rides on `payload.output.usage` (and `payload.totalUsage` on
  step-finish) in AI-SDK `LanguageModelUsage` vocabulary:
  `inputTokens/outputTokens/totalTokens`, `cachedInputTokens -> cacheReadTokens`,
  `cacheCreationInputTokens -> cacheWriteTokens`. In practice one `finish` fires
  per turn. **Mastra reports no cost**, so `costUsd = 0`; a usage-less finish
  chunk is treated as lifecycle noise (returns null). No model id mapped.

## Web

`describeEvent` (apps/web/lib/events.ts) gained a `usage` case rendering a
compact row: `in <n> / out <n> tok (cacheR <n>, cacheW <n>) $<cost> <model>`.
The event stream already renders every normalized event through `EventItem`, so
usage rows show up (with the raw inspector) automatically.

## Evals harness

Added a per-scenario usage accumulator to `ScenarioContext` (`usage?:
UsageTotals`), folded turn usage into it inside `driveResearchTurn`
(via `sumUsageEvents`), and surfaced it as `ScenarioResult.totalUsage` in the
runner — only when the backend actually reported usage this scenario
(`events > 0`). No harness restructuring; events were already collected in the
drive phase, so this is a cheap fold.

## Availability notes

- **Cost:** only Flue and Eve report `costUsd`. Mastra does not surface cost on
  its stream chunks, so Mastra usage events carry `costUsd = 0` (tokens are
  real).
- **totalTokens:** native only on Flue and Mastra; derived (input+output) for
  Eve, which has no distinct total.
- **model:** only Flue carries a model id on the usage seam; Eve/Mastra leave it
  undefined (their usage-bearing events don't include it).
- The Eve and Mastra mappings are unverified against a live model loop in this
  env (no API keys); shapes are read from the installed package type
  definitions. Flue's `PromptUsage` shape was verified live per the task brief.

## Verification

Typecheck (`tsc --noEmit`) passes for contracts, flue-adapter, eve-adapter,
mastra-adapter, evals, and web. Unit tests pass: contracts 10, flue-adapter 6,
eve-adapter 3 (new file + vitest added to that package), mastra-adapter 7,
evals 15, web 14. Nothing committed — changes left in the working tree.
