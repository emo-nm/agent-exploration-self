// Shared definition for the deterministic corpus-search tool. Declared
// subagents do NOT inherit the root's tools (eve isolation boundary), so both
// the root `tools/` and `subagents/researcher/tools/` re-export this single
// definition to keep the logic in one place.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchFixtureCorpus } from "@demo/domain";
import { CorpusHitSchema } from "@demo/contracts";

// Thin wrapper: validate with the @demo/contracts zod shape, then call the
// pure @demo/domain function. No side effects, no repo needed.
export const searchFixtureCorpusTool = defineTool({
  description:
    "Search the deterministic offline fixture corpus. The same query always returns the same hits; use this instead of live web search.",
  inputSchema: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().positive().max(50).default(5),
  }),
  outputSchema: z.object({
    query: z.string(),
    hits: z.array(CorpusHitSchema),
  }),
  async execute({ query, maxResults }) {
    return searchFixtureCorpus(query, maxResults);
  },
});
