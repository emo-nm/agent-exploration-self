import { defineAgent } from "eve";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { withPromptCaching } from "@demo/model";

// Declared subagent (handoff §8, step 4): the parent delegates ONE focused
// research subtask here. `description` is required — the parent reads it to
// decide when to delegate. A declared subagent inherits nothing from the root
// — not tools (see ./tools/search_fixture_corpus.ts) and NOT the model
// provider either: the root's direct OpenRouter model does not propagate, so
// this child must repeat the same custom-provider wiring or it falls back to
// the Vercel AI Gateway and fails with "AI Gateway received no credentials".
// It uses the same shared @demo/model prompt-caching wrapper as the root so the
// subagent's turns are prompt-cached too.
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const modelId = process.env.DEMO_MODEL_ID ?? "anthropic/claude-sonnet-5";

export default defineAgent({
  description:
    "Investigate one focused research subtask against the fixture corpus and return grounded findings for the parent to draft from.",
  model: withPromptCaching(openrouter.chat(modelId, { usage: { include: true } })),
  modelContextWindowTokens: 200_000,
});
