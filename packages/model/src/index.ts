// @demo/model — one shared model helper for the INT-27 evaluation.
//
// PROBLEM this solves: on the direct OpenRouter path (@openrouter/ai-sdk-provider,
// a provider-authored AI SDK LanguageModel), Anthropic prompt caching does NOT
// happen unless the request carries `cache_control` breakpoints. Vercel's AI
// Gateway injects those automatically; our direct path did not, so Eve showed
// cache tokens 0 and linearly-climbing input tokens every step.
//
// FIX: an AI SDK middleware (`wrapLanguageModel`) that walks the outgoing prompt
// and stamps `providerOptions.openrouter.cacheControl = { type: 'ephemeral' }`
// on the cacheable message boundaries (the system prompt + the trailing
// messages), respecting Anthropic's hard limit of 4 cache breakpoints. The
// @openrouter/ai-sdk-provider reads exactly this field per message and emits a
// top-level Anthropic `cache_control` on those content blocks (verified against
// the installed provider's convert-to-openrouter-chat-messages.ts).
//
// This is framework-neutral: it takes any AI SDK v7 LanguageModel produced by
// createOpenRouter(...).chat(id) and returns a wrapped LanguageModel. Eve and
// Mastra both consume such a model object and can use it directly. (Flue routes
// through its own `openrouter/<id>` string provider, not an AI SDK model, so it
// cannot use this wrapper — see docs/log for that framework's own path.)

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/** Anthropic accepts at most 4 `cache_control` breakpoints per request. */
export const MAX_CACHE_BREAKPOINTS = 4;

const EPHEMERAL = { type: "ephemeral" } as const;

/**
 * A single message in the outgoing prompt. We only touch `providerOptions`, so
 * we keep this deliberately loose rather than pinning it to a specific AI SDK
 * LanguageModelV_n message union (the three frameworks pull slightly different
 * minor versions; the `role`/`providerOptions` shape is stable across them).
 */
interface PromptMessage {
  role: string;
  providerOptions?: Record<string, Record<string, unknown>>;
}

/** Callback invoked after each model call with the observed cache usage. */
export type CacheUsageObserver = (usage: CacheUsage) => void;

export interface CacheUsage {
  inputTokens: number | undefined;
  /** Cached input tokens READ (the cache hit — what proves caching works). */
  cacheReadTokens: number | undefined;
  /** Cached input tokens WRITTEN (the cache seed on the first call). */
  cacheWriteTokens: number | undefined;
  outputTokens: number | undefined;
}

/**
 * Choose which message indices get a cache breakpoint. Strategy: the system
 * message (a large, stable prefix — the single biggest caching win) plus the
 * trailing messages, so each new turn re-reads the whole prior conversation as
 * a cache hit. Capped at MAX_CACHE_BREAKPOINTS.
 */
export function selectBreakpointIndices(prompt: readonly PromptMessage[]): number[] {
  if (prompt.length === 0) return [];
  const indices = new Set<number>();

  // System prompt first (index 0 if present) — the highest-value, most-stable
  // cache prefix.
  const systemIndex = prompt.findIndex((m) => m.role === "system");
  if (systemIndex >= 0) indices.add(systemIndex);

  // Then the trailing messages, newest first, until we hit the breakpoint cap.
  for (let i = prompt.length - 1; i >= 0 && indices.size < MAX_CACHE_BREAKPOINTS; i--) {
    indices.add(i);
  }

  return [...indices].sort((a, b) => a - b);
}

function stampCacheControl(message: PromptMessage): void {
  const providerOptions = message.providerOptions ?? {};
  const openrouter = providerOptions.openrouter ?? {};
  message.providerOptions = {
    ...providerOptions,
    openrouter: { ...openrouter, cacheControl: EPHEMERAL },
  };
}

function readCacheUsage(usage: unknown): CacheUsage {
  // AI SDK v7 (LanguageModelV4Usage) nests input token details.
  const u = usage as {
    inputTokens?: { total?: number; cacheRead?: number; cacheWrite?: number };
    outputTokens?: { total?: number } | number;
    // older/flat shapes seen across minor versions, read defensively:
    cachedInputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
  };
  const out =
    typeof u.outputTokens === "number" ? u.outputTokens : u.outputTokens?.total;
  return {
    inputTokens: u.inputTokens?.total ?? u.promptTokens,
    cacheReadTokens: u.inputTokens?.cacheRead ?? u.cachedInputTokens,
    cacheWriteTokens: u.inputTokens?.cacheWrite,
    outputTokens: out ?? u.completionTokens,
  };
}

export interface PromptCachingOptions {
  /**
   * Called after each generate/stream with the cache usage. Defaults to a
   * console.debug line so a caching regression is visible in logs (the cheap
   * guard: if cacheReadTokens stays 0 across turns, caching silently broke).
   */
  onUsage?: CacheUsageObserver;
}

/**
 * Wrap an OpenRouter AI SDK model so every request carries Anthropic
 * `cache_control` breakpoints. Returns a LanguageModel of the same shape.
 */
export function withPromptCaching<TModel>(model: TModel, options: PromptCachingOptions = {}): TModel {
  const onUsage =
    options.onUsage ??
    ((usage: CacheUsage) => {
      // eslint-disable-next-line no-console
      console.debug(
        `[demo/model cache] input=${usage.inputTokens ?? "?"} ` +
          `cacheRead=${usage.cacheReadTokens ?? 0} ` +
          `cacheWrite=${usage.cacheWriteTokens ?? 0} ` +
          `output=${usage.outputTokens ?? "?"}`,
      );
    });

  const middleware: LanguageModelMiddleware = {
    transformParams: async ({ params }) => {
      const prompt = (params as { prompt?: PromptMessage[] }).prompt;
      if (Array.isArray(prompt)) {
        for (const index of selectBreakpointIndices(prompt)) {
          const message = prompt[index];
          if (message) stampCacheControl(message);
        }
      }
      return params;
    },
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      onUsage(readCacheUsage((result as { usage?: unknown }).usage));
      return result;
    },
  };

  return wrapLanguageModel({
    model: model as never,
    middleware,
  }) as TModel;
}

/**
 * Convenience: build the shared OpenRouter model AND wrap it with prompt
 * caching in one call. Enables usage accounting so cache read/write tokens are
 * reported back in `usage`. Throws if the key is missing (never silently falls
 * back to a different gateway — comparison fairness).
 */
export function createCachingModel(opts: {
  apiKey?: string;
  modelId?: string;
  onUsage?: CacheUsageObserver;
} = {}): LanguageModel {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set — cannot build the demo model");
  }
  const modelId = opts.modelId ?? process.env.DEMO_MODEL_ID ?? "anthropic/claude-sonnet-5";
  const openrouter = createOpenRouter({ apiKey });
  // `usage: { include: true }` turns on OpenRouter usage accounting so the
  // response carries cached-token counts (otherwise caching still happens but
  // is invisible).
  const model = openrouter.chat(modelId, { usage: { include: true } });
  return withPromptCaching(model, { onUsage: opts.onUsage });
}
