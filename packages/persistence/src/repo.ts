// The small persistence interface the effects package depends on.
// Framework-neutral. Implemented by both the in-memory double (tests) and
// the Drizzle/Postgres repo (runtime).

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
  getEffectByIdempotencyKey(key: string): Promise<PublicationEffectRow | undefined>;
  /** Insert a new effect row (attemptCount starts at 0). */
  createEffect(input: CreateEffectInput): Promise<PublicationEffectRow>;
  /** Atomically increment attempt_count; returns the new count. */
  incrementAttemptCount(id: string): Promise<number>;
  /** Persist the committed result and return the updated row. */
  saveResult(id: string, resultJson: unknown): Promise<PublicationEffectRow>;
}

// --- proposals (application-owned approval flow, handoff §17) ---

export type ProposalStatus = "pending" | "approved" | "denied" | "published";

export interface ProposalRow {
  id: string;
  threadId: string | null;
  title: string;
  body: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
}

export interface CreateProposalInput {
  id: string;
  threadId: string | null;
  title: string;
  body: string;
  status?: ProposalStatus;
  createdAt?: string;
}

export interface ProposalsRepo {
  createProposal(input: CreateProposalInput): Promise<ProposalRow>;
  getProposal(id: string): Promise<ProposalRow | undefined>;
  /** Update status (+ decidedAt when moving out of pending); returns the row. */
  setProposalStatus(
    id: string,
    status: ProposalStatus,
    decidedAt?: string | null,
  ): Promise<ProposalRow>;
}

// --- threads (app thread id → framework session/thread/resource ids, §11) ---

export type Backend = "eve" | "flue" | "mastra";

export interface ThreadRow {
  id: string;
  backend: Backend;
  externalSessionId: string | null;
  continuationStateJson: unknown | null;
}

export interface UpsertThreadInput {
  id: string;
  backend: Backend;
  externalSessionId?: string | null;
  continuationStateJson?: unknown | null;
}

export interface ThreadsRepo {
  upsertThread(input: UpsertThreadInput): Promise<ThreadRow>;
  getThread(id: string): Promise<ThreadRow | undefined>;
}

/** The full application repo surface used by framework adapters/tools. */
export interface DemoRepo extends EffectsRepo, ProposalsRepo, ThreadsRepo {}
