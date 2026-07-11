// Process-level store factory. Chooses in-memory doubles or Drizzle/Postgres
// based on DATABASE_URL (handoff §9/§10). One instance per process so the agent
// tools, the approval HTTP routes, and the publish effect all share the same
// application-owned state.
import {
  DrizzleEffectsRepo,
  InMemoryEffectsRepo,
  createDatabase,
  type EffectsRepo,
} from "@demo/persistence";
import { InMemoryProposalStore, type ProposalStore } from "./proposals.ts";
import { DrizzleProposalStore } from "./proposals-drizzle.ts";

export interface Stores {
  effects: EffectsRepo;
  proposals: ProposalStore;
  backend: "memory" | "drizzle";
}

let singleton: Stores | undefined;

export function getStores(): Stores {
  if (singleton) return singleton;

  if (process.env.DATABASE_URL) {
    const db = createDatabase();
    singleton = {
      effects: new DrizzleEffectsRepo(db),
      proposals: new DrizzleProposalStore(db),
      backend: "drizzle",
    };
  } else {
    singleton = {
      effects: new InMemoryEffectsRepo(),
      proposals: new InMemoryProposalStore(),
      backend: "memory",
    };
  }
  return singleton;
}

/** Test seam: reset the process singleton between test cases. */
export function resetStores(): void {
  singleton = undefined;
}
