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
