import { describe, expect, it } from "vitest";
import { AgentEventSchema } from "@demo/contracts";
import { normalizeConversation, toFlueInstanceId } from "./index.js";

describe("toFlueInstanceId", () => {
  it("is stable and injective for distinct thread ids", () => {
    expect(toFlueInstanceId("thread-1")).toBe("thread-1");
    expect(toFlueInstanceId("a/b")).not.toBe(toFlueInstanceId("a_b"));
    expect(toFlueInstanceId("a b")).toBe(toFlueInstanceId("a b"));
  });
  it("rejects empty ids", () => {
    expect(() => toFlueInstanceId("")).toThrow();
  });
});

describe("normalizeConversation", () => {
  it("maps text and tool parts to contract AgentEvents with raw passthrough", () => {
    const messages = [
      {
        id: "m1",
        role: "user" as const,
        parts: [{ type: "text" as const, text: "hello", state: "done" as const }],
        metadata: { timestamp: "2026-07-11T00:00:00.000Z" },
      },
      {
        id: "m2",
        role: "assistant" as const,
        parts: [
          // Materialized history only ever carries the TERMINAL state; the
          // adapter synthesizes the tool-call from the input on the settled
          // part (see index.ts).
          {
            type: "dynamic-tool" as const,
            toolName: "search_fixture_corpus",
            toolCallId: "call-1",
            state: "output-available" as const,
            input: { query: "x" },
            output: { query: "x", hits: [] },
          },
          { type: "text" as const, text: "done", state: "done" as const },
        ],
        metadata: { timestamp: "2026-07-11T00:00:01.000Z" },
      },
    ];

    const events = normalizeConversation(messages);
    // Every event validates against the shared contract union.
    for (const e of events) AgentEventSchema.parse(e);

    expect(events.map((e) => e.type)).toEqual([
      "message",
      "tool-call",
      "tool-result",
      "message",
    ]);
    // raw passthrough is preserved.
    expect(events.every((e) => "raw" in e && e.raw !== undefined)).toBe(true);
    const toolCall = events[1]!;
    expect(toolCall.type).toBe("tool-call");
    if (toolCall.type === "tool-call") {
      expect(toolCall.toolName).toBe("search_fixture_corpus");
      expect(toolCall.callId).toBe("call-1");
    }
  });

  it("maps a tool output-error part to an error event", () => {
    const events = normalizeConversation([
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "publish_artifact",
            toolCallId: "c2",
            state: "output-error",
            input: {},
            errorText: "not approved",
          },
        ],
        metadata: { timestamp: "2026-07-11T00:00:00.000Z" },
      },
    ]);
    // A terminal error part yields the (synthesized) tool-call plus a
    // tool-attributed error event.
    expect(events.map((e) => e.type)).toEqual(["tool-call", "error"]);
    for (const e of events) AgentEventSchema.parse(e);
    const errEvent = events[1]!;
    if (errEvent.type === "error") {
      expect(errEvent.message).toContain("publish_artifact");
    }
  });
});
