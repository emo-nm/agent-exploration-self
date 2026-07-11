// In-memory EffectsRepo double so the effects tests run WITHOUT a live DB.
import type {
  CreateEffectInput,
  EffectsRepo,
  PublicationEffectRow,
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
