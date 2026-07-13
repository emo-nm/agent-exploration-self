// @demo/mastra-adapter — typed server client for the Mastra baseline, mirroring
// the eve-adapter/flue-adapter shape (handoff #13/#14). It talks to the Mastra
// server (mastra dev/start, port 3003) over its HTTP API and normalizes Mastra
// stream chunks to the shared @demo/contracts AgentEvent union, always keeping
// the raw Mastra chunk in `raw` (never lose native events).
//
// We hit the server API directly with fetch rather than pulling in
// @mastra/client-js, so the adapter has no Mastra runtime dependency (same
// posture as the Eve/Flue adapters). The normalizer is pure and unit-tested;
// the network methods are thin and exercised live once a server + keys exist.
import { AgentEventSchema, type AgentEvent } from "@demo/contracts";

export interface MastraAdapterConfig {
    /** e.g. http://localhost:3003 */
    baseUrl: string;
    /** Mastra agent id to drive (default: research-publisher). */
    agentId?: string;
    /** Optional bearer token for server auth (criterion 8: BYO). */
    serviceToken?: string;
    /** Injectable for tests. */
    fetchImpl?: typeof fetch;
}

/** A raw Mastra stream chunk: `{ type, payload }` (from @mastra/core stream). */
export interface MastraChunk {
    type: string;
    payload?: Record<string, unknown>;
    [k: string]: unknown;
}

const nowIso = () => new Date().toISOString();

/**
 * Normalize a single Mastra stream chunk into a shared AgentEvent, or `null`
 * for chunk types that have no portable analogue (lifecycle noise). The raw
 * chunk is always attached under `raw`.
 */
export function normalizeMastraChunk(chunk: MastraChunk): AgentEvent | null {
    const raw = chunk;
    const p = chunk.payload ?? {};
    switch (chunk.type) {
        case "text":
        case "text-delta": {
            const text = String(
                (p.text as string) ?? (p.delta as string) ?? "",
            );
            if (!text) return null;
            return {
                type: "message",
                role: "assistant",
                text,
                ts: nowIso(),
                raw,
            };
        }
        case "tool-call":
        case "tool-execution-start": {
            return {
                type: "tool-call",
                toolName: String(
                    (p.toolName as string) ?? (p.toolId as string) ?? "unknown",
                ),
                callId: String(
                    (p.toolCallId as string) ?? (p.id as string) ?? "",
                ),
                input: p.args ?? p.input ?? null,
                ts: nowIso(),
                raw,
            };
        }
        case "tool-result":
        case "tool-execution-end": {
            // LIVE-VERIFIED: the terminal per-call chunk is `tool-result` (from AGENT),
            // payload {args, toolCallId, toolName, result}. We deliberately DO NOT map
            // Mastra's intermediate `tool-output` chunks (from USER, ~1 per output
            // fragment, each re-wrapping the full result): they fire ~100x per run and
            // would flood the normalized stream with duplicate tool-result events.
            return {
                type: "tool-result",
                toolName: String(
                    (p.toolName as string) ?? (p.toolId as string) ?? "unknown",
                ),
                callId: String(
                    (p.toolCallId as string) ?? (p.id as string) ?? "",
                ),
                output: p.result ?? p.output ?? null,
                ts: nowIso(),
                raw,
            };
        }
        case "tool-call-suspended":
        case "tool-execution-suspended":
        case "agent-execution-suspended":
        case "agent-execution-approval":
        case "tool-execution-approval": {
            // Mastra's native suspend/approval surface. Map to the portable
            // approval-pending event; the proposalId is best-effort from the payload.
            return {
                type: "approval-pending",
                proposalId: String(
                    (p.proposalId as string) ?? (p.toolCallId as string) ?? "",
                ),
                ts: nowIso(),
                raw,
            };
        }
        case "error":
        case "tool-error": {
            // LIVE-VERIFIED: on a failed tool `p.error` is a structured object
            // ({ name, id, domain, category, cause:{message}, details:{errorMessage} }),
            // not a string — String(p.error) yielded "[object Object]". Dig out a
            // human-readable message, falling back to JSON.
            const err = p.error;
            let message: string;
            if (typeof err === "string") {
                message = err;
            } else if (err && typeof err === "object") {
                const e = err as Record<string, unknown>;
                const cause = e.cause as Record<string, unknown> | undefined;
                const details = e.details as
                    | Record<string, unknown>
                    | undefined;
                message = String(
                    (cause?.message as string) ??
                        (details?.errorMessage as string) ??
                        (e.message as string) ??
                        JSON.stringify(err),
                );
            } else {
                message = String((p.message as string) ?? "error");
            }
            return { type: "error", message, ts: nowIso(), raw };
        }
        default:
            return null;
    }
}

export interface MastraThreadHandle {
    threadId: string;
    resourceId: string;
}

export class MastraAdapter {
    private baseUrl: string;
    private agentId: string;
    private serviceToken?: string;
    private fetchImpl: typeof fetch;

    constructor(config: MastraAdapterConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.agentId = config.agentId ?? "research-publisher";
        this.serviceToken = config.serviceToken;
        this.fetchImpl = config.fetchImpl ?? fetch;
    }

    private headers(): Record<string, string> {
        const h: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.serviceToken) h.Authorization = `Bearer ${this.serviceToken}`;
        return h;
    }

    /** Health check against the app-registered /health route. */
    async health(): Promise<{ status: string; backend: string }> {
        const res = await this.fetchImpl(`${this.baseUrl}/health`, {
            headers: this.headers(),
        });
        if (!res.ok) throw new Error(`mastra health failed: ${res.status}`);
        return (await res.json()) as { status: string; backend: string };
    }

    /**
     * Create a Mastra memory thread. Returns the thread + resource ids the caller
     * should persist into demo_threads (external_session_id ↔ Mastra threadId).
     */
    async createThread(
        resourceId: string,
        threadId?: string,
    ): Promise<MastraThreadHandle> {
        const id = threadId ?? `thr_${Date.now().toString(36)}`;
        const res = await this.fetchImpl(
            `${this.baseUrl}/api/memory/threads?agentId=${encodeURIComponent(this.agentId)}`,
            {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify({ resourceId, threadId: id }),
            },
        );
        if (!res.ok)
            throw new Error(`mastra createThread failed: ${res.status}`);
        return { threadId: id, resourceId };
    }

    /** Send a message and collect the normalized events (non-streaming). */
    async sendMessage(
        handle: MastraThreadHandle,
        message: string,
    ): Promise<AgentEvent[]> {
        const events: AgentEvent[] = [];
        for await (const ev of this.streamEvents(handle, message))
            events.push(ev);
        return events;
    }

    /** Stream the agent's response as normalized AgentEvents. */
    async *streamEvents(
        handle: MastraThreadHandle,
        message: string,
    ): AsyncGenerator<AgentEvent> {
        const res = await this.fetchImpl(
            `${this.baseUrl}/api/agents/${encodeURIComponent(this.agentId)}/stream`,
            {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify({
                    messages: [{ role: "user", content: message }],
                    memory: {
                        thread: handle.threadId,
                        resource: handle.resourceId,
                    },
                }),
            },
        );
        if (!res.ok || !res.body) {
            throw new Error(`mastra stream failed: ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                const json = trimmed.startsWith("data:")
                    ? trimmed.slice(5).trim()
                    : trimmed;
                let chunk: MastraChunk;
                try {
                    chunk = JSON.parse(json) as MastraChunk;
                } catch {
                    continue;
                }
                const ev = normalizeMastraChunk(chunk);
                if (ev) yield AgentEventSchema.parse(ev);
            }
        }
    }

    /** Fetch a Mastra memory thread by id. */
    async getThread(threadId: string): Promise<unknown> {
        const res = await this.fetchImpl(
            `${this.baseUrl}/api/memory/threads/${encodeURIComponent(threadId)}?agentId=${encodeURIComponent(this.agentId)}`,
            { headers: this.headers() },
        );
        if (!res.ok) throw new Error(`mastra getThread failed: ${res.status}`);
        return res.json();
    }
}
