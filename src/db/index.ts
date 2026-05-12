import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import ws from "ws";

import { env } from "@/lib/env";

import * as schema from "./schema";

// Neon serverless (WebSocket Pool) in production — same Neon endpoint as
// the HTTP driver but supports stateful transactions. Switched off the
// HTTP driver in 2026-05-12 after `db.transaction(...)` failed in prod
// with "No transactions support in neon-http driver" — bulk add-contacts
// + the new addContact transaction need atomicity.
//
// postgres.js stays the local-dev path (talks straight to Docker postgres).
const isNeon = env.DATABASE_URL.includes("neon.tech");

// Node runtime needs a WebSocket constructor for the Neon serverless
// driver. Edge runtime would use the global WebSocket; we're on Node, so
// wire the `ws` package in. Idempotent — set once at module load.
if (isNeon && !neonConfig.webSocketConstructor) {
  // Cast through unknown — `neonConfig.webSocketConstructor` expects the DOM
  // WebSocket type but `ws.WebSocket` is API-compatible at runtime.
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

// Singleton the connection pool across hot reloads (dev) and build-worker
// reuse (prod build) so we don't open dozens of pools and trip Postgres's
// max_connections limit. `max: 5` keeps each instance modest.
const globalForDb = globalThis as unknown as {
  __pgClient?: Sql;
  __neonPool?: Pool;
};

function getPgClient(): Sql {
  if (!globalForDb.__pgClient) {
    globalForDb.__pgClient = postgres(env.DATABASE_URL, { max: 5 });
  }
  return globalForDb.__pgClient;
}

function getNeonPool(): Pool {
  if (!globalForDb.__neonPool) {
    globalForDb.__neonPool = new Pool({ connectionString: env.DATABASE_URL });
  }
  return globalForDb.__neonPool;
}

export const db = isNeon
  ? drizzleNeonServerless({ client: getNeonPool(), schema, casing: "snake_case" })
  : drizzlePostgres(getPgClient(), { schema, casing: "snake_case" });

export { schema };
