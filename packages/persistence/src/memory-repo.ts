// In-memory EffectsRepo double so the effects tests run WITHOUT a live DB.
import type {
  CreateEffectInput,
  CreateProposalInput,
  DemoRepo,
  EffectsRepo,
  ProposalRow,
  ProposalStatus,
  PublicationEffectRow,
  ThreadRow,
  UpsertThreadInput,
} from "./repo.js";

export class InMemoryEffectsRepo implements EffectsRepo {
  private rows = new Map<string, PublicationEffectRow>(); // id -> row
  private byKey = new Map<string, string>(); // idempotencyKey -> id

  async getEffectByIdempotencyKey(
    key: string,
  ): Promise<PublicationEffectRow | undefined> {
    const id = this.byKey.get(key);
    if (id === undefined) return undefined;
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }

  async createEffect(input: CreateEffectInput): Promise<PublicationEffectRow> {
    if (this.byKey.has(input.idempotencyKey)) {
      throw new Error(
        `duplicate idempotency_key: ${input.idempotencyKey} (UNIQUE violation)`,
      );
    }
    const row: PublicationEffectRow = {
      id: input.id,
      proposalId: input.proposalId,
      idempotencyKey: input.idempotencyKey,
      requestChecksum: input.requestChecksum,
      resultJson: null,
      attemptCount: 0,
    };
    this.rows.set(row.id, row);
    this.byKey.set(row.idempotencyKey, row.id);
    return { ...row };
  }

  async incrementAttemptCount(id: string): Promise<number> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no effect row: ${id}`);
    row.attemptCount += 1;
    return row.attemptCount;
  }

  async saveResult(id: string, resultJson: unknown): Promise<PublicationEffectRow> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no effect row: ${id}`);
    row.resultJson = resultJson;
    return { ...row };
  }

  /** Test helper: total distinct effect rows. */
  size(): number {
    return this.rows.size;
  }
}

/**
 * Full in-memory DemoRepo (effects + proposals + threads) for tests and for the
 * DATABASE_URL-unset runtime path. Composes the effects double above.
 */
export class InMemoryDemoRepo implements DemoRepo {
  private effects = new InMemoryEffectsRepo();
  private proposals = new Map<string, ProposalRow>();
  private threads = new Map<string, ThreadRow>();

  // EffectsRepo (delegate)
  getEffectByIdempotencyKey(key: string) {
    return this.effects.getEffectByIdempotencyKey(key);
  }
  createEffect(input: CreateEffectInput) {
    return this.effects.createEffect(input);
  }
  incrementAttemptCount(id: string) {
    return this.effects.incrementAttemptCount(id);
  }
  saveResult(id: string, resultJson: unknown) {
    return this.effects.saveResult(id, resultJson);
  }

  // ProposalsRepo
  async createProposal(input: CreateProposalInput): Promise<ProposalRow> {
    if (this.proposals.has(input.id)) {
      throw new Error(`duplicate proposal id: ${input.id}`);
    }
    const row: ProposalRow = {
      id: input.id,
      threadId: input.threadId,
      title: input.title,
      body: input.body,
      status: input.status ?? "pending",
      createdAt: input.createdAt ?? new Date().toISOString(),
      decidedAt: null,
    };
    this.proposals.set(row.id, row);
    return { ...row };
  }

  async getProposal(id: string): Promise<ProposalRow | undefined> {
    const row = this.proposals.get(id);
    return row ? { ...row } : undefined;
  }

  async setProposalStatus(
    id: string,
    status: ProposalStatus,
    decidedAt?: string | null,
  ): Promise<ProposalRow> {
    const row = this.proposals.get(id);
    if (!row) throw new Error(`no proposal: ${id}`);
    row.status = status;
    if (decidedAt !== undefined) row.decidedAt = decidedAt;
    return { ...row };
  }

  // ThreadsRepo
  async upsertThread(input: UpsertThreadInput): Promise<ThreadRow> {
    const existing = this.threads.get(input.id);
    const row: ThreadRow = {
      id: input.id,
      backend: input.backend,
      externalSessionId:
        input.externalSessionId ?? existing?.externalSessionId ?? null,
      continuationStateJson:
        input.continuationStateJson ?? existing?.continuationStateJson ?? null,
    };
    this.threads.set(row.id, row);
    return { ...row };
  }

  async getThread(id: string): Promise<ThreadRow | undefined> {
    const row = this.threads.get(id);
    return row ? { ...row } : undefined;
  }
}
