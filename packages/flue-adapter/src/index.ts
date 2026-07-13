// @demo/flue-adapter — typed server-side client for the Flue baseline
// (handoff §13/§14). Wraps @flue/sdk so the web app never talks to Flue
// directly and no service token reaches the browser. Normalizes Flue's
// materialized conversation into @demo/contracts AgentEvent, keeping the raw
// Flue payload on every event (`raw` passthrough).
import { createFlueClient } from "@flue/sdk";
import type {
  AgentConversationObservation,
  AgentSendResult,
  FlueConversationMessage,
  FlueConversationPart,
  FlueConversationSnapshot,
} from "@flue/sdk";
import type { AgentEvent } from "@demo/contracts";

/** Flue agent name of the research-and-publish baseline (apps/flue). */
export const FLUE_RESEARCH_PUBLISHER_AGENT = "research-publisher";

export interface FlueAdapterOptions {
  /** Absolute base URL where the Flue service's `flue()` routes are mounted. */
  baseUrl: string;
  /** Bearer token for service-to-service auth. Never sent to the browser. */
  token?: string;
  /** Agent name; defaults to the research-and-publish baseline. */
  agentName?: string;
  /** Custom fetch (tests / instrumentation). */
  fetch?: typeof fetch;
}

export interface Thread {
  /** Application thread id === the Flue agent instance id (see mapping below). */
  threadId: string;
  agentName: string;
}

/**
 * Map an application thread id to a stable Flue agent instance id. Flue's
 * instance id is the caller-chosen path segment, so the app owns the mapping;
 * this mirrors apps/flue/src/shared/instance-id.ts so both sides agree.
 */
export function toFlueInstanceId(threadId: string): string {
  if (!threadId) throw new Error("threadId must be a non-empty string");
  return threadId.replace(/[^A-Za-z0-9_-]/g, (ch) => {
    const hex = ch.codePointAt(0)!.toString(16).padStart(2, "0");
    return `~${hex}`;
  });
}

export interface FlueAdapter {
  /** Create (lazily) a thread; returns the stable instance mapping. */
  createThread(threadId: string): Thread;
  /** Send one message; resolves after Flue admits the durable submission. */
  sendMessage(threadId: string, message: string): Promise<AgentSendResult>;
  /** Read the current materialized conversation as normalized AgentEvents. */
  getThread(threadId: string): Promise<{
    events: AgentEvent[];
    snapshot: FlueConversationSnapshot;
  }>;
  /**
   * Observe the live conversation, invoking `onEvents` with the full
   * normalized event list on each update. Returns an unsubscribe function.
   */
  streamEvents(
    threadId: string,
    onEvents: (events: AgentEvent[]) => void,
    options?: { live?: "sse" | "long-poll"; signal?: AbortSignal },
  ): () => void;
}

export function createFlueAdapter(options: FlueAdapterOptions): FlueAdapter {
  const agentName = options.agentName ?? FLUE_RESEARCH_PUBLISHER_AGENT;
  const client = createFlueClient({
    baseUrl: options.baseUrl,
    token: options.token,
    fetch: options.fetch,
  });

  return {
    createThread(threadId) {
      return { threadId, agentName };
    },

    sendMessage(threadId, message) {
      return client.agents.send(agentName, toFlueInstanceId(threadId), {
        message,
      });
    },

    async getThread(threadId) {
      const snapshot = await client.agents.history(
        agentName,
        toFlueInstanceId(threadId),
      );
      return { events: normalizeConversation(snapshot.messages), snapshot };
    },

    streamEvents(threadId, onEvents, opts) {
      const observation: AgentConversationObservation = client.agents.observe(
        agentName,
        toFlueInstanceId(threadId),
        { live: opts?.live ?? "sse", signal: opts?.signal },
      );
      const emit = () => {
        const state = observation.getSnapshot().conversation;
        if (state) onEvents(normalizeConversation(state.messages));
      };
      const unsubscribe = observation.subscribe(emit);
      emit();
      return () => {
        unsubscribe();
        observation.close();
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Normalization: Flue materialized messages/parts -> @demo/contracts AgentEvent.
// Every emitted event carries `raw` (the originating Flue part/message) so the
// native payload is never lost (handoff §13 raw-event inspector).
// ---------------------------------------------------------------------------
export function normalizeConversation(
  messages: FlueConversationMessage[],
): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const message of messages) {
    const ts = message.metadata?.timestamp ?? new Date(0).toISOString();
    for (const part of message.parts) {
      events.push(...normalizePart(message, part, ts));
    }
  }
  return events;
}

// A single Flue part can normalize to more than one AgentEvent. This matters
// for materialized history (observe()/history()): a `dynamic-tool` part there
// is always in a TERMINAL state (`output-available` / `output-error`) — the
// transient `input-available` state only appears mid-flight on a live stream.
// The part still carries its `input` in the terminal state, so we synthesize
// the `tool-call` from it and then the result/error. Without this, replaying a
// settled conversation yields zero `tool-call` events and drops every tool
// input. (Verified against a live Flue conversation, 2026-07-12.)
function normalizePart(
  message: FlueConversationMessage,
  part: FlueConversationPart,
  ts: string,
): AgentEvent[] {
  switch (part.type) {
    case "text":
      return [
        { type: "message", role: message.role, text: part.text, ts, raw: part },
      ];
    case "reasoning":
      // Reasoning has no dedicated normalized variant; surface as an
      // assistant message so it stays visible, with raw preserved.
      return [
        { type: "message", role: "assistant", text: part.text, ts, raw: part },
      ];
    case "dynamic-tool": {
      const toolCall: AgentEvent = {
        type: "tool-call",
        toolName: part.toolName,
        callId: part.toolCallId,
        input: part.input,
        ts,
        raw: part,
      };
      if (part.state === "input-available") {
        // Live-stream mid-flight: call issued, no result yet.
        return [toolCall];
      }
      if (part.state === "output-available") {
        return [
          toolCall,
          {
            type: "tool-result",
            toolName: part.toolName,
            callId: part.toolCallId,
            output: part.output,
            ts,
            raw: part,
          },
        ];
      }
      // output-error: keep the call visible, then a tool-attributed error.
      // The contract's error event has no tool fields, so name the tool in
      // the message to preserve attribution.
      return [
        toolCall,
        {
          type: "error",
          message: `${part.toolName}: ${part.errorText}`,
          ts,
          raw: part,
        },
      ];
    }
    case "file":
      // No normalized file event; skip but nothing is lost — history() carries it.
      return [];
    default:
      return [];
  }
}
