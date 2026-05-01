import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

// Better Auth instance. Drizzle adapter wires it to our Postgres.
// We use email/password for v1; can add Google OAuth later by adding
// `socialProviders.google` here and the GOOGLE_* env vars.
//
// Sign-up is intentionally disabled — this is an internal tool. Owners
// invite users from the /admin/members page (server-side createUser flow).
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.authUser,
      session: schema.authSession,
      account: schema.authAccount,
      verification: schema.authVerification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // TODO(handoff): we don't expose a sign-up UI — invites happen via
    // /admin/members which calls auth.api.signUpEmail server-side. But the
    // /api/auth/sign-up/email POST endpoint is technically still reachable.
    // Before production launch, harden via Better Auth's admin plugin OR a
    // server-side guard that rejects sign-up requests not originating from
    // the members admin page. Tracked in status log.
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh if older than 1 day
  },
  // nextCookies plugin must be last — it ensures cookies are set on
  // server actions / RSC contexts in addition to API routes.
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
