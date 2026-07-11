// Researcher subagent profile (handoff §8 step 4: "delegate one focused
// subtask to a subagent"). Shared behavioral content comes from @demo/prompts
// (import, don't fork). The profile is built per agent instance so its search
// tool can be bound to that instance's stores.
import { defineAgentProfile } from "@flue/runtime";
import { RESEARCHER_INSTRUCTIONS } from "@demo/prompts";
import { searchFixtureCorpusTool } from "../tools/search-fixture-corpus.ts";
import type { ToolFactoryContext } from "../tools/context.ts";

/** Name the parent agent selects via `session.task(text, { agent })`. */
export const RESEARCHER_SUBAGENT = "researcher";

export function researcherProfile(ctx: ToolFactoryContext) {
  return defineAgentProfile({
    name: RESEARCHER_SUBAGENT,
    description:
      "Runs one focused corpus-research subtask and returns grounded findings. Use it to gather evidence before drafting.",
    instructions: RESEARCHER_INSTRUCTIONS,
    // Only the deterministic search capability; the subagent never drafts,
    // proposes, or publishes.
    tools: [searchFixtureCorpusTool(ctx)],
  });
}
