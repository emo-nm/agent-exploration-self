// @demo/persistence — Drizzle schema + client for shared app state (handoff §10)
// Framework-neutral: NO Eve/Flue/Mastra/Smithers imports.
export * from "./schema.js";
export * from "./repo.js";
export { InMemoryEffectsRepo } from "./memory-repo.js";
export { createDatabase, createPool } from "./client.js";
export type { Database } from "./client.js";
export { DrizzleEffectsRepo } from "./drizzle-repo.js";
