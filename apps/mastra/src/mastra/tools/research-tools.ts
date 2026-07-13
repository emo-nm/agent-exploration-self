// Thin Mastra tool wrappers over the shared framework-neutral layer.
// Pattern (handoff #9): validate input with @demo/contracts → call
// @demo/domain / @demo/effects with a repo from @demo/persistence.
// The core logic lives in exported `*Impl` functions so it is unit-testable
// against an in-memory repo without constructing a Mastra runtime.
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
    ResearchRequestSchema,
    PublicationProposalSchema,
    type PublicationProposal,
    type ProposalStatus,
} from "@demo/contracts";
import {
    searchFixtureCorpus as domainSearch,
    createPublicationProposal as domainCreateProposal,
    proposalChecksum,
} from "@demo/domain";
import { publishArtifact as effectPublish } from "@demo/effects";
import type { DemoRepo, ProposalRow } from "@demo/persistence";

function rowToProposal(row: ProposalRow): PublicationProposal {
    // Re-validate the persisted row against the shared contract on the way out.
    return PublicationProposalSchema.parse({
        id: row.id,
        threadId: row.threadId,
        title: row.title,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
    });
}

let counter = 0;
function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

// --- searchFixtureCorpus ---------------------------------------------------

export function searchFixtureCorpusImpl(input: {
    query: string;
    maxResults?: number;
}) {
    // Reuse the shared request schema to validate the search intent.
    const { prompt, maxResults } = ResearchRequestSchema.parse({
        prompt: input.query,
        maxResults: input.maxResults ?? 5,
    });
    return domainSearch(prompt, maxResults);
}

export const makeSearchFixtureCorpusTool = () =>
    createTool({
        id: "search_fixture_corpus",
        description:
            "Search the deterministic offline fixture corpus. The same query always returns the same hits. Use this instead of live web search.",
        inputSchema: z.object({
            query: z.string().min(1).describe("The search query"),
            maxResults: z.number().int().positive().max(50).optional(),
        }),
        execute: async (inputData) => searchFixtureCorpusImpl(inputData),
    });

// --- createPublicationProposal ---------------------------------------------

export async function createPublicationProposalImpl(
    repo: DemoRepo,
    input: { threadId?: string | null; title: string; body: string },
): Promise<PublicationProposal> {
    // Build a pending proposal via the shared domain function, then persist it.
    const draft = domainCreateProposal({
        id: nextId("prop"),
        threadId: input.threadId ?? null,
        title: input.title,
        body: input.body,
    });
    const row = await repo.createProposal({
        id: draft.id,
        threadId: draft.threadId,
        title: draft.title,
        body: draft.body,
        status: draft.status,
        createdAt: draft.createdAt,
    });
    return rowToProposal(row);
}

export const makeCreatePublicationProposalTool = (repo: DemoRepo) =>
    createTool({
        id: "create_publication_proposal",
        description:
            "Create a publication proposal (status: pending) for the drafted artifact. Approval is application-owned — do not publish until it is approved.",
        inputSchema: z.object({
            threadId: z.string().nullish(),
            title: z.string().min(1),
            body: z.string().min(1),
        }),
        outputSchema: z.object({
            id: z.string(),
            status: z.string(),
        }),
        execute: async (inputData) => {
            const proposal = await createPublicationProposalImpl(
                repo,
                inputData,
            );
            return { id: proposal.id, status: proposal.status };
        },
    });

// --- getPublicationStatus --------------------------------------------------

export async function getPublicationStatusImpl(
    repo: DemoRepo,
    proposalId: string,
): Promise<{ proposalId: string; status: ProposalStatus | "unknown" }> {
    const row = await repo.getProposal(proposalId);
    return { proposalId, status: row ? row.status : "unknown" };
}

export const makeGetPublicationStatusTool = (repo: DemoRepo) =>
    createTool({
        id: "get_publication_status",
        description:
            "Poll the application-owned approval status of a proposal (pending | approved | denied | published). Publish only once it is approved.",
        inputSchema: z.object({ proposalId: z.string().min(1) }),
        outputSchema: z.object({ proposalId: z.string(), status: z.string() }),
        execute: async (inputData) =>
            getPublicationStatusImpl(repo, inputData.proposalId),
    });

// --- publishArtifact -------------------------------------------------------

export async function publishArtifactImpl(
    repo: DemoRepo,
    input: { proposalId: string; idempotencyKey?: string },
) {
    const row = await repo.getProposal(input.proposalId);
    if (!row) throw new Error(`no proposal: ${input.proposalId}`);
    const proposal = rowToProposal(row);
    // Revalidate status (#17): only an approved proposal may publish. `published`
    // is also allowed so a retry (e.g. after a crash-before-status-update, or a
    // duplicate tool call) is idempotent rather than an error.
    if (proposal.status !== "approved" && proposal.status !== "published") {
        throw new Error(
            `cannot publish proposal ${proposal.id}: status is ${proposal.status}, expected approved`,
        );
    }
    const idempotencyKey = input.idempotencyKey ?? `pub_${proposal.id}`;
    const receipt = await effectPublish(
        {
            proposalId: proposal.id,
            idempotencyKey,
            title: proposal.title,
            body: proposal.body,
        },
        { repo },
    );
    // Mark the proposal published (idempotent — safe to repeat).
    if (proposal.status !== "published") {
        await repo.setProposalStatus(proposal.id, "published");
    }
    return { receipt, checksum: proposalChecksum(proposal) };
}

export const makePublishArtifactTool = (repo: DemoRepo) =>
    createTool({
        id: "publish_artifact",
        description:
            "Publish an approved proposal through the idempotent publish effect. Retries MUST reuse the same idempotencyKey so the same receipt is returned and no duplicate is created.",
        inputSchema: z.object({
            proposalId: z.string().min(1),
            idempotencyKey: z.string().min(1).optional(),
        }),
        outputSchema: z.object({
            publicationId: z.string(),
            created: z.boolean(),
            checksum: z.string(),
        }),
        execute: async (inputData) => {
            const { receipt } = await publishArtifactImpl(repo, inputData);
            return receipt;
        },
    });

export function makeResearchTools(repo: DemoRepo) {
    return {
        search_fixture_corpus: makeSearchFixtureCorpusTool(),
        create_publication_proposal: makeCreatePublicationProposalTool(repo),
        get_publication_status: makeGetPublicationStatusTool(repo),
        publish_artifact: makePublishArtifactTool(repo),
    };
}
