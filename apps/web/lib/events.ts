// Pure rendering helpers for the normalized @demo/contracts AgentEvent stream.
// Kept framework-neutral and side-effect-free so it is unit-testable and safe
// in client components (type-only import of the contracts union).
import type { AgentEvent } from "@demo/contracts";

export type EventTone = "info" | "tool" | "subagent" | "approval" | "success" | "error";

export interface EventDescriptor {
  /** Short glyph shown in the timeline (ascii only, per repo conventions). */
  glyph: string;
  /** Category label. */
  label: string;
  /** One-line human summary of the event. */
  summary: string;
  tone: EventTone;
  /** Formatted timestamp (HH:MM:SS) or empty when unparseable. */
  time: string;
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 19);
}

function truncate(value: unknown, max = 160): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (value == null) text = "";
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Map one normalized event to a display descriptor. Total over the union. */
export function describeEvent(event: AgentEvent): EventDescriptor {
  const time = fmtTime(event.ts);
  switch (event.type) {
    case "message":
      return {
        glyph: event.role === "user" ? ">" : event.role === "system" ? "*" : "<",
        label: `${event.role} message`,
        summary: truncate(event.text),
        tone: "info",
        time,
      };
    case "tool-call":
      return {
        glyph: "[]",
        label: `tool call: ${event.toolName}`,
        summary: truncate(event.input),
        tone: "tool",
        time,
      };
    case "tool-result":
      return {
        glyph: "->",
        label: `tool result: ${event.toolName}`,
        summary: truncate(event.output),
        tone: "tool",
        time,
      };
    case "subagent":
      return {
        glyph: "@",
        label: `subagent ${event.name}`,
        summary: `${event.status}${event.detail ? ` - ${event.detail}` : ""}`,
        tone: "subagent",
        time,
      };
    case "approval-pending":
      return {
        glyph: "?",
        label: "approval pending",
        summary: `proposal ${event.proposalId || "(unknown)"} awaiting decision`,
        tone: "approval",
        time,
      };
    case "approval-decided":
      return {
        glyph: "!",
        label: "approval decided",
        summary: `proposal ${event.proposalId} ${event.decision}`,
        tone: event.decision === "approved" ? "success" : "error",
        time,
      };
    case "published":
      return {
        glyph: "#",
        label: "published",
        summary: `publication ${event.receipt.publicationId} (created=${event.receipt.created})`,
        tone: "success",
        time,
      };
    case "usage": {
      const cost =
        event.costUsd > 0 ? ` $${event.costUsd.toFixed(4)}` : "";
      const model = event.model ? ` ${event.model}` : "";
      return {
        glyph: "$",
        label: "usage",
        summary:
          `in ${event.inputTokens} / out ${event.outputTokens} tok` +
          ` (cacheR ${event.cacheReadTokens}, cacheW ${event.cacheWriteTokens})` +
          `${cost}${model}`,
        tone: "info",
        time,
      };
    }
    case "error":
      return {
        glyph: "x",
        label: "error",
        summary: truncate(event.message),
        tone: "error",
        time,
      };
    default: {
      // Exhaustiveness guard: a new event variant must be handled here.
      const _never: never = event;
      return {
        glyph: "?",
        label: "unknown",
        summary: truncate(_never),
        tone: "info",
        time,
      };
    }
  }
}

/** True for events the tool-activity panel should surface. */
export function isToolEvent(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "tool-call" | "tool-result" }> {
  return event.type === "tool-call" || event.type === "tool-result";
}

/** True for subagent-activity panel events. */
export function isSubagentEvent(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "subagent" }> {
  return event.type === "subagent";
}

/** The proposalId of the latest still-pending approval, if any is unresolved. */
export function latestPendingProposalId(events: AgentEvent[]): string | null {
  let pending: string | null = null;
  for (const event of events) {
    if (event.type === "approval-pending" && event.proposalId) {
      pending = event.proposalId;
    }
    if (event.type === "approval-decided" && event.proposalId === pending) {
      pending = null;
    }
    if (event.type === "published" && event.proposalId === pending) {
      pending = null;
    }
  }
  return pending;
}

/** The final artifact (publication receipt) if the run reached it. */
export function finalArtifact(
  events: AgentEvent[],
): Extract<AgentEvent, { type: "published" }> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event && event.type === "published") return event;
  }
  return null;
}
