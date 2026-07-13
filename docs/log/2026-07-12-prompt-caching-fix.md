# Prompt caching on the direct OpenRouter path — fix (2026-07-12)

Follow-up to `2026-07-11-first-live-runs.md`, which found Eve on the direct
OpenRouter path (`@openrouter/ai-sdk-provider`, a provider-authored AI SDK
`LanguageModel`) was NOT getting Anthropic prompt caching: `cacheReadTokens: 0`,
`cacheWriteTokens: 0`, and input tokens climbing linearly every step. The user
requires local runs to cache, always. This session fixed it with one shared
wrapper and proved caching at both the provider level and the framework level.

## Root cause

OpenRouter DOES support Anthropic caching, but only when the request carries
`cache_control` breakpoints. Vercel's AI Gateway injects those automatically;
the direct provider path does not unless you ask for them. Nobody was asking.

What the installed provider actually supports (read from
`node_modules/.pnpm/@openrouter+ai-sdk-provider@3.0.0.../dist/index.js`, not
docs):

- **Per-message `cache_control`** via `providerOptions.openrouter.cacheControl`
  (also accepts `.cache_control`, and `providerOptions.anthropic.cacheControl`).
  `convert-to-openrouter-chat-messages.ts` reads this per message/part and emits
  a `cache_control` block on the corresponding content. This is the breakpoint
  mechanism.
- **Top-level `cache_control` setting** (`OpenRouterChatSettings.cache_control`,
  `{ type: 'ephemeral', ttl? }`) — "Anthropic automatic caching", a request-body
  directive. An alternative to per-message breakpoints; we did not use it
  because per-message breakpoints are explicit and give a place to hang the
  regression guard.
- **Usage accounting** via the `usage: { include: true }` setting, which makes
  the response report `promptTokensDetails.cachedTokens` (mapped to the AI SDK
  `usage.inputTokens.cacheRead` / `.cacheWrite`). Without it caching still
  HAPPENS but is invisible.

## Before, per framework

| Framework | Model wiring | Caching before |
|---|---|---|
| Eve | `openrouter.chat(id)` provider-authored AI SDK `LanguageModel` (root + researcher subagent) | NONE — cacheRead/Write 0, input climbing |
| Mastra | `openrouter.chat(id)` shared AI SDK model | not observed (usage not surfaced; same un-wrapped path as Eve, so almost certainly also uncached) |
| Flue | `openrouter/<id>` string spec, resolved by Flue's own pi-ai provider registry (`api: "openai-completions"`) | YES already (cacheRead 8926 on resume) — Flue's pi-ai compat profile carries a `cacheControlFormat` and injects breakpoints itself |

## The fix — one shared wrapper: `@demo/model`

New tiny workspace package `packages/model` (`@demo/model`). Kept separate from
`@demo/prompts` on purpose: `@demo/prompts` is deliberately dependency-free and
is imported by ALL frameworks including Flue, which does not use the AI SDK; a
model helper that pulls in `ai` does not belong there.

Exports:

- `withPromptCaching<T>(model, { onUsage? }): T` — the core. An AI SDK
  `wrapLanguageModel` middleware whose `transformParams` walks the outgoing
  prompt and stamps `providerOptions.openrouter.cacheControl = { type:
  'ephemeral' }` on the chosen message boundaries. Returns the model with its
  **exact input type preserved** (important: annotating the return as the `ai`
  SDK `LanguageModel` union breaks Mastra's vendored model type — see below).
  Its `wrapGenerate` reads cache usage and calls `onUsage` (defaults to a
  `console.debug` line) so a regression is visible in logs.
- `selectBreakpointIndices(prompt)` — the breakpoint policy, unit-tested:
  the system message (biggest, most stable prefix) plus the trailing messages,
  capped at **4** (Anthropic's hard limit). Each new turn re-reads the whole
  prior conversation as a cache hit.
- `createCachingModel({ apiKey?, modelId?, onUsage? })` — convenience that
  builds `openrouter.chat(id, { usage: { include: true } })` and wraps it;
  throws if `OPENROUTER_API_KEY` is missing (never silently falls back to a
  different gateway — comparison fairness). Used by the proof script.

### Wiring

- **Eve** (`apps/eve/agent/agent.ts` and `.../subagents/researcher/agent.ts`):
  `withPromptCaching(openrouter.chat(modelId, { usage: { include: true } }))`.
  Both the root and the researcher subagent — Eve subagents inherit nothing, so
  both had to be wired (same finding as the original run).
- **Mastra** (`apps/mastra/src/mastra/lib/model.ts`): same, one shared
  `demoModel`.
- **Flue**: NOT wrapped. Flue's model is a `openrouter/<id>` string resolved by
  its own pi-ai provider, not an AI SDK `LanguageModel`, so
  `wrapLanguageModel` cannot touch it. It already caches through pi-ai's
  per-model `cacheControlFormat`. This is a real criterion finding: **Flue owns
  caching for you; Eve and Mastra make you do it yourself on the direct path.**

`@demo/model` added as a workspace dep of `apps/eve` and `apps/mastra`.

### A type-compatibility gotcha (criterion-5 / lock-in signal)

First cut had `createCachingModel` return the `ai` SDK `LanguageModel` union.
That typechecks in isolation but **Mastra rejects it** — `@mastra/core` pins its
own vendored `MastraLanguageModelV2` whose `doGenerate` signature differs, so
the `ai` public `LanguageModel` union is not assignable. The raw
`openrouter.chat(...)` object WAS assignable. Fix: `withPromptCaching<T>` returns
type `T` unchanged (casts the `wrapLanguageModel` result back to the input
type), so the apps pass exactly the model type each framework already accepts.
Lesson: the AI SDK "public" model type is not a safe lingua franca across
frameworks that vendor their own provider version; keep the concrete type.

## Proof — provider level (`pnpm check:caching`)

`packages/model/scripts/check-caching.ts`, wired as root `pnpm check:caching`
(NOT part of `turbo run test` — it makes two real paid calls). Two consecutive
`generateText` calls sharing a ~8.5k-token system prefix through the wrapped
model:

```
Model: anthropic/claude-sonnet-5   (OpenRouter -> ...-20260630, Bedrock)
System prefix length: ~8475 tokens
call 1 (seed):  input=10624 cacheRead=0     cacheWrite=10622 output=153
call 2 (reuse): input=10624 cacheRead=10622 cacheWrite=0     output=110
PASS: prompt caching is active (call 2 read cached tokens).
```

Call 1 writes 10,622 cache tokens; call 2 reads all 10,622 back. Exits non-zero
if call 2 shows no cache read — that is the regression guard.

## Proof — framework level (Eve, port 4001, in-memory repo, no DATABASE_URL)

Booted `eve dev --no-ui --port 4001` (no `DATABASE_URL` -> in-memory repos) and
drove two turns on one session through a throwaway client driver, reading
`step.completed.data.usage`:

```
turn 1 (7 model steps):
  step 1: input=5985 cacheRead=5983 cacheWrite=0   output=72
  step 2: input=6395 cacheRead=6393 cacheWrite=0   output=390
  step 3: input=6826 cacheRead=6393 cacheWrite=431 output=272
  step 4: input=7127 cacheRead=6824 cacheWrite=301 output=180
  step 5: input=7315 cacheRead=7125 cacheWrite=188 output=211
  step 6: input=7470 cacheRead=7313 cacheWrite=155 output=207
  step 7: input=8229 cacheRead=7468 cacheWrite=759 output=204
turn 2 (same session):
  step 1: input=5977 cacheRead=5975 cacheWrite=0   output=78
```

Contrast with the pre-fix run (`cacheReadTokens: 0`, `cacheWriteTokens: 0`,
input climbing with nothing reused): now every step reads the cached prefix
(cacheRead tracks input) and only the incremental new content is written
(cacheWrite is the small per-step delta). This is exactly the intended
behavior. The middleware does NOT fight Eve's `LanguageModel` path — Eve passes
the wrapped model straight through and the `providerOptions` reach OpenRouter.

## After, per framework

| Framework | Caching after | How |
|---|---|---|
| Eve | YES (measured: cacheRead 5,975-7,468 across steps) | `withPromptCaching` on root + subagent |
| Mastra | YES (same wrapper; not separately re-run live this session — identical AI SDK path to Eve) | `withPromptCaching` on shared `demoModel` |
| Flue | YES (already) | Flue's own pi-ai `cacheControlFormat`; wrapper N/A |

## Guard against regression

1. `withPromptCaching` logs cache usage per call by default (`onUsage` -> a
   `[demo/model cache] ...` debug line), so a silent drop to `cacheRead=0` is
   visible in any run's logs.
2. `pnpm check:caching` asserts cache reads > 0 and exits non-zero otherwise.
   Kept OUT of the default test run because it costs money; run it deliberately.
3. `selectBreakpointIndices` is unit-tested (4-breakpoint cap, always includes
   system + newest message) and runs free under `turbo run test`.

## Unresolved / notes

- Mastra was not separately re-driven live this session (Eve was the one that
  showed the problem and got the live spot-check). Its path is the identical AI
  SDK wrapper; recommend one confirming live run when convenient.
- During the Eve spot-check, turn 1 also emitted `step.failed`/`turn.failed`
  after the tool loop (in-memory repo, approval not flipped out of band in this
  quick driver). Orthogonal to caching — the cache usage above is from the
  completed steps before that — but worth a look separately.
- Anthropic's ephemeral cache TTL is ~5 min; the guard script adds a small
  delay and relies on the two calls being close together.
