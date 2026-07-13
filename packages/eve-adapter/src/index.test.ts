// Unit tests for the pure event normalizer. No live eve server / API keys.
import { describe, it, expect } from "vitest";
import { AgentEventSchema } from "@demo/contracts";
import type { HandleMessageStreamEvent } from "eve/client";
import { normalizeEvent } from "./index.js";

// The normalizer is intentionally loose about eve's exact payload field names;
// cast test fixtures to the stream-event type so we exercise the real signature.
const asEvent = (e: unknown) => e as HandleMessageStreamEvent;

describe("normalizeEvent — usage", () => {
  it("maps step.completed usage to a normalized usage event", () => {
    const ev = normalizeEvent(
      asEvent({
        type: "step.completed",
        data: {
          finishReason: "stop",
          sequence: 1,
          stepIndex: 0,
          turnId: "t1",
          usage: {
            costUsd: 0.0123,
            inputTokens: 150,
            outputTokens: 60,
            cacheReadTokens: 20,
            cacheWriteTokens: 8,
          },
        },
      }),
    );
    expect(ev).not.toBeNull();
    if (ev) AgentEventSchema.parse(ev);
    expect(ev).toMatchObject({
      type: "usage",
      inputTokens: 150,
      outputTokens: 60,
      cacheReadTokens: 20,
      cacheWriteTokens: 8,
      // eve has no distinct totalTokens; derived as input + output.
      totalTokens: 210,
      costUsd: 0.0123,
    });
    // raw native event preserved.
    expect((ev as { raw?: unknown }).raw).toBeDefined();
  });

  it("defaults missing usage fields to 0 (step.completed without usage)", () => {
    const ev = normalizeEvent(
      asEvent({
        type: "step.completed",
        data: { finishReason: "stop", sequence: 1, stepIndex: 0, turnId: "t1" },
      }),
    );
    expect(ev).toMatchObject({
      type: "usage",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
    });
  });

  it("returns null for unmapped event types", () => {
    expect(normalizeEvent(asEvent({ type: "step.started", data: {} }))).toBeNull();
  });
});
