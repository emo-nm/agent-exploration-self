// `publish_artifact` — revalidates approval (handoff #17) then runs the
// idempotent, deliberately-flaky publish effect (@demo/effects via @demo/domain,
// handoff #18). The idempotency key is derived deterministically from the
// proposal id, so a retried publish reuses the same key and returns the same
// receipt — never a duplicate.
import { defineTool } from "eve/tools";
import { z } from "zod";
import { publishArtifact } from "@demo/effects";
import { PublicationReceiptSchema } from "@demo/contracts";
import { getRepos } from "#lib/repos.js";

export function idempotencyKeyFor(proposalId: string): string {
    return `pub-${proposalId}`;
}

export default defineTool({
    description:
        "Publish an APPROVED proposal through the idempotent publish effect. Retries are safe: reuse this same tool call and the same receipt is returned. Fails if the proposal is not approved.",
    inputSchema: z.object({
        proposalId: z.string().min(1),
        // Optional override; defaults to a stable key derived from the proposal id.
        idempotencyKey: z.string().min(1).optional(),
    }),
    outputSchema: z.object({
        receipt: PublicationReceiptSchema,
        proposalId: z.string(),
        status: z.literal("published"),
    }),
    async execute({ proposalId, idempotencyKey }) {
        const { proposals, effects } = getRepos();
        const proposal = await proposals.getProposal(proposalId);
        if (!proposal) {
            throw new Error(`no such proposal: ${proposalId}`);
        }
        // Revalidate the application-owned approval (handoff #17). "published" is
        // allowed so a retried publish resolves idempotently rather than erroring;
        // only unapproved (pending/denied) proposals are rejected.
        if (proposal.status !== "approved" && proposal.status !== "published") {
            throw new Error(
                `cannot publish proposal ${proposalId}: status is ${proposal.status}, expected approved`,
            );
        }
        // Idempotent, deliberately-flaky effect. The derived key is stable, so a
        // retry reuses it and returns the same receipt (created=false).
        const receipt = await publishArtifact(
            {
                proposalId: proposal.id,
                idempotencyKey: idempotencyKey ?? idempotencyKeyFor(proposalId),
                title: proposal.title,
                body: proposal.body,
            },
            { repo: effects },
        );
        // Record the terminal product state. Idempotent: re-setting is harmless.
        const now = new Date().toISOString();
        await proposals.setProposalStatus(
            proposalId,
            "published",
            proposal.decidedAt ?? now,
        );
        return { receipt, proposalId, status: "published" as const };
    },
});
