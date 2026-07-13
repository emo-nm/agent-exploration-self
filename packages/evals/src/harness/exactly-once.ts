// The pass/fail line for every durability scenario: the publication side effect
// occurs EXACTLY ONCE. Source-agnostic — works over rows counted from Postgres
// (countPublicationEffects) or from the in-memory repo (listEffects), so the
// same assertion runs in live and dry modes and in unit tests.
import type { EffectCountRow, PublicationEffectRow } from "@demo/persistence";

export interface ExactlyOnceViolation {
  idempotencyKey: string;
  proposalId: string;
  reason: string;
}

export interface ExactlyOnceReport {
  ok: boolean;
  keysChecked: number;
  violations: ExactlyOnceViolation[];
}

/**
 * Fold raw in-memory effect rows into the grouped shape the assertion consumes.
 * committedCount counts rows whose resultJson is set (the effect committed).
 */
export function foldEffectRows(rows: PublicationEffectRow[]): EffectCountRow[] {
  const byKey = new Map<string, EffectCountRow>();
  for (const row of rows) {
    const existing = byKey.get(row.idempotencyKey);
    const committed = row.resultJson != null ? 1 : 0;
    if (existing) {
      existing.rowCount += 1;
      existing.committedCount += committed;
      existing.maxAttemptCount = Math.max(
        existing.maxAttemptCount,
        row.attemptCount,
      );
    } else {
      byKey.set(row.idempotencyKey, {
        idempotencyKey: row.idempotencyKey,
        proposalId: row.proposalId,
        rowCount: 1,
        committedCount: committed,
        maxAttemptCount: row.attemptCount,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Assert exactly-once over grouped effect counts. For every idempotency key:
 *  - exactly one effect row (a duplicate row means the unique key failed);
 *  - at most one committed result (never two receipts for one key).
 * If `expectKeys` is given, each must be present and committed exactly once.
 */
export function assertExactlyOnce(
  counts: EffectCountRow[],
  expectKeys?: string[],
): ExactlyOnceReport {
  const violations: ExactlyOnceViolation[] = [];
  const seen = new Set<string>();

  for (const c of counts) {
    seen.add(c.idempotencyKey);
    if (c.rowCount !== 1) {
      violations.push({
        idempotencyKey: c.idempotencyKey,
        proposalId: c.proposalId,
        reason: `expected 1 effect row, found ${c.rowCount}`,
      });
    }
    if (c.committedCount > 1) {
      violations.push({
        idempotencyKey: c.idempotencyKey,
        proposalId: c.proposalId,
        reason: `expected <=1 committed receipt, found ${c.committedCount}`,
      });
    }
  }

  for (const key of expectKeys ?? []) {
    const c = counts.find((x) => x.idempotencyKey === key);
    if (!c) {
      violations.push({
        idempotencyKey: key,
        proposalId: "",
        reason: "expected key not published (no effect row)",
      });
    } else if (c.committedCount !== 1) {
      violations.push({
        idempotencyKey: key,
        proposalId: c.proposalId,
        reason: `expected exactly 1 committed receipt, found ${c.committedCount}`,
      });
    }
  }

  return {
    ok: violations.length === 0,
    keysChecked: seen.size,
    violations,
  };
}
