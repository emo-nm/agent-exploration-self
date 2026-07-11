// In-memory repo doubles so tests (and DB-less local runs) work WITHOUT a
// live DB.
import type { PublicationProposal, ProposalStatus } from "@demo/contracts";
import type {
  Backend,
  CreateEffectInput,
  DemoThreadRow,
  EffectsRepo,
  ProposalsRepo,
  PublicationEffectRow,
  ThreadsRepo,
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

  async createThread(input: {
    id: string;
    backend: Backend;
  }): Promise<DemoThreadRow> {
    const existing = this.rows.get(input.id);
    if (existing) return { ...existing };
    const row: DemoThreadRow = {
      id: input.id,
      backend: input.backend,
      externalSessionId: null,
      continuationStateJson: null,
    };
    this.rows.set(row.id, row);
    return { ...row };
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

  async createProposal(
    proposal: PublicationProposal,
  ): Promise<PublicationProposal> {
    if (this.rows.has(proposal.id)) {
      throw new Error(`duplicate proposal id: ${proposal.id}`);
    }
    this.rows.set(proposal.id, { ...proposal });
    return { ...proposal };
  }

  async getProposal(id: string): Promise<PublicationProposal | undefined> {
    const row = this.rows.get(id);
    return row ? { ...row } : undefined;
  }

  async setStatus(
    id: string,
    status: ProposalStatus,
    decidedAt: string | null,
  ): Promise<PublicationProposal> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no proposal row: ${id}`);
    row.status = status;
    row.decidedAt = decidedAt;
    return { ...row };
  }
}
