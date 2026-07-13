// Application-owned publication-proposal store (handoff #17: approval is owned
// by the application, not the framework). The store holds the proposal state
// machine that the approval UI writes to and the agent's `get-publication-status`
// tool polls. Proposal state transitions are the pure functions in @demo/domain.
import { approveProposal, createPublicationProposal } from "@demo/domain";
import type { PublicationProposal } from "@demo/contracts";

export interface ProposalStore {
    /** Create and persist a new pending proposal. */
    create(args: {
        id: string;
        threadId: string | null;
        title: string;
        body: string;
    }): Promise<PublicationProposal>;
    /** Fetch one proposal by id, or undefined. */
    get(id: string): Promise<PublicationProposal | undefined>;
    /** Apply an application-owned approve/deny decision (pending -> decided). */
    decide(
        id: string,
        decision: "approved" | "denied",
    ): Promise<PublicationProposal>;
    /** All currently-pending proposals (for the approval surface). */
    listPending(): Promise<PublicationProposal[]>;
    /** Mark a proposal published after the publish effect commits. */
    markPublished(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory store — the default for durable local testing without a DB.
// (Flue's own SQLite adapter in db.ts owns conversation durability; this store
// owns application product state, kept in memory when DATABASE_URL is unset.)
// ---------------------------------------------------------------------------
export class InMemoryProposalStore implements ProposalStore {
    private rows = new Map<string, PublicationProposal>();

    async create(args: {
        id: string;
        threadId: string | null;
        title: string;
        body: string;
    }): Promise<PublicationProposal> {
        if (this.rows.has(args.id)) {
            throw new Error(`duplicate proposal id: ${args.id}`);
        }
        const proposal = createPublicationProposal(args);
        this.rows.set(proposal.id, proposal);
        return { ...proposal };
    }

    async get(id: string): Promise<PublicationProposal | undefined> {
        const row = this.rows.get(id);
        return row ? { ...row } : undefined;
    }

    async decide(
        id: string,
        decision: "approved" | "denied",
    ): Promise<PublicationProposal> {
        const row = this.rows.get(id);
        if (!row) throw new Error(`no proposal: ${id}`);
        const next = approveProposal(row, decision);
        this.rows.set(id, next);
        return { ...next };
    }

    async listPending(): Promise<PublicationProposal[]> {
        return [...this.rows.values()]
            .filter((p) => p.status === "pending")
            .map((p) => ({ ...p }));
    }

    /** Mark a proposal as published (called by the publish tool after commit). */
    async markPublished(id: string): Promise<void> {
        const row = this.rows.get(id);
        if (row) this.rows.set(id, { ...row, status: "published" });
    }
}
