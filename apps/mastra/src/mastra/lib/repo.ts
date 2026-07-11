// Single application repo for the Mastra app. In-memory when DATABASE_URL is
// unset (local / no-DB), Drizzle/Postgres when set — the switch lives in
// @demo/persistence so every framework app shares one policy.
import { createDemoRepo, type DemoRepo } from '@demo/persistence';

export const repo: DemoRepo = createDemoRepo();
