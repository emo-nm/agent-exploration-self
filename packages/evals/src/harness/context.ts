// The shared context a scenario's phases operate on. It bundles the durable
// repo (Postgres or in-memory), the model driver (gated), process-control
// hooks (start/kill/restart the service), and the exactly-once count source.
// The runner builds a live context; unit tests build a fake one.
import type { EffectCountRow } from "@demo/persistence";
import type { DemoRepo } from "@demo/persistence";
import type { BackendName } from "./backends.js";
import type { AgentDriver } from "./drivers.js";

export interface ScenarioContext {
  backend: BackendName;
  /** Durable application store shared across restarts (Postgres in real runs). */
  repo: DemoRepo;
  /** True only when a real model loop can run (OPENROUTER_API_KEY present). */
  modelAvailable: boolean;
  /** Model-driven conversation driver (backed by the backend's adapter). */
  driver: AgentDriver;
  /** Grouped publication_effects counts, from the durable store. */
  countEffects: () => Promise<EffectCountRow[]>;
  /** Reset the durable store between scenarios (TRUNCATE, never DROP). */
  reset: () => Promise<void>;

  // --- process control (no-ops in unit tests / pure dry runs) ---
  /** (Re)start the backend service and wait for health. */
  startService: () => Promise<void>;
  /** SIGKILL the running service (hard crash checkpoint). */
  killService: () => Promise<void>;

  /** Per-scenario counters surfaced in the JSON result. */
  attempts: { publish: number; restarts: number };

  /** Scratchpad for phases to share ids across a scenario (threadId, proposalId). */
  bag: Record<string, string>;
}
