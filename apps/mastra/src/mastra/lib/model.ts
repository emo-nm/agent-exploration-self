// Shared model provider for the Mastra baseline. Both agents (the primary
// research-publisher and the researcher subagent) resolve ONE model instance
// from here so the comparison stays fair: the model id is read from
// DEMO_MODEL_ID and routed through OpenRouter (OpenAI-compatible gateway).
//
// OpenRouter is attached via @openrouter/ai-sdk-provider (createOpenRouter),
// which produces an AI SDK v7 LanguageModel that @mastra/core accepts.
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  // Fail loud rather than silently falling back to a string model id that would
  // hit Mastra's own gateway (and not OpenRouter).
  throw new Error('OPENROUTER_API_KEY is not set — cannot build the Mastra model');
}

const modelId = process.env.DEMO_MODEL_ID ?? 'anthropic/claude-sonnet-5';

const openrouter = createOpenRouter({ apiKey });

/** The one shared model instance used by every Mastra agent in this app. */
export const demoModel = openrouter.chat(modelId);
