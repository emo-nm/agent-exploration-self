// Drizzle schema — shared application-owned product state (handoff §10).
// Framework-neutral: NO Eve/Flue/Mastra/Smithers imports.
import {
  pgTable,
  pgEnum,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// NOTE: backend enum includes `mastra` (added to STATE.md after the handoff
// was written — the §10 text still says only eve|flue).
export const backendEnum = pgEnum("backend", ["eve", "flue", "mastra"]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "approved",
  "denied",
  "published",
]);

export const demoThreads = pgTable("demo_threads", {
  id: text("id").primaryKey(),
  backend: backendEnum("backend").notNull(),
  externalSessionId: text("external_session_id"),
  continuationStateJson: jsonb("continuation_state_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publicationProposals = pgTable("publication_proposals", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").references(() => demoThreads.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: proposalStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

export const publicationEffects = pgTable(
  "publication_effects",
  {
    id: text("id").primaryKey(),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => publicationProposals.id),
    idempotencyKey: text("idempotency_key").notNull(),
    requestChecksum: text("request_checksum").notNull(),
    resultJson: jsonb("result_json"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idempotencyKeyUnique: uniqueIndex("publication_effects_idempotency_key_unique").on(
      t.idempotencyKey,
    ),
  }),
);

export const comparisonRuns = pgTable("comparison_runs", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  eveThreadId: text("eve_thread_id"),
  flueThreadId: text("flue_thread_id"),
  smithersRunId: text("smithers_run_id"),
  metricsJson: jsonb("metrics_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  backendEnum,
  proposalStatusEnum,
  demoThreads,
  publicationProposals,
  publicationEffects,
  comparisonRuns,
};
