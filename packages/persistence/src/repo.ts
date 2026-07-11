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
  getEffectByIdempotencyKey(key: string): Promise<PublicationEffectRow | undefined>;
  /** Insert a new effect row (attemptCount starts at 0). */
  createEffect(input: CreateEffectInput): Promise<PublicationEffectRow>;
  /** Atomically increment attempt_count; returns the new count. */
  incrementAttemptCount(id: string): Promise<number>;
  /** Persist the committed result and return the updated row. */
  saveResult(id: string, resultJson: unknown): Promise<PublicationEffectRow>;
}

// --- Threads: app thread <-> framework session mapping (handoff §10, §11) ---
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

export interface ThreadsRepo {
  /** Insert a thread row, or return the existing one for this id. */
  createThread(input: { id: string; backend: Backend }): Promise<DemoThreadRow>;
  getThread(id: string): Promise<DemoThreadRow | undefined>;
  /** Persist the framework session handle onto the thread row. */
  saveContinuation(
    id: string,
    args: { externalSessionId: string | null; continuationStateJson: unknown },
  ): Promise<DemoThreadRow>;
}

// --- Proposals: application-owned approval flow (handoff §17) ---
export interface ProposalsRepo {
  createProposal(proposal: PublicationProposal): Promise<PublicationProposal>;
  getProposal(id: string): Promise<PublicationProposal | undefined>;
  /** Apply a decision (approved/denied/published) and stamp decidedAt. */
  setStatus(
    id: string,
    status: ProposalStatus,
    decidedAt: string | null,
  ): Promise<PublicationProposal>;
}
