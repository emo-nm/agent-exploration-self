// Server-only bridge from the three typed adapters to one AgentEvent stream the
// UI consumes uniformly. The adapters have genuinely different shapes (eve:
// collect-then-return; flue: submit + observe; mastra: async-generator stream)
// — see docs/log/2026-07-11-web-ui-notes.md for the adapter-gap findings. This
// module papers over that divergence behind a single async iterable.
//
// NO API keys exist in this env, so a real turn cannot run: when an adapter or
// backend is unavailable the stream yields a single normalized `error` event
// and the UI degrades gracefully.
import "server-only";
import type { AgentEvent, Backend } from "@demo/contracts";
import { BACKENDS } from "./backends";
import { getRepo } from "./repo";

function errorEvent(message: string): AgentEvent {
  return { type: "error", message, ts: new Date().toISOString() };
}

/** Drive one turn against `backend` for `threadId`, yielding normalized events. */
export async function* runTurn(
  backend: Backend,
  threadId: string,
  message: string,
): AsyncGenerator<AgentEvent> {
  try {
    if (backend === "eve") {
      const { createEveAdapter } = await import("@demo/eve-adapter");
      // Auth: eve/client's auth shape is opaque here; wiring EVE_SERVICE_TOKEN
      // through it is left for the live pass (no keys in this env).
      const adapter = createEveAdapter({
        host: BACKENDS.eve.baseUrl,
        threads: getRepo(),
      });
      await adapter.createThread(threadId);
      const { events } = await adapter.sendMessage(threadId, message);
      for (const event of events) yield event;
      return;
    }

    if (backend === "flue") {
      const { createFlueAdapter } = await import("@demo/flue-adapter");
      const adapter = createFlueAdapter({
        baseUrl: BACKENDS.flue.baseUrl,
        token: process.env.FLUE_SERVICE_TOKEN,
      });
      adapter.createThread(threadId);
      await adapter.sendMessage(threadId, message);
      // Flue materializes the conversation; read it back as normalized events.
      const { events } = await adapter.getThread(threadId);
      for (const event of events) yield event;
      return;
    }

    if (backend === "mastra") {
      const { MastraAdapter } = await import("@demo/mastra-adapter");
      const adapter = new MastraAdapter({
        baseUrl: BACKENDS.mastra.baseUrl,
        serviceToken: process.env.MASTRA_SERVICE_TOKEN,
      });
      const handle = await adapter.createThread(threadId, threadId);
      for await (const event of adapter.streamEvents(handle, message)) {
        yield event;
      }
      return;
    }

    yield errorEvent(`unknown backend: ${backend}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    yield errorEvent(
      `${backend} turn failed (expected without a live backend + model key): ${detail}`,
    );
  }
}
