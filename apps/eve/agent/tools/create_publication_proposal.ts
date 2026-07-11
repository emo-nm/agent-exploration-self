// `create_publication_proposal` — thin wrapper: validate input with a
// @demo/contracts-shaped zod schema, build the proposal via @demo/domain, and
// persist a pending row via the ProposalsRepo. Approval is application-owned
// (handoff §17): this tool only ever creates status=pending.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createPublicationProposal } from "@demo/domain";
import { PublicationProposalSchema } from "@demo/contracts";
import { getRepos } from "#lib/repos.js";

export default defineTool({
  description:
    "Create a publication proposal (status: pending) for the drafted artifact. Does NOT publish — a human approves out of band, then call publish_artifact.",
  inputSchema: z.object({
    threadId: z.string().min(1).nullable().default(null),
    title: z.string().min(1),
    body: z.string().min(1),
  }),
  outputSchema: PublicationProposalSchema,
  async execute({ threadId, title, body }) {
    const { proposals } = getRepos();
    const proposal = createPublicationProposal({
      id: `prop_${randomUUID()}`,
      threadId,
      title,
      body,
    });
    return proposals.createProposal(proposal);
  },
});
