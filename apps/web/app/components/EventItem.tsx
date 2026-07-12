"use client";
import type { AgentEvent } from "@demo/contracts";
import { describeEvent } from "../../lib/events";

// One normalized event row + a collapsible inspector for its raw native
// payload. Framework-specific payloads are never hidden (task requirement 2).
export function EventItem({ event }: { event: AgentEvent }) {
  const d = describeEvent(event);
  const raw = (event as { raw?: unknown }).raw;
  return (
    <div className={`event tone-${d.tone}`}>
      <div className="head">
        <span className="glyph mono">{d.glyph}</span>
        <span className="label">{d.label}</span>
        {d.time && <span className="time mono">{d.time}</span>}
      </div>
      {d.summary && <div className="summary mono">{d.summary}</div>}
      {raw !== undefined && (
        <details className="raw">
          <summary>raw native event</summary>
          <pre className="mono">{safeStringify(raw)}</pre>
        </details>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
