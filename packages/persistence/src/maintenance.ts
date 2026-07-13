// Harness-only maintenance helpers for the durability suite. Framework-neutral.
// These run raw SQL against the shared Postgres so the eval harness can reset
// state BETWEEN scenarios (TRUNCATE, never DROP) and count publication effects
// directly at the table level for the exactly-once pass/fail line.
//
// NOT used by the framework apps at runtime — kept out of index.ts's app-facing
// surface on purpose; import from "@demo/persistence/maintenance".
import type { Pool } from "pg";

/** The demo tables in FK-safe truncation order (children first). */
export const DEMO_TABLES = [
  "publication_effects",
  "publication_proposals",
  "comparison_runs",
  "demo_threads",
] as const;

/**
 * TRUNCATE the demo tables (never DROP). RESTART IDENTITY + CASCADE so a clean
 * slate is guaranteed between scenarios regardless of FK edges.
 */
export async function truncateDemoTables(pool: Pool): Promise<void> {
  await pool.query(
    `TRUNCATE ${DEMO_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export interface EffectCountRow {
  idempotencyKey: string;
  proposalId: string;
  rowCount: number;
  committedCount: number;
  maxAttemptCount: number;
}

/**
 * Count publication_effects grouped by idempotency key + proposal. The
 * exactly-once invariant holds when, for every key, rowCount === 1 and
 * committedCount <= 1 (a committed row has result_json set).
 */
export async function countPublicationEffects(
  pool: Pool,
): Promise<EffectCountRow[]> {
  const { rows } = await pool.query<{
    idempotency_key: string;
    proposal_id: string;
    row_count: string;
    committed_count: string;
    max_attempt_count: number;
  }>(
    `SELECT idempotency_key,
            proposal_id,
            COUNT(*)::int AS row_count,
            COUNT(result_json)::int AS committed_count,
            COALESCE(MAX(attempt_count), 0) AS max_attempt_count
       FROM publication_effects
      GROUP BY idempotency_key, proposal_id`,
  );
  return rows.map((r) => ({
    idempotencyKey: r.idempotency_key,
    proposalId: r.proposal_id,
    rowCount: Number(r.row_count),
    committedCount: Number(r.committed_count),
    maxAttemptCount: Number(r.max_attempt_count),
  }));
}
