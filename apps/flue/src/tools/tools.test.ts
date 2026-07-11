import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { InferInput } from "valibot";
import { getStores, resetStores } from "../shared/stores.ts";
import type { ToolFactoryContext } from "./context.ts";
import { searchFixtureCorpusTool } from "./search-fixture-corpus.ts";
import { createPublicationProposalTool } from "./create-publication-proposal.ts";
import { getPublicationStatusTool } from "./get-publication-status.ts";
import { publishArtifactTool } from "./publish-artifact.ts";

// Minimal ToolContext shim: the tools only read `input` here.
function call<T extends { run: (ctx: any) => any }>(tool: T, input: unknown) {
  return tool.run({ input } as any);
}

let ctx: ToolFactoryContext;

beforeEach(() => {
  resetStores();
  delete process.env.DATABASE_URL;
  delete process.env.DEMO_FAIL_PUBLISH_ATTEMPTS;
  ctx = { threadId: "thread-1", stores: getStores() };
});

afterEach(() => {
  delete process.env.DEMO_FAIL_PUBLISH_ATTEMPTS;
});

describe("stores factory", () => {
  it("uses the in-memory backend when DATABASE_URL is unset", () => {
    expect(ctx.stores.backend).toBe("memory");
  });
});

describe("search_fixture_corpus", () => {
  it("returns deterministic hits for the same query", async () => {
    const tool = searchFixtureCorpusTool(ctx);
    const a = await call(tool, { query: "durable workflow", maxResults: 3 });
    const b = await call(tool, { query: "durable workflow", maxResults: 3 });
    expect(a).toEqual(b);
    expect(a.query).toBe("durable workflow");
    expect(Array.isArray(a.hits)).toBe(true);
    expect(a.hits.length).toBeLessThanOrEqual(3);
  });

  it("applies the contract default of 5 max results", async () => {
    const tool = searchFixtureCorpusTool(ctx);
    const r = await call(tool, { query: "the" });
    expect(r.hits.length).toBeLessThanOrEqual(5);
  });
});

describe("proposal + approval + publish loop", () => {
  it("creates pending, reflects the app-owned decision, then publishes idempotently", async () => {
    const create = createPublicationProposalTool(ctx);
    const status = getPublicationStatusTool(ctx);
    const publish = publishArtifactTool(ctx);

    const created = await call(create, { title: "T", body: "B" });
    expect(created.status).toBe("pending");
    const proposalId = created.proposalId;

    const pending = await call(status, { proposalId });
    expect(pending).toEqual({ proposalId, found: true, status: "pending" });

    // Publishing an unapproved proposal must fail (approval is app-owned).
    await expect(call(publish, { proposalId })).rejects.toThrow(/approved/);

    // Application approves out-of-band (what the HTTP route / UI would do).
    await ctx.stores.proposals.decide(proposalId, "approved");
    expect((await call(status, { proposalId })).status).toBe("approved");

    const first = await call(publish, { proposalId });
    expect(first.created).toBe(true);
    expect(first.publicationId).toBeTruthy();

    // Duplicate publish reuses the idempotency key -> same receipt, created=false.
    const second = await call(publish, { proposalId });
    expect(second.created).toBe(false);
    expect(second.publicationId).toBe(first.publicationId);
    expect(second.checksum).toBe(first.checksum);

    expect((await call(status, { proposalId })).status).toBe("published");
  });

  it("get_publication_status reports not-found for unknown ids", async () => {
    const status = getPublicationStatusTool(ctx);
    expect(await call(status, { proposalId: "nope" })).toEqual({
      proposalId: "nope",
      found: false,
      status: null,
    });
  });
});

describe("failure injection (handoff §18)", () => {
  it("fails the configured first attempt, then publishes once approved", async () => {
    process.env.DEMO_FAIL_PUBLISH_ATTEMPTS = "1";
    const create = createPublicationProposalTool(ctx);
    const publish = publishArtifactTool(ctx);
    const { proposalId } = await call(create, { title: "T", body: "B" });
    await ctx.stores.proposals.decide(proposalId, "approved");

    // First attempt is configured to fail.
    await expect(call(publish, { proposalId })).rejects.toThrow(/attempt 1/);
    // Retry (same default idempotency key) succeeds and creates exactly one publication.
    const receipt = await call(publish, { proposalId });
    expect(receipt.created).toBe(true);
    // A further call is idempotent.
    expect((await call(publish, { proposalId })).created).toBe(false);
  });
});

// Type-level: ensure the valibot input schema is inferable (compile check).
type _SearchInput = InferInput<
  NonNullable<ReturnType<typeof searchFixtureCorpusTool>["input"]>
>;
