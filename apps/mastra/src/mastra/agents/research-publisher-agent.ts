// The research-and-publish demo agent, Mastra-native (handoff #8).
//
// - instructions: the SHARED brain from @demo/prompts (see ../skills).
// - tools: thin wrappers over @demo/domain/@demo/effects (../tools).
// - agents: the researcher subagent (Mastra's native subagent shape — becomes an
//   auto-generated delegation tool).
// - memory: Mastra Memory, backed by the Mastra storage configured on the
//   `Mastra` instance — this is Mastra's durable long-lived-conversation story
//   (criterion 1).
//
// APPROVAL (criterion 2): kept APPLICATION-OWNED for the baseline. The agent
// creates a proposal (create_publication_proposal), then polls
// get_publication_status until an out-of-band actor (UI/app) flips the shared
// proposals row to `approved`, then calls publish_artifact. Mastra HAS a native
// alternative — tool-level suspend/resume (`suspendSchema`/`resumeSchema` on a
// tool, plus `RequireToolApproval`/`needsApproval`), which would suspend the run
// and persist a snapshot until `resume()` is called. That is framework-owned
// durability and is intentionally NOT used here so the approval flow stays
// identical to Eve/Flue. The delta is recorded in the baseline notes.
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { researchAndPublishInstructions } from "../skills/research-and-publish";
import { makeResearchTools } from "../tools/research-tools";
import { researcherAgent } from "./researcher-agent";
import { repo } from "../lib/repo";
import { demoModel } from "../lib/model";

export const researchPublisherAgent = new Agent({
    id: "research-publisher",
    name: "Research Publisher",
    description:
        "Research a topic against a fixture corpus, draft an artifact, and publish it after application-owned approval.",
    instructions: researchAndPublishInstructions,
    model: demoModel,
    tools: makeResearchTools(repo),
    agents: { researcher: researcherAgent },
    memory: new Memory(),
});
