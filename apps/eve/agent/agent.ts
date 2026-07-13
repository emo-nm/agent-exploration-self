import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// Model provider. The stock eve path is a Vercel AI Gateway model-id string
// (needs AI_GATEWAY_API_KEY / a linked Vercel project). We have no Gateway key
// — we have an OpenRouter key — so we take eve's documented "call a provider
// directly" escape hatch (agent-config.md): pass a provider-authored AI SDK
// LanguageModel. OpenRouter is OpenAI-compatible; the id (DEMO_MODEL_ID,
// anthropic/claude-sonnet-5) is used everywhere for a fair comparison. The
// key is read at request time, so build/typecheck work without it present.
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const modelId = process.env.DEMO_MODEL_ID ?? "anthropic/claude-sonnet-5";

export default defineAgent({
  model: openrouter.chat(modelId),
  // Required for a direct (non-Gateway) LanguageModel: eve derives the context
  // window from the AI Gateway catalog, and a provider-authored model has no
  // such metadata, so compaction fails to compile without this. Sonnet's window.
  modelContextWindowTokens: 200_000,
  limits: {
    // The demo delegates exactly one focused subtask to `researcher`; depth 1
    // is enough and keeps the tree bounded.
    maxSubagentDepth: 1,
  },
  build: {
    // The shared @demo/persistence layer pulls in the Postgres driver and
    // Drizzle. eve compiles authored modules and traces their deps; node-native
    // / dynamically-required packages must be kept external so the compiled
    // agent requires them at runtime instead of eve trying to inline them.
    externalDependencies: ["pg", "drizzle-orm"],
  },
});
