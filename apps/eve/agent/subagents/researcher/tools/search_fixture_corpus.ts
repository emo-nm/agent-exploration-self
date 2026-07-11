// The researcher subagent gets its OWN copy of the search tool (declared
// subagents don't inherit the root's tools). Same single definition from lib/.
import { searchFixtureCorpusTool } from "#lib/search-tool.js";

export default searchFixtureCorpusTool;
