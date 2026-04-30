import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";

import * as schema from "./schema";

// Neon HTTP driver in production (zero connection management, edge-friendly).
// postgres.js for local dev against a standard Postgres (e.g. docker-compose).
const isNeon = env.DATABASE_URL.includes("neon.tech");

export const db = isNeon
  ? drizzleNeon({ client: neon(env.DATABASE_URL), schema, casing: "snake_case" })
  : drizzlePostgres(postgres(env.DATABASE_URL), { schema, casing: "snake_case" });

export { schema };
