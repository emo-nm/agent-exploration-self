// The small persistence interface the effects package depends on.
// Framework-neutral. Implemented by both the in-memory double (tests) and
// the Drizzle/Postgres repo (runtime).
import type { PublicationProposal, ProposalStatus } from "@demo/contracts";

export interface PublicationEffectRow {
    id: string;
    proposalId: string;
    idempotencyKey: string;
    requestChecksum: string;
    resultJson: unknown | null;
    attemptCount: number;
}

export interface CreateEffectInput {
    id: string;
    proposalId: string;
    idempotencyKey: string;
    requestChecksum: string;
}

export interface EffectsRepo {
    /** Return the effect row for this idempotency key, or undefined. */
    getEffectByIdempotencyKey(
        key: string,
    ): Promise<PublicationEffectRow | undefined>;
    /** Insert a new effect row (attemptCount starts at 0). */
    createEffect(input: CreateEffectInput): Promise<PublicationEffectRow>;
    /** Atomically increment attempt_count; returns the new count. */
    incrementAttemptCount(id: string): Promise<number>;
    /** Persist the committed result and return the updated row. */
    saveResult(id: string, resultJson: unknown): Promise<PublicationEffectRow>;
}

// --- Proposals: application-owned approval flow (handoff #17) ---
// The row type is the shared @demo/contracts `PublicationProposal` (structurally
// identical). `ProposalRow` is kept as a compat alias for existing call sites.
export type ProposalRow = PublicationProposal;

export interface CreateProposalInput {
    id: string;
    threadId: string | null;
    title: string;
    body: string;
    status?: ProposalStatus;
    createdAt?: string;
}

export interface ProposalsRepo {
    createProposal(input: CreateProposalInput): Promise<PublicationProposal>;
    getProposal(id: string): Promise<PublicationProposal | undefined>;
    /** Update status (+ decidedAt when moving out of pending); returns the row. */
    setProposalStatus(
        id: string,
        status: ProposalStatus,
        decidedAt?: string | null,
    ): Promise<PublicationProposal>;
}

// --- Threads: app thread <-> framework session mapping (handoff #10, #11) ---
// `continuationStateJson` holds the framework's resume handle (for Eve, the
// serialized `SessionState` cursor). `externalSessionId` is the framework's
// own session/run id, surfaced for stream attach and debugging.
export type Backend = "eve" | "flue" | "mastra";

export interface DemoThreadRow {
    id: string;
    backend: Backend;
    externalSessionId: string | null;
    continuationStateJson: unknown | null;
}
/** Compat alias for the thread row type. */
export type ThreadRow = DemoThreadRow;

export interface UpsertThreadInput {
    id: string;
    backend: Backend;
    externalSessionId?: string | null;
    continuationStateJson?: unknown | null;
}

export interface ThreadsRepo {
    /** Insert-or-update a thread row (full control over session fields). */
    upsertThread(input: UpsertThreadInput): Promise<DemoThreadRow>;
    /** Insert a thread row, or return the existing one for this id. */
    createThread(input: {
        id: string;
        backend: Backend;
    }): Promise<DemoThreadRow>;
    getThread(id: string): Promise<DemoThreadRow | undefined>;
    /** Persist the framework session handle onto the thread row. */
    saveContinuation(
        id: string,
        args: {
            externalSessionId: string | null;
            continuationStateJson: unknown;
        },
    ): Promise<DemoThreadRow>;
}

/** The full application repo surface used by framework adapters/tools. */
export interface DemoRepo extends EffectsRepo, ProposalsRepo, ThreadsRepo {}
