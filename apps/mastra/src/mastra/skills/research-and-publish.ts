// SKILL EQUIVALENT (criterion 7 finding).
//
// Mastra has NO first-class SKILL.md concept (verified against @mastra/core
// 1.50.1 — no `skills` field on AgentConfig, no SKILL.md discovery/hot-reload;
// its authoring primitives are Agent `instructions`, `tools`, sub-`agents`, and
// `workflows`). The nearest equivalent to a portable "skill" is therefore a
// plain instructions string. We keep the SHARED skill body from @demo/prompts
// as the canonical brain and feed it into the agent's instructions, so the
// same skill text drives Eve, Flue, and Mastra. The delta vs. Eve/Flue (which
// have SKILL.md files with frontmatter + discovery) is recorded in
// docs/log/2026-07-11-mastra-baseline-notes.md.
import { AGENT_INSTRUCTIONS, RESEARCH_AND_PUBLISH_SKILL_MD } from '@demo/prompts';

/** The agent's system prompt = shared instructions + the shared skill body. */
export const researchAndPublishInstructions = `${AGENT_INSTRUCTIONS}

--- skill: research-and-publish ---
${RESEARCH_AND_PUBLISH_SKILL_MD}`;
