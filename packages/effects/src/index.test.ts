import { describe, it, expect } from "vitest";
import { InMemoryEffectsRepo } from "@demo/persistence";
import { publishArtifact, type PublishArtifactInput } from "./index.js";

const input: PublishArtifactInput = {
  proposalId: "p1",
  idempotencyKey: "key-1",
  title: "Durable Execution",
  body: "A comparison of agent frameworks.",
};

describe("publishArtifact idempotency", () => {
  it("duplicate key returns the same receipt, created=false, exactly one row", async () => {
    const repo = new InMemoryEffectsRepo();
    const first = await publishArtifact(input, { repo, env: { failAttempts: 0 } });
    expect(first.created).toBe(true);

    const second = await publishArtifact(input, { repo, env: { failAttempts: 0 } });
    expect(second.created).toBe(false);
    expect(second.publicationId).toBe(first.publicationId);
    expect(second.checksum).toBe(first.checksum);
    expect(repo.size()).toBe(1);
  });
});

describe("publishArtifact failure injection", () => {
  it("fails the first N attempts, then succeeds; attempt_count is correct", async () => {
    const repo = new InMemoryEffectsRepo();
    const deps = { repo, env: { failAttempts: 2 } };

    await expect(publishArtifact(input, deps)).rejects.toThrow(/attempt 1/);
    await expect(publishArtifact(input, deps)).rejects.toThrow(/attempt 2/);

    const receipt = await publishArtifact(input, deps);
    expect(receipt.created).toBe(true);

    const row = await repo.getEffectByIdempotencyKey(input.idempotencyKey);
    expect(row?.attemptCount).toBe(3);
    expect(repo.size()).toBe(1);
  });

  it("does not re-increment once committed", async () => {
    const repo = new InMemoryEffectsRepo();
    const deps = { repo, env: { failAttempts: 0 } };
    await publishArtifact(input, deps);
    await publishArtifact(input, deps);
    const row = await repo.getEffectByIdempotencyKey(input.idempotencyKey);
    expect(row?.attemptCount).toBe(1);
  });
});

describe("publishArtifact crash checkpoint", () => {
  it("invokes injected crash after the effect commits", async () => {
    const repo = new InMemoryEffectsRepo();
    let crashed = false;
    const receipt = await publishArtifact(input, {
      repo,
      env: { failAttempts: 0, crashAfterEffect: true },
      crash: () => {
        crashed = true;
      },
    });
    expect(receipt.created).toBe(true);
    expect(crashed).toBe(true);
    // Effect committed before the crash → a second call returns the receipt.
    const row = await repo.getEffectByIdempotencyKey(input.idempotencyKey);
    expect(row?.resultJson).toBeTruthy();
  });
});
