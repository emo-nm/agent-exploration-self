// Drizzle-backed EffectsRepo for runtime use against Postgres.
// Not exercised by tests (they use InMemoryEffectsRepo) but must typecheck.
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  demoThreads,
  publicationEffects,
  publicationProposals,
} from "./schema.js";
import type {
  Backend,
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

function toProposalRow(
  r: typeof publicationProposals.$inferSelect,
): ProposalRow {
  return {
    id: r.id,
    threadId: r.threadId ?? null,
    title: r.title,
    body: r.body,
    status: r.status as ProposalStatus,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
  };
}

function toThreadRow(r: typeof demoThreads.$inferSelect): ThreadRow {
  return {
    id: r.id,
    backend: r.backend as Backend,
    externalSessionId: r.externalSessionId ?? null,
    continuationStateJson: r.continuationStateJson ?? null,
  };
}

/**
 * Drizzle-backed DemoRepo. Runtime path when DATABASE_URL is set. Not exercised
 * by tests (they use InMemoryDemoRepo) but must typecheck.
 */
export class DrizzleDemoRepo extends DrizzleEffectsRepo implements DemoRepo {
  constructor(private database: Database) {
    super(database);
  }

  async createProposal(input: CreateProposalInput): Promise<ProposalRow> {
    const rows = await this.database
      .insert(publicationProposals)
      .values({
        id: input.id,
        threadId: input.threadId,
        title: input.title,
        body: input.body,
        status: input.status ?? "pending",
        ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
      })
      .returning();
    return toProposalRow(rows[0]!);
  }

  async getProposal(id: string): Promise<ProposalRow | undefined> {
    const rows = await this.database
      .select()
      .from(publicationProposals)
      .where(eq(publicationProposals.id, id))
      .limit(1);
    const r = rows[0];
    return r ? toProposalRow(r) : undefined;
  }

  async setProposalStatus(
    id: string,
    status: ProposalStatus,
    decidedAt?: string | null,
  ): Promise<ProposalRow> {
    const rows = await this.database
      .update(publicationProposals)
      .set({
        status,
        ...(decidedAt !== undefined
          ? { decidedAt: decidedAt ? new Date(decidedAt) : null }
          : {}),
      })
      .where(eq(publicationProposals.id, id))
      .returning();
    return toProposalRow(rows[0]!);
  }

  async upsertThread(input: UpsertThreadInput): Promise<ThreadRow> {
    const rows = await this.database
      .insert(demoThreads)
      .values({
        id: input.id,
        backend: input.backend,
        externalSessionId: input.externalSessionId ?? null,
        continuationStateJson: input.continuationStateJson ?? null,
      })
      .onConflictDoUpdate({
        target: demoThreads.id,
        set: {
          externalSessionId: input.externalSessionId ?? null,
          continuationStateJson: input.continuationStateJson ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toThreadRow(rows[0]!);
  }

  async getThread(id: string): Promise<ThreadRow | undefined> {
    const rows = await this.database
      .select()
      .from(demoThreads)
      .where(eq(demoThreads.id, id))
      .limit(1);
    const r = rows[0];
    return r ? toThreadRow(r) : undefined;
  }
}
