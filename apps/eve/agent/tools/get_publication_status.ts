// `get_publication_status` — bounded poll tool. The agent calls this to learn
// whether the application has approved/denied the proposal (handoff §17). It
// reads the ProposalsRepo; it never mutates.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { ProposalStatusSchema } from "@demo/contracts";
import { getRepos } from "#lib/repos.js";

export default defineTool({
  description:
    "Get the current status of a publication proposal (pending | approved | denied | published). Poll this while waiting for application-owned approval.",
  inputSchema: z.object({
    proposalId: z.string().min(1),
  }),
  outputSchema: z.object({
    proposalId: z.string(),
    status: ProposalStatusSchema,
    decidedAt: z.string().nullable(),
  }),
  async execute({ proposalId }) {
    const { proposals } = getRepos();
    const proposal = await proposals.getProposal(proposalId);
    if (!proposal) {
      throw new Error(`no such proposal: ${proposalId}`);
    }
    return {
      proposalId: proposal.id,
      status: proposal.status,
      decidedAt: proposal.decidedAt,
    };
  },
});
