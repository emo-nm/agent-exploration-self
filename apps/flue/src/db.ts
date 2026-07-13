// Flue Node persistence adapter (handoff #12: "Configure persistence
// appropriate for durable local testing"). File-backed SQLite survives process
// restart on this host, which is what the durability/failure tests (#18-19)
// exercise. This is Flue's own conversation/submission durability; application
// product state (proposals/effects) lives in @demo/persistence via stores.ts.
import { sqlite } from "@flue/runtime/node";
import type { PersistenceAdapter } from "@flue/runtime/adapter";

const adapter: PersistenceAdapter = sqlite(
    process.env.FLUE_SQLITE_PATH ?? "./data/flue.db",
);

export default adapter;
