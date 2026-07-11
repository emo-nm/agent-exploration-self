// Drizzle client for local/persistent Postgres hosts via node-postgres.
// Framework-neutral.
//
// TODO(vercel): add a neon-http client variant (drizzle-orm/neon-http +
// @neondatabase/serverless) for Vercel serverless functions. The `schema` is
// already exported so a neon client can reuse it unchanged.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function createPool(connectionString = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({ connectionString });
}

export function createDatabase(pool: Pool = createPool()) {
  return drizzle(pool, { schema });
}
