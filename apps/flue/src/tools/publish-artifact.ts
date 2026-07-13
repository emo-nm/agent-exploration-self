// Thin Flue tool: publish an approved proposal through the idempotent, flaky
// @demo/effects publish effect (handoff #18). Revalidates approval (#17) and
// reuses a stable idempotency key so retries return the same receipt.
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { PublicationReceiptSchema } from "@demo/contracts";
import { publishApprovedProposal } from "@demo/domain";
import { publishArtifact } from "@demo/effects";
import type { ToolFactoryContext } from "./context.ts";

export function publishArtifactTool(ctx: ToolFactoryContext) {
    return defineTool({
        name: "publish_artifact",
        description:
            "Publish an APPROVED publication proposal. Idempotent: pass a stable idempotencyKey and retries return the same receipt without creating duplicates. Fails if the proposal is not approved.",
        input: v.object({
            proposalId: v.pipe(v.string(), v.minLength(1)),
            idempotencyKey: v.pipe(
                v.optional(v.string()),
                v.description(
                    "Stable key for exactly-once publish. Defaults to a key derived from the proposal id; reuse the same value on retry.",
                ),
            ),
        }),
        output: v.object({
            publicationId: v.string(),
            created: v.boolean(),
            checksum: v.string(),
        }),
        async run({ input }) {
            const proposal = await ctx.stores.proposals.get(input.proposalId);
            if (!proposal) {
                throw new Error(`no such proposal: ${input.proposalId}`);
            }
            const idempotencyKey = input.idempotencyKey ?? `pub_${proposal.id}`;

            // Revalidate the application-owned status (#17) and publish idempotently.
            let receipt;
            if (proposal.status === "approved") {
                // First publish: domain guards approved-only and drives the effect.
                receipt = await publishApprovedProposal(
                    proposal,
                    idempotencyKey,
                    {
                        repo: ctx.stores.effects,
                    },
                );
                if (receipt.created) {
                    await ctx.stores.proposals.markPublished(proposal.id);
                }
            } else if (proposal.status === "published") {
                // Duplicate publish of an already-published proposal: the effect is
                // idempotent by key and returns the identical receipt (created=false).
                receipt = await publishArtifact(
                    {
                        proposalId: proposal.id,
                        idempotencyKey,
                        title: proposal.title,
                        body: proposal.body,
                    },
                    { repo: ctx.stores.effects },
                );
            } else {
                throw new Error(
                    `cannot publish proposal ${proposal.id}: status is ${proposal.status}, expected approved`,
                );
            }
            return PublicationReceiptSchema.parse(receipt);
        },
    });
}
