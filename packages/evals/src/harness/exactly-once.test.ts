import { describe, it, expect } from "vitest";
import { InMemoryEffectsRepo } from "@demo/persistence";
import { publishArtifact } from "@demo/effects";
import { assertExactlyOnce, foldEffectRows } from "./exactly-once.js";

const input = {
  proposalId: "p1",
  idempotencyKey: "pub-p1",
  title: "T",
  body: "B",
};

describe("assertExactlyOnce", () => {
  it("passes for a single committed row per key", () => {
    const report = assertExactlyOnce(
      [{ idempotencyKey: "pub-p1", proposalId: "p1", rowCount: 1, committedCount: 1, maxAttemptCount: 1 }],
      ["pub-p1"],
    );
    expect(report.ok).toBe(true);
    expect(report.keysChecked).toBe(1);
  });

  it("fails when a key has two rows (unique-key breach)", () => {
    const report = assertExactlyOnce([
      { idempotencyKey: "pub-p1", proposalId: "p1", rowCount: 2, committedCount: 1, maxAttemptCount: 1 },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations[0]?.reason).toMatch(/1 effect row/);
  });

  it("fails when a key committed twice (two receipts)", () => {
    const report = assertExactlyOnce([
      { idempotencyKey: "pub-p1", proposalId: "p1", rowCount: 1, committedCount: 2, maxAttemptCount: 2 },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations[0]?.reason).toMatch(/committed receipt/);
  });

  it("fails when an expected key never published", () => {
    const report = assertExactlyOnce([], ["pub-p1"]);
    expect(report.ok).toBe(false);
    expect(report.violations[0]?.reason).toMatch(/not published/);
  });
});

describe("foldEffectRows + real duplicate publish", () => {
  it("duplicate publish through the effect folds to exactly-once", async () => {
    const repo = new InMemoryEffectsRepo();
    await publishArtifact(input, { repo, env: { failAttempts: 0 } });
    await publishArtifact(input, { repo, env: { failAttempts: 0 } }); // duplicate
    const counts = foldEffectRows(repo.listEffects());
    expect(counts).toHaveLength(1);
    expect(counts[0]?.rowCount).toBe(1);
    expect(counts[0]?.committedCount).toBe(1);
    expect(assertExactlyOnce(counts, ["pub-p1"]).ok).toBe(true);
  });

  it("a mid-commit crash (paused, never committed) then retry stays exactly-once", async () => {
    const repo = new InMemoryEffectsRepo();
    // First attempt fails before committing (simulates kill mid-tool-work).
    await expect(
      publishArtifact(input, { repo, env: { failAttempts: 1 } }),
    ).rejects.toThrow();
    // Retry (same key) commits once.
    await publishArtifact(input, { repo, env: { failAttempts: 1 } });
    const counts = foldEffectRows(repo.listEffects());
    expect(assertExactlyOnce(counts, ["pub-p1"]).ok).toBe(true);
    expect(counts[0]?.maxAttemptCount).toBe(2);
  });
});
