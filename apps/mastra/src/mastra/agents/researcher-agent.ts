// The "subagent" for the research-and-publish demo (handoff §8 step 4).
//
// SUBAGENT EQUIVALENT (recorded finding): Mastra's native subagent shape is an
// `Agent` referenced from a parent agent's `agents` field. Mastra auto-generates
// a delegation tool for each entry, so the parent can hand off one focused
// subtask without us building an agent-as-tool wrapper by hand. This is the
// closest analogue to Eve's `subagents/` and Flue's `session.task(...)`.
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { makeSearchFixtureCorpusTool } from '../tools/research-tools';

export const researcherAgent = new Agent({
  id: 'researcher',
  name: 'Researcher',
  description:
    'Focused research subagent: given one topic, searches the fixture corpus and returns grounded findings.',
  instructions: `You are a focused research subagent. You receive ONE research subtask.
Use the search_fixture_corpus tool to gather evidence from the deterministic
offline corpus. Return a concise, evidence-grounded summary of the hits. Do not
invent sources; cite only corpus documents. Do not publish anything.`,
  model: 'openai/gpt-5-mini',
  tools: { search_fixture_corpus: makeSearchFixtureCorpusTool() },
  memory: new Memory(),
});
