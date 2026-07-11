// @demo/persistence — Drizzle schema + client for shared app state (handoff §10)
// Framework-neutral: NO Eve/Flue/Mastra/Smithers imports.
export * from "./schema.js";
export * from "./repo.js";
export { InMemoryEffectsRepo, InMemoryDemoRepo } from "./memory-repo.js";
export { createDatabase, createPool } from "./client.js";
export type { Database } from "./client.js";
export { DrizzleEffectsRepo, DrizzleDemoRepo } from "./drizzle-repo.js";

import type { DemoRepo } from "./repo.js";
import { InMemoryDemoRepo } from "./memory-repo.js";
import { createDatabase } from "./client.js";
import { DrizzleDemoRepo } from "./drizzle-repo.js";

/**
 * Return the application repo for the current environment: the Drizzle/Postgres
 * repo when DATABASE_URL is set, otherwise the in-memory double. This is the
 * single switch the framework apps use so no API keys / DB are needed locally.
 * The pg pool is only constructed on the DB path (createDatabase call), so the
 * in-memory path never touches Postgres.
 */
export function createDemoRepo(): DemoRepo {
  if (process.env.DATABASE_URL) {
    return new DrizzleDemoRepo(createDatabase());
  }
  return new InMemoryDemoRepo();
}
