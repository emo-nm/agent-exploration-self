// Thin Flue tool: validate model input with @demo/contracts (zod), then call
// the deterministic @demo/domain search. Flue tool schemas are Valibot; the
// authoritative contract validation stays zod (a recorded friction point).
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { ResearchRequestSchema, ResearchResultSchema } from "@demo/contracts";
import { searchFixtureCorpus } from "@demo/domain";
import type { ToolFactoryContext } from "./context.ts";

export function searchFixtureCorpusTool(_ctx: ToolFactoryContext) {
  return defineTool({
    name: "search_fixture_corpus",
    description:
      "Search the deterministic offline fixture corpus for a query and return the top scored document hits. Same query always returns the same hits.",
    input: v.object({
      query: v.pipe(v.string(), v.minLength(1), v.description("Search query")),
      maxResults: v.pipe(
        v.optional(v.number()),
        v.description("Max hits to return (1-50, default 5)"),
      ),
    }),
    output: v.object({
      query: v.string(),
      hits: v.array(
        v.object({
          docId: v.string(),
          title: v.string(),
          snippet: v.string(),
          score: v.number(),
        }),
      ),
    }),
    async run({ input }) {
      // Authoritative validation + defaults via the shared zod contract.
      const request = ResearchRequestSchema.parse({
        prompt: input.query,
        maxResults: input.maxResults,
      });
      const result = searchFixtureCorpus(request.prompt, request.maxResults);
      return ResearchResultSchema.parse(result);
    },
  });
}
