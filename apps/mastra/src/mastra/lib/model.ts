// Shared model provider for the Mastra baseline. Both agents (the primary
// research-publisher and the researcher subagent) resolve ONE model instance
// from here so the comparison stays fair: the model id is read from
// DEMO_MODEL_ID and routed through OpenRouter (OpenAI-compatible gateway).
//
// OpenRouter is attached via @openrouter/ai-sdk-provider (createOpenRouter),
// which produces an AI SDK v7 LanguageModel that @mastra/core accepts.
// Prompt caching: the direct OpenRouter path does NOT cache unless the request
// carries Anthropic cache_control breakpoints (see docs/log/2026-07-12-prompt
// -caching-fix.md). The shared @demo/model `withPromptCaching` middleware stamps
// those breakpoints on every request; `usage: { include: true }` turns on
// OpenRouter usage accounting so cached-token counts are reported back.
// withPromptCaching preserves the model's exact type, so @mastra/core still
// accepts it (annotating it as the ai SDK `LanguageModel` union does not match
// Mastra's vendored model type).
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { withPromptCaching } from '@demo/model';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  // Fail loud rather than silently falling back to a string model id that would
  // hit Mastra's own gateway (and not OpenRouter).
  throw new Error('OPENROUTER_API_KEY is not set — cannot build the Mastra model');
}

const modelId = process.env.DEMO_MODEL_ID ?? 'anthropic/claude-sonnet-5';

const openrouter = createOpenRouter({ apiKey });

/** The one shared model instance used by every Mastra agent in this app. */
export const demoModel = withPromptCaching(openrouter.chat(modelId, { usage: { include: true } }));
