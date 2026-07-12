// Unit tests for the eve tool wrappers against the in-memory repo (no DB, no
// model, no API keys). Exercises the full application-owned approval + publish
// flow and the idempotent/flaky publish effect (handoff §17, §18).
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  InMemoryEffectsRepo,
  InMemoryProposalsRepo,
  InMemoryThreadsRepo,
} from "@demo/persistence";
import type { PublicationProposal } from "@demo/contracts";
import { __setReposForTest, type Repos } from "../agent/lib/repos.js";
import searchTool from "../agent/tools/search_fixture_corpus.js";
import createProposalTool from "../agent/tools/create_publication_proposal.js";
import getStatusTool from "../agent/tools/get_publication_status.js";
import publishTool from "../agent/tools/publish_artifact.js";

// Tool execute's second arg (AI SDK options) is unused by these wrappers.
const opts = {} as never;

let repos: Repos;

beforeEach(() => {
  repos = {
    effects: new InMemoryEffectsRepo(),
    threads: new InMemoryThreadsRepo(),
    proposals: new InMemoryProposalsRepo(),
  };
  __setReposForTest(repos);
  delete process.env.DEMO_FAIL_PUBLISH_ATTEMPTS;
});

afterEach(() => {
  delete process.env.DEMO_FAIL_PUBLISH_ATTEMPTS;
});

describe("search_fixture_corpus", () => {
  it("is deterministic and validates input", async () => {
    const a = await searchTool.execute({ query: "durable agents", maxResults: 5 }, opts);
    const b = await searchTool.execute({ query: "durable agents", maxResults: 5 }, opts);
    expect(a).toEqual(b);
    expect(a).toHaveProperty("hits");
  });
});

describe("proposal + approval + publish flow", () => {
  async function makeProposal(): Promise<PublicationProposal> {
    return createProposalTool.execute(
      { threadId: null, title: "Draft", body: "Grounded body from corpus." },
      opts,
    ) as Promise<PublicationProposal>;
  }

  it("creates a pending proposal", async () => {
    const p = await makeProposal();
    expect(p.status).toBe("pending");
    const status = await getStatusTool.execute({ proposalId: p.id }, opts);
    expect(status.status).toBe("pending");
  });

  it("refuses to publish an unapproved proposal", async () => {
    const p = await makeProposal();
    await expect(
      publishTool.execute({ proposalId: p.id }, opts),
    ).rejects.toThrow(/expected approved/);
  });

  it("publishes once approved and is idempotent on retry", async () => {
    const p = await makeProposal();
    await repos.proposals.setProposalStatus(p.id, "approved", new Date().toISOString());

    const first = await publishTool.execute({ proposalId: p.id }, opts);
    expect(first.receipt.created).toBe(true);
    expect(first.status).toBe("published");

    const second = await publishTool.execute({ proposalId: p.id }, opts);
    expect(second.receipt.created).toBe(false);
    expect(second.receipt.publicationId).toBe(first.receipt.publicationId);
    expect(second.receipt.checksum).toBe(first.receipt.checksum);
    // Exactly one effect row despite two publish calls.
    expect((repos.effects as InMemoryEffectsRepo).size()).toBe(1);
  });

  it("survives the flaky-publish window and still publishes exactly once", async () => {
    process.env.DEMO_FAIL_PUBLISH_ATTEMPTS = "2";
    const p = await makeProposal();
    await repos.proposals.setProposalStatus(p.id, "approved", new Date().toISOString());

    // First two attempts fail deterministically.
    await expect(publishTool.execute({ proposalId: p.id }, opts)).rejects.toThrow();
    await expect(publishTool.execute({ proposalId: p.id }, opts)).rejects.toThrow();
    // Third attempt (same derived idempotency key) commits.
    const ok = await publishTool.execute({ proposalId: p.id }, opts);
    expect(ok.receipt.created).toBe(true);
    expect((repos.effects as InMemoryEffectsRepo).size()).toBe(1);
  });
});
