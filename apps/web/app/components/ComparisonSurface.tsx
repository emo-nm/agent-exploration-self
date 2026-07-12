"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentEvent, Backend, PublicationProposal } from "@demo/contracts";
import {
  describeEvent,
  finalArtifact,
  isSubagentEvent,
  isToolEvent,
  latestPendingProposalId,
} from "../../lib/events";
import { EventItem } from "./EventItem";
import { ApprovalCard } from "./ApprovalCard";

export interface SurfaceMeta {
  backend: Backend;
  label: string;
  blurb: string;
  baseUrl: string;
}

// The one shared surface used by all three direct modes. `meta` (backend +
// label + baseUrl) is the only thing that varies. Everything server-touching
// goes through /api/:backend/* route handlers, so no secret reaches the browser.
export function ComparisonSurface({ meta }: { meta: SurfaceMeta }) {
  const storageKey = `demo.threads.${meta.backend}`;
  const [threadIds, setThreadIds] = useState<string[]>([]);
  const [threadId, setThreadId] = useState<string>("");
  const [message, setMessage] = useState("Research the fixture corpus and draft a short brief.");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [health, setHealth] = useState<"unknown" | "up" | "down">("unknown");
  const [manualProposalId, setManualProposalId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore remembered thread ids (repo has no list API — see notes).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setThreadIds(ids);
      if (ids[0]) setThreadId(ids[0]);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  // Health badge.
  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          const s = d.statuses?.find((x: { backend: Backend }) => x.backend === meta.backend);
          setHealth(s?.up ? "up" : "down");
        })
        .catch(() => alive && setHealth("down"));
    poll();
    const t = setInterval(poll, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [meta.backend]);

  const rememberThread = useCallback(
    (id: string) => {
      setThreadIds((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, 20);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  async function newThread() {
    const res = await fetch(`/api/${meta.backend}/thread`, { method: "POST" });
    const data = await res.json();
    const id: string = data.thread.id;
    rememberThread(id);
    setThreadId(id);
    setEvents([]);
    setManualProposalId(null);
  }

  async function send() {
    if (!threadId || !message.trim() || streaming) return;
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // Optimistically show the user's message.
    setEvents((prev) => [
      ...prev,
      { type: "message", role: "user", text: message, ts: new Date().toISOString() },
    ]);
    try {
      const res = await fetch(`/api/${meta.backend}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error("no response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const json = line.slice(5).trim();
          if (!json || json === "{}") continue;
          try {
            setEvents((prev) => [...prev, JSON.parse(json) as AgentEvent]);
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [
        ...prev,
        { type: "error", message: String((err as Error).message ?? err), ts: new Date().toISOString() },
      ]);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function createDemoProposal() {
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: threadId || null,
        title: "Draft: fixture-corpus research brief",
        body: "A short synthesized draft awaiting publication approval.",
      }),
    });
    const data = await res.json();
    const id: string = data.proposal.id;
    setManualProposalId(id);
    setEvents((prev) => [
      ...prev,
      { type: "approval-pending", proposalId: id, ts: new Date().toISOString() },
    ]);
  }

  const toolEvents = useMemo(() => events.filter(isToolEvent), [events]);
  const subagentEvents = useMemo(() => events.filter(isSubagentEvent), [events]);
  const messages = useMemo(() => events.filter((e) => e.type === "message"), [events]);
  const pendingProposalId = latestPendingProposalId(events) ?? manualProposalId;
  const artifact = finalArtifact(events);

  function onSettled(p: PublicationProposal) {
    setEvents((prev) => [
      ...prev,
      {
        type: "approval-decided",
        proposalId: p.id,
        decision: p.status === "approved" ? "approved" : "denied",
        ts: new Date().toISOString(),
      },
    ]);
  }

  return (
    <>
      <div className="topbar">
        <a href="/" className="badge secondary">&larr; modes</a>
        <span className="badge">
          <span className={`dot ${health === "up" ? "up" : health === "down" ? "down" : ""}`} />
          {meta.label} - {health}
        </span>
        <span className="muted mono">{meta.baseUrl}</span>
        <span className="muted grow" style={{ textAlign: "right" }}>{meta.blurb}</span>
      </div>

      <div className="wrap">
        <div className="panel">
          <h2>Thread</h2>
          <div className="row">
            <select
              className="grow"
              value={threadId}
              onChange={(e) => {
                setThreadId(e.target.value);
                setEvents([]);
                setManualProposalId(null);
              }}
            >
              <option value="">-- select a thread --</option>
              {threadIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <button className="secondary" onClick={newThread}>New thread</button>
          </div>
        </div>

        <div className="grid">
          <div>
            <div className="panel">
              <h2>Send a turn</h2>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={send} disabled={!threadId || streaming}>
                  {streaming ? "Streaming..." : "Send"}
                </button>
                {!threadId && <span className="muted">Create or select a thread first.</span>}
              </div>
            </div>

            <div className="panel">
              <h2>Transcript</h2>
              {messages.length === 0 ? (
                <div className="empty">No messages yet.</div>
              ) : (
                messages.map((e, i) => <EventItem key={i} event={e} />)
              )}
            </div>

            <div className="panel">
              <h2>Event stream ({events.length})</h2>
              {events.length === 0 ? (
                <div className="empty">Events (normalized + raw inspector) appear here.</div>
              ) : (
                events.map((e, i) => <EventItem key={i} event={e} />)
              )}
            </div>
          </div>

          <div>
            <div className="panel">
              <h2>Approval</h2>
              <ApprovalCard proposalId={pendingProposalId} onSettled={onSettled} />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="secondary" onClick={createDemoProposal}>
                  Create demo proposal
                </button>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Exercises the app-owned proposals flow against the live repo (no
                model key needed).
              </div>
            </div>

            <div className="panel">
              <h2>Final artifact</h2>
              {artifact ? (
                <pre className="mono">{JSON.stringify(artifact.receipt, null, 2)}</pre>
              ) : (
                <div className="empty">No publication receipt yet.</div>
              )}
            </div>

            <div className="panel">
              <h2>Tool activity ({toolEvents.length})</h2>
              {toolEvents.length === 0 ? (
                <div className="empty">No tool calls.</div>
              ) : (
                <ul className="clean">
                  {toolEvents.map((e, i) => {
                    const d = describeEvent(e);
                    return (
                      <li key={i} className="mono">
                        <span style={{ color: "var(--tool)" }}>{d.glyph}</span> {d.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="panel">
              <h2>Subagent activity ({subagentEvents.length})</h2>
              {subagentEvents.length === 0 ? (
                <div className="empty">No subagent activity.</div>
              ) : (
                <ul className="clean">
                  {subagentEvents.map((e, i) => (
                    <li key={i} className="mono">@ {e.name} - {e.status}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
