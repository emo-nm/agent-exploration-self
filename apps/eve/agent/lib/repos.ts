// Repo factory shared by every tool. In-memory when DATABASE_URL is unset
// (local/no-DB runs and unit tests), Drizzle/Postgres when it is set
// (handoff #10, #11). Tools run in the app runtime with full process.env, so
// this is the right place to resolve persistence.
import {
    InMemoryEffectsRepo,
    InMemoryThreadsRepo,
    InMemoryProposalsRepo,
    DrizzleEffectsRepo,
    DrizzleThreadsRepo,
    DrizzleProposalsRepo,
    createDatabase,
    type EffectsRepo,
    type ThreadsRepo,
    type ProposalsRepo,
} from "@demo/persistence";

export interface Repos {
    effects: EffectsRepo;
    threads: ThreadsRepo;
    proposals: ProposalsRepo;
}

let cached: Repos | undefined;

export function getRepos(): Repos {
    if (cached) return cached;
    if (process.env.DATABASE_URL) {
        const db = createDatabase();
        cached = {
            effects: new DrizzleEffectsRepo(db),
            threads: new DrizzleThreadsRepo(db),
            proposals: new DrizzleProposalsRepo(db),
        };
    } else {
        cached = {
            effects: new InMemoryEffectsRepo(),
            threads: new InMemoryThreadsRepo(),
            proposals: new InMemoryProposalsRepo(),
        };
    }
    return cached;
}

/** Test seam: inject in-memory repos and read them back after tool calls. */
export function __setReposForTest(repos: Repos): void {
    cached = repos;
}
