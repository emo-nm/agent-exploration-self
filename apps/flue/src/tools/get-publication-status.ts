// Thin Flue tool: the bounded poll the agent uses to wait for the
// application-owned approval decision (handoff §17: "Agent ... polls through a
// bounded tool"). Read-only.
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { ProposalStatusSchema } from "@demo/contracts";
import type { ToolFactoryContext } from "./context.ts";

export function getPublicationStatusTool(ctx: ToolFactoryContext) {
  return defineTool({
    name: "get_publication_status",
    description:
      "Look up the current status of a publication proposal: pending, approved, denied, or published. Poll this to wait for the human approval decision before publishing.",
    input: v.object({
      proposalId: v.pipe(v.string(), v.minLength(1)),
    }),
    output: v.object({
      proposalId: v.string(),
      found: v.boolean(),
      status: v.nullable(v.string()),
    }),
    async run({ input }) {
      const proposal = await ctx.stores.proposals.get(input.proposalId);
      if (!proposal) {
        return { proposalId: input.proposalId, found: false, status: null };
      }
      return {
        proposalId: proposal.id,
        found: true,
        status: ProposalStatusSchema.parse(proposal.status),
      };
    },
  });
}
