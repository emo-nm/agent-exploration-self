import { describe, it, expect } from "vitest";
import type { AgentEvent } from "@demo/contracts";
import {
  describeEvent,
  finalArtifact,
  isSubagentEvent,
  isToolEvent,
  latestPendingProposalId,
} from "../lib/events";

const ts = "2026-07-11T12:00:00.000Z";

describe("describeEvent", () => {
  it("renders each normalized event variant with a tone and summary", () => {
    const cases: Array<[AgentEvent, string]> = [
      [{ type: "message", role: "user", text: "hello", ts }, "info"],
      [{ type: "tool-call", toolName: "search_fixture_corpus", callId: "c1", input: { q: "x" }, ts }, "tool"],
      [{ type: "tool-result", toolName: "search_fixture_corpus", callId: "c1", output: { hits: [] }, ts }, "tool"],
      [{ type: "subagent", name: "researcher", status: "started", ts }, "subagent"],
      [{ type: "approval-pending", proposalId: "p1", ts }, "approval"],
      [{ type: "approval-decided", proposalId: "p1", decision: "approved", ts }, "success"],
      [{ type: "error", message: "boom", ts }, "error"],
    ];
    for (const [event, tone] of cases) {
      const d = describeEvent(event);
      expect(d.tone).toBe(tone);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.time).toBe("12:00:00");
    }
  });

  it("summarizes tool input by serializing it", () => {
    const d = describeEvent({
      type: "tool-call",
      toolName: "t",
      callId: "c",
      input: { query: "corpus" },
      ts,
    });
    expect(d.summary).toContain("corpus");
  });

  it("handles unparseable timestamps gracefully", () => {
    const d = describeEvent({ type: "message", role: "assistant", text: "hi", ts: "nope" });
    expect(d.time).toBe("");
  });
});

describe("event stream selectors", () => {
  const events: AgentEvent[] = [
    { type: "message", role: "user", text: "go", ts },
    { type: "tool-call", toolName: "t", callId: "c", input: {}, ts },
    { type: "subagent", name: "researcher", status: "started", ts },
    { type: "approval-pending", proposalId: "p1", ts },
  ];

  it("filters tool and subagent events", () => {
    expect(events.filter(isToolEvent)).toHaveLength(1);
    expect(events.filter(isSubagentEvent)).toHaveLength(1);
  });

  it("tracks the latest unresolved pending proposal", () => {
    expect(latestPendingProposalId(events)).toBe("p1");
    const decided: AgentEvent[] = [
      ...events,
      { type: "approval-decided", proposalId: "p1", decision: "approved", ts },
    ];
    expect(latestPendingProposalId(decided)).toBeNull();
  });

  it("finds the final publication receipt", () => {
    expect(finalArtifact(events)).toBeNull();
    const published: AgentEvent[] = [
      ...events,
      {
        type: "published",
        proposalId: "p1",
        receipt: { publicationId: "pub_1", created: true, checksum: "abc" },
        ts,
      },
    ];
    expect(finalArtifact(published)?.receipt.publicationId).toBe("pub_1");
  });
});
