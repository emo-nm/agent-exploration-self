import { defineAgent } from "eve";

// Same model/provider as the other baselines (handoff §11). The gateway id
// needs AI_GATEWAY_API_KEY or a linked Vercel project; with no key present the
// build/typecheck still pass and health serves — only live model calls block.
export default defineAgent({
  model: "anthropic/claude-sonnet-5",
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
