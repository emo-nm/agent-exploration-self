// Drizzle-backed EffectsRepo for runtime use against Postgres.
// Not exercised by tests (they use InMemoryEffectsRepo) but must typecheck.
import { eq, sql } from "drizzle-orm";
import type { PublicationProposal, ProposalStatus } from "@demo/contracts";
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
  DemoThreadRow,
  EffectsRepo,
  ProposalsRepo,
  PublicationEffectRow,
  ThreadsRepo,
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


function toProposal(
  r: typeof publicationProposals.$inferSelect,
): PublicationProposal {
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

function toThreadRow(r: typeof demoThreads.$inferSelect): DemoThreadRow {
  return {
    id: r.id,
    backend: r.backend as Backend,
    externalSessionId: r.externalSessionId ?? null,
    continuationStateJson: r.continuationStateJson ?? null,
  };
}

export class DrizzleProposalsRepo implements ProposalsRepo {
  constructor(private db: Database) {}

  async createProposal(input: CreateProposalInput): Promise<PublicationProposal> {
    const rows = await this.db
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
    return toProposal(rows[0]!);
  }

  async getProposal(id: string): Promise<PublicationProposal | undefined> {
    const rows = await this.db
      .select()
      .from(publicationProposals)
      .where(eq(publicationProposals.id, id))
      .limit(1);
    return rows[0] ? toProposal(rows[0]) : undefined;
  }

  async setProposalStatus(
    id: string,
    status: ProposalStatus,
    decidedAt?: string | null,
  ): Promise<PublicationProposal> {
    const rows = await this.db
      .update(publicationProposals)
      .set({
        status,
        ...(decidedAt !== undefined
          ? { decidedAt: decidedAt ? new Date(decidedAt) : null }
          : {}),
      })
      .where(eq(publicationProposals.id, id))
      .returning();
    return toProposal(rows[0]!);
  }
}

export class DrizzleThreadsRepo implements ThreadsRepo {
  constructor(private db: Database) {}

  async upsertThread(input: UpsertThreadInput): Promise<DemoThreadRow> {
    const rows = await this.db
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

  async createThread(input: {
    id: string;
    backend: Backend;
  }): Promise<DemoThreadRow> {
    const rows = await this.db
      .insert(demoThreads)
      .values({ id: input.id, backend: input.backend })
      .onConflictDoNothing()
      .returning();
    if (rows[0]) return toThreadRow(rows[0]);
    const existing = await this.getThread(input.id);
    if (!existing) throw new Error(`failed to create thread ${input.id}`);
    return existing;
  }

  async getThread(id: string): Promise<DemoThreadRow | undefined> {
    const rows = await this.db
      .select()
      .from(demoThreads)
      .where(eq(demoThreads.id, id))
      .limit(1);
    return rows[0] ? toThreadRow(rows[0]) : undefined;
  }

  async saveContinuation(
    id: string,
    args: { externalSessionId: string | null; continuationStateJson: unknown },
  ): Promise<DemoThreadRow> {
    const rows = await this.db
      .update(demoThreads)
      .set({
        externalSessionId: args.externalSessionId,
        continuationStateJson: args.continuationStateJson,
        updatedAt: new Date(),
      })
      .where(eq(demoThreads.id, id))
      .returning();
    return toThreadRow(rows[0]!);
  }
}

/**
 * Drizzle-backed DemoRepo. Runtime path when DATABASE_URL is set. Composes the
 * granular Drizzle repos so all share the merged interface.
 */
export class DrizzleDemoRepo extends DrizzleEffectsRepo implements DemoRepo {
  private proposals: DrizzleProposalsRepo;
  private threads: DrizzleThreadsRepo;

  constructor(db: Database) {
    super(db);
    this.proposals = new DrizzleProposalsRepo(db);
    this.threads = new DrizzleThreadsRepo(db);
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
