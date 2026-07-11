import { describe, it, expect } from "vitest";
import { ResearchRequestSchema, ResearchResultSchema } from "@demo/contracts";
import { InMemoryEffectsRepo } from "@demo/persistence";
import {
  searchFixtureCorpus,
  createResearchPlan,
  createDraft,
  createPublicationProposal,
  approveProposal,
  publishApprovedProposal,
} from "./index.js";

describe("fixture corpus determinism", () => {
  it("same query yields identical results across runs", () => {
    const a = searchFixtureCorpus("durable execution retries", 5);
    const b = searchFixtureCorpus("durable execution retries", 5);
    expect(a).toEqual(b);
    expect(a.hits.length).toBeGreaterThan(0);
    expect(ResearchResultSchema.parse(a)).toEqual(a);
  });

  it("ranks the most relevant doc first, deterministic tie-break", () => {
    const r = searchFixtureCorpus("idempotency publish receipt");
    expect(r.hits[0]?.docId).toBe("doc-3");
  });

  it("respects maxResults", () => {
    const r = searchFixtureCorpus("agent framework durable execution", 2);
    expect(r.hits.length).toBeLessThanOrEqual(2);
  });
});

describe("plan + draft", () => {
  it("builds a valid plan and draft", () => {
    const req = ResearchRequestSchema.parse({ prompt: "durable execution" });
    const plan = createResearchPlan(req);
    expect(plan.steps.length).toBe(2);
    const result = searchFixtureCorpus(plan.steps[0]!.query, req.maxResults);
    const draft = createDraft(req, result);
    expect(draft.title).toContain("durable execution");
    expect(draft.body.length).toBeGreaterThan(0);
  });
});

describe("approval state machine", () => {
  it("approves a pending proposal and blocks double-decision", () => {
    const p = createPublicationProposal({
      id: "p1",
      threadId: null,
      title: "t",
      body: "b",
      now: () => "2026-07-11T00:00:00.000Z",
    });
    const approved = approveProposal(p, "approved", () => "2026-07-11T01:00:00.000Z");
    expect(approved.status).toBe("approved");
    expect(approved.decidedAt).toBe("2026-07-11T01:00:00.000Z");
    expect(() => approveProposal(approved, "denied")).toThrow(/expected pending/);
  });

  it("publishApprovedProposal refuses unapproved proposals", async () => {
    const repo = new InMemoryEffectsRepo();
    const p = createPublicationProposal({
      id: "p2",
      threadId: null,
      title: "t",
      body: "b",
    });
    await expect(
      publishApprovedProposal(p, "k", { repo, env: { failAttempts: 0 } }),
    ).rejects.toThrow(/expected approved/);
  });

  it("publishes an approved proposal idempotently", async () => {
    const repo = new InMemoryEffectsRepo();
    const p = approveProposal(
      createPublicationProposal({ id: "p3", threadId: null, title: "t", body: "b" }),
      "approved",
    );
    const deps = { repo, env: { failAttempts: 0 } };
    const r1 = await publishApprovedProposal(p, "k3", deps);
    const r2 = await publishApprovedProposal(p, "k3", deps);
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);
    expect(r2.publicationId).toBe(r1.publicationId);
  });
});
