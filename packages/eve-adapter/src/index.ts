// @demo/eve-adapter — typed, server-side client for the web app (handoff §11,
// §13). Wraps `eve/client` and maps the app's thread model onto eve durable
// sessions: it persists the eve `SessionState` cursor into the demo_threads
// row (via a ThreadsRepo) and normalizes eve's native stream events into the
// framework-neutral @demo/contracts `AgentEvent` union — keeping the raw
// native event on every normalized event for a raw-event inspector.
//
// Runs server-side only. No secrets reach the browser: the web app calls these
// methods from server code and the eve auth/credentials live in the `Client`.
import { Client } from "eve/client";
import type { SessionState, HandleMessageStreamEvent } from "eve/client";
import type { ThreadsRepo, DemoThreadRow } from "@demo/persistence";
import type { AgentEvent } from "@demo/contracts";

export interface EveAdapterOptions {
  /** A configured eve/client Client (host, auth, headers). */
  client: Client;
  /** Thread persistence — maps app thread id -> eve SessionState. */
  threads: ThreadsRepo;
}

export interface SendMessageResult {
  events: AgentEvent[];
  state: SessionState;
}

export class EveAdapter {
  private client: Client;
  private threads: ThreadsRepo;

  constructor(opts: EveAdapterOptions) {
    this.client = opts.client;
    this.threads = opts.threads;
  }

  /** eve `GET /eve/v1/health` — always public, for adapters/load balancers. */
  health() {
    return this.client.health();
  }

  /** eve `GET /eve/v1/info` — resolved agent inspection snapshot. */
  info() {
    return this.client.info();
  }

  /** Create (or return) the app thread row backing an eve session. */
  createThread(appThreadId: string): Promise<DemoThreadRow> {
    return this.threads.createThread({ id: appThreadId, backend: "eve" });
  }

  getThread(appThreadId: string): Promise<DemoThreadRow | undefined> {
    return this.threads.getThread(appThreadId);
  }

  /**
   * Send one turn. Resumes the eve session from the persisted SessionState
   * cursor (or starts fresh), collects the turn's events (normalized), then
   * persists the updated cursor + eve session id back onto the thread row.
   */
  async sendMessage(
    appThreadId: string,
    message: string,
  ): Promise<SendMessageResult> {
    const thread =
      (await this.threads.getThread(appThreadId)) ??
      (await this.createThread(appThreadId));

    const saved =
      (thread.continuationStateJson as SessionState | null) ?? undefined;
    const session = saved ? this.client.session(saved) : this.client.session();

    const response = await session.send(message);
    const events: AgentEvent[] = [];
    for await (const event of response) {
      const normalized = normalizeEvent(event);
      if (normalized) events.push(normalized);
    }

    const state = session.state;
    await this.threads.saveContinuation(appThreadId, {
      externalSessionId: state.sessionId ?? response.sessionId ?? null,
      continuationStateJson: state,
    });

    return { events, state };
  }

  /**
   * Reattach to an existing eve session's durable stream from the persisted
   * cursor, yielding normalized events. Use for reconnect/replay in the UI.
   */
  async *streamEvents(appThreadId: string): AsyncIterable<AgentEvent> {
    const thread = await this.threads.getThread(appThreadId);
    if (!thread) throw new Error(`no such thread: ${appThreadId}`);
    const saved = thread.continuationStateJson as SessionState | null;
    if (!saved?.sessionId) {
      throw new Error(`thread ${appThreadId} has no eve session to stream`);
    }
    const session = this.client.session(saved);
    for await (const event of session.stream()) {
      const normalized = normalizeEvent(event);
      if (normalized) yield normalized;
    }
  }
}

/** Convenience: build an adapter with a fresh Client bound to `host`. */
export function createEveAdapter(args: {
  host: string;
  threads: ThreadsRepo;
  auth?: ConstructorParameters<typeof Client>[0]["auth"];
}): EveAdapter {
  const client = new Client({ host: args.host, auth: args.auth });
  return new EveAdapter({ client, threads: args.threads });
}

// --- event normalization -------------------------------------------------
// eve's stream event union is large and evolving; we map the events the demo
// UI needs into the @demo/contracts union and drop the rest from the
// normalized view (the raw native stream remains available for an inspector).
// Field access is intentionally loose (best-effort) so this stays decoupled
// from exact eve payload field names; the full native event is preserved as
// `raw` on every normalized event. NOTE: field mapping is unverified live
// (no API keys in this env) — see findings.
export function normalizeEvent(
  event: HandleMessageStreamEvent,
): AgentEvent | null {
  const e = event as { type: string; data?: Record<string, unknown> };
  const data = e.data ?? {};
  const ts = new Date().toISOString();
  const raw = event;

  switch (e.type) {
    case "message.completed":
      return {
        type: "message",
        role: "assistant",
        text: String(data.message ?? ""),
        ts,
        raw,
      };
    case "message.received":
      return {
        type: "message",
        role: "user",
        text: String(data.message ?? ""),
        ts,
        raw,
      };
    case "actions.requested": {
      // May carry multiple calls; surface the first for the normalized view.
      const calls = (data.calls ?? data.actions) as
        | Array<Record<string, unknown>>
        | undefined;
      const call = calls?.[0] ?? {};
      return {
        type: "tool-call",
        toolName: String(call.toolName ?? call.name ?? "unknown"),
        callId: String(call.callId ?? call.id ?? ""),
        input: call.input ?? call.args,
        ts,
        raw,
      };
    }
    case "action.result": {
      // Verified live: the action result payload is nested under `data.result`
      // (a RuntimeActionResult with callId, kind, output, and either toolName
      // for tool-result or subagentName for subagent-result), NOT flattened
      // onto `data`. `data.status`/`data.error` sit alongside it.
      const result = (data.result ?? {}) as Record<string, unknown>;
      return {
        type: "tool-result",
        toolName: String(result.toolName ?? result.subagentName ?? "unknown"),
        callId: String(result.callId ?? ""),
        output: result.output,
        ts,
        raw,
      };
    }
    case "subagent.called":
      return {
        type: "subagent",
        name: String(data.name ?? data.subagent ?? "researcher"),
        status: "started",
        detail: data.childSessionId
          ? `child ${String(data.childSessionId)}`
          : undefined,
        ts,
        raw,
      };
    case "subagent.started":
      // Inline subagent execution start (distinct from the workflow-backed
      // `subagent.called`). Field is `data.subagentName`, not `data.name`.
      return {
        type: "subagent",
        name: String(data.subagentName ?? "researcher"),
        status: "started",
        ts,
        raw,
      };
    case "subagent.completed":
      // Verified against the live type: the field is `data.subagentName`
      // (not `data.name`/`data.subagent`); `data.output` carries the result.
      return {
        type: "subagent",
        name: String(data.subagentName ?? "researcher"),
        status: "completed",
        detail:
          typeof data.output === "string" ? data.output.slice(0, 200) : undefined,
        ts,
        raw,
      };
    case "input.requested": {
      // A HITL pause (approval or ask_question). The demo's approval is
      // application-owned so this did not fire in the live run; field is
      // `data.requests` (InputRequest[]), each with a `key`.
      const requests = data.requests as Array<Record<string, unknown>> | undefined;
      const first = requests?.[0] ?? {};
      return {
        type: "approval-pending",
        proposalId: String(first.key ?? first.id ?? ""),
        ts,
        raw,
      };
    }
    case "turn.failed":
    case "session.failed":
    case "step.failed":
      return {
        type: "error",
        message: String(data.message ?? "agent error"),
        ts,
        raw,
      };
    default:
      return null;
  }
}
