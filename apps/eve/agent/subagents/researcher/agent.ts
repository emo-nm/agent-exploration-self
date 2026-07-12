import { defineAgent } from "eve";

// Declared subagent (handoff §8, step 4): the parent delegates ONE focused
// research subtask here. `description` is required — the parent reads it to
// decide when to delegate. A declared subagent inherits nothing from the root,
// so it carries its own tools/ (see ./tools/search_fixture_corpus.ts).
export default defineAgent({
  description:
    "Investigate one focused research subtask against the fixture corpus and return grounded findings for the parent to draft from.",
  model: "anthropic/claude-sonnet-5",
});
