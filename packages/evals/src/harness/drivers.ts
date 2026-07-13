// Model-driven conversation drivers, one per backend, backed by the shipped
// adapter packages (@demo/eve-adapter, @demo/flue-adapter, @demo/mastra-adapter)
// — the same server-side clients the web app uses. The adapters are imported
// lazily so dry runs and unit tests never load a framework SDK.
//
// These methods drive a real model loop and therefore CANNOT run without
// OPENROUTER_API_KEY in this environment. They are wired end-to-end so the
// moment the key lands, the live scenarios fire unchanged.
//
// CHECKPOINT SEMANTICS (why this file is more than a thin pass-through)
// --------------------------------------------------------------------
// Eve and Mastra are synchronous-streaming: `sendMessage` opens one streaming
// HTTP request and the client observes the turn's events as they arrive, so the
// call naturally blocks until the turn is done. Flue is submit-then-observe:
// `client.agents.send()` ADMITS a durable submission and returns immediately at
// accept; the model work then runs server-side. A naive Flue driver returned at
// admission and tested nothing (the whole 8-scenario suite "passed" in 8.8s).
//
// So every driver takes a per-turn checkpoint telling it how far to observe:
//   - "settled":       observe/stream until the turn is COMPLETE (the natural
//                      eve/mastra behavior; for Flue, observe the durable
//                      submission until it settles).
//   - "model-started": return as soon as model work has DEMONSTRABLY started
//                      (first assistant/tool/reasoning event) while leaving the
//                      turn IN-FLIGHT server-side. Used by kill-during-model-work
//                      so the SIGKILL lands mid-turn, and by the stream
//                      disconnect/reconnect scenario so the reconnect is genuinely
//                      mid-flight. For all three backends this is now symmetric.
import type { ThreadsRepo } from "@demo/persistence";
import type { AgentEvent } from "@demo/contracts";
import type { BackendConfig } from "./backends.js";

export type TurnCheckpoint = "settled" | "model-started";

export interface SendOptions {
  /** How far to observe the turn before returning. Default "settled". */
  until?: TurnCheckpoint;
  /** Hard budget for reaching the checkpoint; rejects with a clear message. */
  timeoutMs?: number;
}

export interface AgentDriver {
  backend: string;
  /** Send one user turn; resolve at the requested checkpoint with its events. */
  sendMessage: (
    threadId: string,
    message: string,
    opts?: SendOptions,
  ) => Promise<AgentEvent[]>;
  /** Reattach to the durable event stream for a thread (reconnect). */
  streamEvents: (threadId: string) => AsyncIterable<AgentEvent>;
}

export interface DriverDeps {
  config: BackendConfig;
  threads: ThreadsRepo;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An assistant/tool/reasoning event means the model has actually started. */
function modelWorkStarted(events: AgentEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === "tool-call" ||
      e.type === "tool-result" ||
      e.type === "subagent" ||
      (e.type === "message" && e.role === "assistant"),
  );
}

export function createDriver(deps: DriverDeps): AgentDriver {
  switch (deps.config.name) {
    case "eve":
      return createEveDriver(deps);
    case "flue":
      return createFlueDriver(deps);
    case "mastra":
      return createMastraDriver(deps);
    default:
      throw new Error(`no driver for backend ${deps.config.name}`);
  }
}

function createEveDriver(deps: DriverDeps): AgentDriver {
  let adapterP: Promise<import("@demo/eve-adapter").EveAdapter> | undefined;
  const adapter = async () => {
    if (!adapterP) {
      adapterP = import("@demo/eve-adapter").then(({ createEveAdapter }) =>
        createEveAdapter({ host: deps.config.baseUrl, threads: deps.threads }),
      );
    }
    return adapterP;
  };
  return {
    backend: "eve",
    async sendMessage(threadId, message, opts) {
      const a = await adapter();
      if ((opts?.until ?? "settled") === "settled") {
        const { events } = await a.sendMessage(threadId, message);
        return events;
      }
      // model-started: begin the turn, return at the first model event, and
      // leave the eve run executing server-side (durable) so a subsequent kill
      // lands mid-work. Eve creates the run server-side on send(); abandoning
      // the client stream does not stop it.
      const collected: AgentEvent[] = [];
      const it = a.streamMessage(threadId, message);
      for await (const ev of it) {
        collected.push(ev);
        if (modelWorkStarted(collected)) break;
      }
      return collected;
    },
    async *streamEvents(threadId) {
      const a = await adapter();
      yield* a.streamEvents(threadId);
    },
  };
}

function createFlueDriver(deps: DriverDeps): AgentDriver {
  let adapterP: Promise<import("@demo/flue-adapter").FlueAdapter> | undefined;
  const adapter = async () => {
    if (!adapterP) {
      adapterP = import("@demo/flue-adapter").then(({ createFlueAdapter }) =>
        createFlueAdapter({ baseUrl: deps.config.baseUrl }),
      );
    }
    return adapterP;
  };
  return {
    backend: "flue",
    async sendMessage(threadId, message, opts) {
      const a = await adapter();
      const until = opts?.until ?? "settled";
      const budget = opts?.timeoutMs ?? (until === "settled" ? 240_000 : 60_000);
      // Admit the durable submission (returns at accept, model runs server-side).
      const admission = await a.sendMessage(threadId, message);
      const deadline = Date.now() + budget;
      let last: AgentEvent[] = [];
      // Poll the materialized conversation until the target checkpoint. history()
      // is a durable point-in-time read: settlements populate on terminal, and
      // in-flight assistant/tool parts appear as the submission streams.
      while (Date.now() < deadline) {
        const { events, snapshot } = await a.getThread(threadId);
        last = events;
        if (until === "settled") {
          const settled = snapshot.settlements.some(
            (s) => s.submissionId === admission.submissionId,
          );
          if (settled) return events;
        } else if (modelWorkStarted(events)) {
          // Return mid-flight: the durable submission keeps running server-side.
          return events;
        }
        await sleep(1_000);
      }
      throw new Error(
        `flue submission ${admission.submissionId} did not reach '${until}' within ${budget}ms (last ${last.length} events)`,
      );
    },
    async *streamEvents(threadId) {
      const a = await adapter();
      // Reconnect == re-read the materialized (durable) conversation snapshot.
      const { events } = await a.getThread(threadId);
      yield* events;
    },
  };
}

function createMastraDriver(deps: DriverDeps): AgentDriver {
  let adapterP: Promise<import("@demo/mastra-adapter").MastraAdapter> | undefined;
  const adapter = async () => {
    if (!adapterP) {
      adapterP = import("@demo/mastra-adapter").then(
        ({ MastraAdapter }) => new MastraAdapter({ baseUrl: deps.config.baseUrl }),
      );
    }
    return adapterP;
  };
  return {
    backend: "mastra",
    async sendMessage(threadId, message, opts) {
      const a = await adapter();
      const handle = await a.createThread(`res_${threadId}`, threadId);
      if ((opts?.until ?? "settled") === "settled") {
        return a.sendMessage(handle, message);
      }
      // model-started: stop reading after the first model event. NOTE: Mastra's
      // turn is driven by this streaming request; abandoning the reader may
      // cancel the in-flight turn (unlike eve's server-side durable run). Flagged
      // in the results writeup.
      const collected: AgentEvent[] = [];
      for await (const ev of a.streamEvents(handle, message)) {
        collected.push(ev);
        if (modelWorkStarted(collected)) break;
      }
      return collected;
    },
    async *streamEvents(threadId) {
      const a = await adapter();
      const handle = await a.createThread(`res_${threadId}`, threadId);
      yield* a.streamEvents(handle, "");
    },
  };
}
