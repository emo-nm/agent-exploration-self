import type { Stores } from "../shared/stores.ts";

/**
 * Trusted, application-supplied context bound to each agent instance's tools.
 * The model never chooses `threadId` or `stores` — the agent instance id
 * establishes them (handoff #12, Flue tools guide "Protect access").
 */
export interface ToolFactoryContext {
    /** Application thread id that owns this agent instance. */
    threadId: string;
    stores: Stores;
}
