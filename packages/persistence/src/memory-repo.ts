// In-memory repo doubles so tests (and DB-less local runs) work WITHOUT a
// live DB.
import type { PublicationProposal, ProposalStatus } from "@demo/contracts";
import type {
  Backend,
  CreateEffectInput,
  CreateProposalInput,
  DemoRepo,
  DemoThreadRow,
  EffectsRepo,
  ProposalsRepo,
  PublicationEffectRow,
  ThreadsRepo,
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


export class InMemoryThreadsRepo implements ThreadsRepo {
  private rows = new Map<string, DemoThreadRow>();

  async upsertThread(input: UpsertThreadInput): Promise<DemoThreadRow> {
    const existing = this.rows.get(input.id);
    const row: DemoThreadRow = {
      id: input.id,
      backend: input.backend,
      externalSessionId:
        input.externalSessionId ?? existing?.externalSessionId ?? null,
      continuationStateJson:
        input.continuationStateJson ?? existing?.continuationStateJson ?? null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async createThread(input: {
    id: string;
    backend: Backend;
  }): Promise<DemoThreadRow> {
    const existing = this.rows.get(input.id);
    if (existing) return { ...existing };
    return this.upsertThread({ id: input.id, backend: input.backend });
  }

  async getThread(id: string): Promise<DemoThreadRow | undefined> {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }

  async saveContinuation(
    id: string,
    args: { externalSessionId: string | null; continuationStateJson: unknown },
  ): Promise<DemoThreadRow> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no thread row: ${id}`);
    row.externalSessionId = args.externalSessionId;
    row.continuationStateJson = args.continuationStateJson;
    return { ...row };
  }
}

export class InMemoryProposalsRepo implements ProposalsRepo {
  private rows = new Map<string, PublicationProposal>();

  async createProposal(input: CreateProposalInput): Promise<PublicationProposal> {
    if (this.rows.has(input.id)) {
      throw new Error(`duplicate proposal id: ${input.id}`);
    }
    const row: PublicationProposal = {
      id: input.id,
      threadId: input.threadId,
      title: input.title,
      body: input.body,
      status: input.status ?? "pending",
      createdAt: input.createdAt ?? new Date().toISOString(),
      decidedAt: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  async getProposal(id: string): Promise<PublicationProposal | undefined> {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }

  async setProposalStatus(
    id: string,
    status: ProposalStatus,
    decidedAt?: string | null,
  ): Promise<PublicationProposal> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no proposal row: ${id}`);
    row.status = status;
    if (decidedAt !== undefined) row.decidedAt = decidedAt;
    return { ...row };
  }
}

/**
 * Full in-memory DemoRepo (effects + proposals + threads) for tests and for the
 * DATABASE_URL-unset runtime path. Composes the granular in-memory repos above
 * so all classes share the merged interface.
 */
export class InMemoryDemoRepo implements DemoRepo {
  private effects = new InMemoryEffectsRepo();
  private proposals = new InMemoryProposalsRepo();
  private threads = new InMemoryThreadsRepo();

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

  createProposal(input: CreateProposalInput) {
    return this.proposals.createProposal(input);
  }
  getProposal(id: string) {
    return this.proposals.getProposal(id);
  }
  setProposalStatus(id: string, status: ProposalStatus, decidedAt?: string | null) {
    return this.proposals.setProposalStatus(id, status, decidedAt);
  }

  upsertThread(input: UpsertThreadInput) {
    return this.threads.upsertThread(input);
  }
  createThread(input: { id: string; backend: Backend }) {
    return this.threads.createThread(input);
  }
  getThread(id: string) {
    return this.threads.getThread(id);
  }
  saveContinuation(
    id: string,
    args: { externalSessionId: string | null; continuationStateJson: unknown },
  ) {
    return this.threads.saveContinuation(id, args);
  }
}
