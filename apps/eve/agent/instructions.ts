import { defineInstructions } from "eve/instructions";
import { AGENT_INSTRUCTIONS } from "@demo/prompts";

// The always-on system prompt IS the shared "brain" (@demo/prompts). We
// reference the canonical text so every framework runs the identical agent;
// nothing is forked here. defineInstructions resolves at build time and eve
// captures the markdown into the compiled manifest.
export default defineInstructions({
  markdown: AGENT_INSTRUCTIONS,
});
