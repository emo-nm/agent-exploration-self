// Model-driven conversation drivers, one per backend, backed by the shipped
// adapter packages (@demo/eve-adapter, @demo/flue-adapter, @demo/mastra-adapter)
// — the same server-side clients the web app uses. The adapters are imported
// lazily so dry runs and unit tests never load a framework SDK.
//
// These methods drive a real model loop and therefore CANNOT run without
// OPENROUTER_API_KEY in this environment. They are wired end-to-end so the
// moment the key lands, the live scenarios fire unchanged.
import type { ThreadsRepo } from "@demo/persistence";
import type { AgentEvent } from "@demo/contracts";
import type { BackendConfig } from "./backends.js";

export interface AgentDriver {
  backend: string;
  /** Send one user turn; resolve with the turn's normalized events. */
  sendMessage: (threadId: string, message: string) => Promise<AgentEvent[]>;
  /** Reattach to the durable event stream for a thread (reconnect). */
  streamEvents: (threadId: string) => AsyncIterable<AgentEvent>;
}

export interface DriverDeps {
  config: BackendConfig;
  threads: ThreadsRepo;
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
    async sendMessage(threadId, message) {
      const a = await adapter();
      const { events } = await a.sendMessage(threadId, message);
      return events;
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
    async sendMessage(threadId, message) {
      const a = await adapter();
      await a.sendMessage(threadId, message);
      const { events } = await a.getThread(threadId);
      return events;
    },
    async *streamEvents(threadId) {
      const a = await adapter();
      // Flue observation is push-based; adapt to a one-shot snapshot read.
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
    async sendMessage(threadId, message) {
      const a = await adapter();
      const handle = await a.createThread(`res_${threadId}`, threadId);
      return a.sendMessage(handle, message);
    },
    async *streamEvents(threadId) {
      const a = await adapter();
      const handle = await a.createThread(`res_${threadId}`, threadId);
      yield* a.streamEvents(handle, "");
    },
  };
}
