// Thin Flue tool: create a pending publication proposal in the
// application-owned store (handoff #17). Approval is NOT granted here.
import { randomUUID } from "node:crypto";
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { PublicationProposalSchema } from "@demo/contracts";
import type { ToolFactoryContext } from "./context.ts";

export function createPublicationProposalTool(ctx: ToolFactoryContext) {
    return defineTool({
        name: "create_publication_proposal",
        description:
            "Create a publication proposal in status 'pending'. Does not publish. The application (a human) must approve it before it can be published.",
        input: v.object({
            title: v.pipe(
                v.string(),
                v.minLength(1),
                v.description("Draft title"),
            ),
            body: v.pipe(
                v.string(),
                v.minLength(1),
                v.description("Draft body"),
            ),
        }),
        output: v.object({
            proposalId: v.string(),
            status: v.string(),
        }),
        async run({ input }) {
            const proposal = await ctx.stores.proposals.create({
                id: `prop_${randomUUID()}`,
                threadId: ctx.threadId,
                title: input.title,
                body: input.body,
            });
            // Revalidate against the shared contract before handing back to the model.
            const validated = PublicationProposalSchema.parse(proposal);
            return { proposalId: validated.id, status: validated.status };
        },
    });
}
