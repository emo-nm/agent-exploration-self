import { describe, it, expect } from "vitest";
import {
  ResearchRequestSchema,
  ResearchPlanSchema,
  ResearchResultSchema,
  PublicationProposalSchema,
  PublicationReceiptSchema,
  AgentEventSchema,
  BackendSchema,
  sumUsageEvents,
  type AgentEvent,
} from "./index.js";

describe("contract schema round-trips", () => {
  it("research-request applies default maxResults", () => {
    const parsed = ResearchRequestSchema.parse({ prompt: "compare frameworks" });
    expect(parsed.maxResults).toBe(5);
    expect(ResearchRequestSchema.parse(parsed)).toEqual(parsed);
  });

  it("research-plan round-trips", () => {
    const plan = {
      prompt: "p",
      steps: [{ id: "s1", description: "d", query: "q" }],
      rationale: "r",
    };
    expect(ResearchPlanSchema.parse(plan)).toEqual(plan);
  });

  it("research-result round-trips", () => {
    const result = {
      query: "durable execution",
      hits: [{ docId: "d1", title: "t", snippet: "s", score: 1.5 }],
    };
    expect(ResearchResultSchema.parse(result)).toEqual(result);
  });

  it("publication-proposal round-trips with nullables", () => {
    const proposal = {
      id: "p1",
      threadId: null,
      title: "t",
      body: "b",
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    expect(PublicationProposalSchema.parse(proposal)).toEqual(proposal);
  });

  it("publication-receipt round-trips", () => {
    const receipt = { publicationId: "pub1", created: true, checksum: "abc" };
    expect(PublicationReceiptSchema.parse(receipt)).toEqual(receipt);
  });

  it("backend enum includes mastra", () => {
    expect(BackendSchema.parse("mastra")).toBe("mastra");
  });

  it("agent-event discriminated union preserves raw passthrough", () => {
    const ev = {
      type: "tool-call" as const,
      toolName: "search",
      callId: "c1",
      input: { q: "x" },
      ts: new Date().toISOString(),
      raw: { native: "payload" },
    };
    const parsed = AgentEventSchema.parse(ev);
    expect(parsed).toEqual(ev);
    if (parsed.type === "tool-call") {
      expect(parsed.raw).toEqual({ native: "payload" });
    }
  });

  it("usage event applies 0 defaults for unknown fields and keeps raw", () => {
    const parsed = AgentEventSchema.parse({
      type: "usage",
      inputTokens: 100,
      outputTokens: 40,
      ts: new Date().toISOString(),
      raw: { provider: "x" },
    });
    if (parsed.type === "usage") {
      expect(parsed.cacheReadTokens).toBe(0);
      expect(parsed.cacheWriteTokens).toBe(0);
      expect(parsed.totalTokens).toBe(0);
      expect(parsed.costUsd).toBe(0);
      expect(parsed.raw).toEqual({ provider: "x" });
    }
  });

  it("sumUsageEvents totals only usage events", () => {
    const ts = new Date().toISOString();
    const events: AgentEvent[] = [
      { type: "message", role: "user", text: "hi", ts },
      { type: "usage", inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5, totalTokens: 140, costUsd: 0.3, ts },
      { type: "usage", inputTokens: 50, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 70, costUsd: 0.1, ts },
    ];
    const total = sumUsageEvents(events);
    expect(total.inputTokens).toBe(150);
    expect(total.outputTokens).toBe(60);
    expect(total.totalTokens).toBe(210);
    expect(total.costUsd).toBeCloseTo(0.4);
    expect(total.events).toBe(2);
    expect(sumUsageEvents([]).events).toBe(0);
  });

  it("agent-event published carries a receipt", () => {
    const ev = {
      type: "published" as const,
      proposalId: "p1",
      receipt: { publicationId: "pub1", created: false, checksum: "z" },
      ts: new Date().toISOString(),
    };
    expect(AgentEventSchema.parse(ev)).toEqual(ev);
  });
});
