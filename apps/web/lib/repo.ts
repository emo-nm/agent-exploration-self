// Server-only singleton application repo. createDemoRepo() returns the
// Drizzle/Postgres repo when DATABASE_URL is set, else the in-memory double
// (docs/architecture.md). Cached on globalThis so hot-reload / multiple route
// handlers in dev share one instance (and one pg pool).
import "server-only";
import { createDemoRepo, type DemoRepo } from "@demo/persistence";

const globalForRepo = globalThis as unknown as { __demoRepo?: DemoRepo };

export function getRepo(): DemoRepo {
  if (!globalForRepo.__demoRepo) {
    globalForRepo.__demoRepo = createDemoRepo();
  }
  return globalForRepo.__demoRepo;
}

export function repoBackendLabel(): string {
  return process.env.DATABASE_URL ? "postgres" : "in-memory";
}
