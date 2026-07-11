// Drizzle-backed EffectsRepo for runtime use against Postgres.
// Not exercised by tests (they use InMemoryEffectsRepo) but must typecheck.
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { publicationEffects } from "./schema.js";
import type {
  CreateEffectInput,
  EffectsRepo,
  PublicationEffectRow,
} from "./repo.js";

function toRow(r: typeof publicationEffects.$inferSelect): PublicationEffectRow {
  return {
    id: r.id,
    proposalId: r.proposalId,
    idempotencyKey: r.idempotencyKey,
    requestChecksum: r.requestChecksum,
    resultJson: r.resultJson ?? null,
    attemptCount: r.attemptCount,
  };
}

export class DrizzleEffectsRepo implements EffectsRepo {
  constructor(private db: Database) {}

  async getEffectByIdempotencyKey(
    key: string,
  ): Promise<PublicationEffectRow | undefined> {
    const rows = await this.db
      .select()
      .from(publicationEffects)
      .where(eq(publicationEffects.idempotencyKey, key))
      .limit(1);
    const r = rows[0];
    return r ? toRow(r) : undefined;
  }

  async createEffect(input: CreateEffectInput): Promise<PublicationEffectRow> {
    const rows = await this.db
      .insert(publicationEffects)
      .values({
        id: input.id,
        proposalId: input.proposalId,
        idempotencyKey: input.idempotencyKey,
        requestChecksum: input.requestChecksum,
        attemptCount: 0,
      })
      .returning();
    return toRow(rows[0]!);
  }

  async incrementAttemptCount(id: string): Promise<number> {
    const rows = await this.db
      .update(publicationEffects)
      .set({
        attemptCount: sql`${publicationEffects.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(publicationEffects.id, id))
      .returning({ attemptCount: publicationEffects.attemptCount });
    return rows[0]!.attemptCount;
  }

  async saveResult(id: string, resultJson: unknown): Promise<PublicationEffectRow> {
    const rows = await this.db
      .update(publicationEffects)
      .set({ resultJson, updatedAt: new Date() })
      .where(eq(publicationEffects.id, id))
      .returning();
    return toRow(rows[0]!);
  }
}
