// Drizzle-backed ProposalStore for the DATABASE_URL path (handoff #10 schema).
// NOTE: [blocked] not exercised here — no DATABASE_URL / Neon in this spike.
// It must typecheck and mirrors InMemoryProposalStore's semantics.
import { eq } from "drizzle-orm";
import { approveProposal, createPublicationProposal } from "@demo/domain";
import type { PublicationProposal } from "@demo/contracts";
import {
    createDatabase,
    demoThreads,
    publicationProposals,
    type Database,
} from "@demo/persistence";
import type { ProposalStore } from "./proposals.ts";

function toProposal(
    r: typeof publicationProposals.$inferSelect,
): PublicationProposal {
    return {
        id: r.id,
        threadId: r.threadId,
        title: r.title,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    };
}

export class DrizzleProposalStore implements ProposalStore {
    constructor(private db: Database = createDatabase()) {}

    async create(args: {
        id: string;
        threadId: string | null;
        title: string;
        body: string;
    }): Promise<PublicationProposal> {
        // Satisfy the demo_threads FK before inserting the proposal.
        if (args.threadId) {
            await this.db
                .insert(demoThreads)
                .values({ id: args.threadId, backend: "flue" })
                .onConflictDoNothing();
        }
        const proposal = createPublicationProposal(args);
        const rows = await this.db
            .insert(publicationProposals)
            .values({
                id: proposal.id,
                threadId: proposal.threadId,
                title: proposal.title,
                body: proposal.body,
                status: "pending",
            })
            .returning();
        return toProposal(rows[0]!);
    }

    async get(id: string): Promise<PublicationProposal | undefined> {
        const rows = await this.db
            .select()
            .from(publicationProposals)
            .where(eq(publicationProposals.id, id))
            .limit(1);
        return rows[0] ? toProposal(rows[0]) : undefined;
    }

    async decide(
        id: string,
        decision: "approved" | "denied",
    ): Promise<PublicationProposal> {
        const current = await this.get(id);
        if (!current) throw new Error(`no proposal: ${id}`);
        const next = approveProposal(current, decision);
        const rows = await this.db
            .update(publicationProposals)
            .set({ status: next.status, decidedAt: new Date(next.decidedAt!) })
            .where(eq(publicationProposals.id, id))
            .returning();
        return toProposal(rows[0]!);
    }

    async listPending(): Promise<PublicationProposal[]> {
        const rows = await this.db
            .select()
            .from(publicationProposals)
            .where(eq(publicationProposals.status, "pending"));
        return rows.map(toProposal);
    }

    async markPublished(id: string): Promise<void> {
        await this.db
            .update(publicationProposals)
            .set({ status: "published" })
            .where(eq(publicationProposals.id, id));
    }
}
