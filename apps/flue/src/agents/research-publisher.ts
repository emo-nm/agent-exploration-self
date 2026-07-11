// The research-and-publish demo agent in Flue's native idiom (handoff §8/§12).
// Filename => agent name `research-publisher`. The instance id is the mapped
// application thread id (see ../shared/instance-id.ts).
//
// The shared "brain" — instructions and the skill — comes entirely from
// @demo/prompts (import, don't fork). AGENT_INSTRUCTIONS is imported directly;
// the skill is generated into ./skills/.../SKILL.md from @demo/prompts by
// scripts/generate-skill.mjs and imported here with the `skill` attribute.
import { defineAgent, type AgentRouteHandler } from "@flue/runtime";
import { AGENT_INSTRUCTIONS } from "@demo/prompts";
import researchAndPublishSkill from "../skills/research-and-publish/SKILL.md" with { type: "skill" };
import { buildResearchTools } from "../tools/index.ts";
import { researcherProfile } from "../subagents/researcher.ts";
import { getStores } from "../shared/stores.ts";
import { authenticateAgentRequest } from "../auth.ts";

export const description =
  "Researches a topic against a fixture corpus, drafts an artifact, and publishes it after application-owned approval.";

// Application-owned auth boundary (criterion 8). The route decides whether the
// caller may touch this agent instance id before any agent work runs.
export const route: AgentRouteHandler = async (c, next) => {
  const decision = authenticateAgentRequest(
    c.req.header("authorization"),
    c.req.param("id"),
  );
  if (!decision.ok) return c.json({ error: decision.reason }, decision.status);
  await next();
};

export default defineAgent(({ id }) => {
  const stores = getStores();
  const ctx = { threadId: id, stores };
  return {
    // Same shared model across frameworks. No key is present in this spike, so
    // live model turns are [blocked]; wiring/typing/tools are exercised instead.
    model: "anthropic/claude-sonnet-4-6",
    instructions: AGENT_INSTRUCTIONS,
    skills: [researchAndPublishSkill],
    tools: buildResearchTools(ctx),
    subagents: [researcherProfile(ctx)],
    // Durable submissions: bounded retries/timeout for interruption recovery
    // (handoff §8 steps 9-10). db.ts supplies the durable SQLite store.
    durability: { maxAttempts: 10, timeoutMs: 3_600_000 },
  };
});
