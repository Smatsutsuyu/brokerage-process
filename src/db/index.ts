import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

// Neon HTTP driver in production (zero connection management, edge-friendly).
// postgres.js for local dev against a standard Postgres (e.g. docker-compose).
const isNeon = env.DATABASE_URL.includes("neon.tech");

// Singleton the postgres.js client across hot reloads (dev) and
// build-worker reuse (prod build) so we don't open dozens of pools and trip
// Postgres's max_connections limit. `max: 5` keeps each instance modest.
const globalForPg = globalThis as unknown as { __pgClient?: Sql };
function getPgClient(): Sql {
  if (!globalForPg.__pgClient) {
    globalForPg.__pgClient = postgres(env.DATABASE_URL, { max: 5 });
  }
  return globalForPg.__pgClient;
}

export const db = isNeon
  ? drizzleNeon({ client: neon(env.DATABASE_URL), schema, casing: "snake_case" })
  : drizzlePostgres(getPgClient(), { schema, casing: "snake_case" });

export { schema };
