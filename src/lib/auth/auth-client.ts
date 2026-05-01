"use client";

import { createAuthClient } from "better-auth/react";

// Client-side Better Auth wrapper. baseURL inferred from window.location
// in the browser; explicit on SSR isn't needed for our use cases (sign-in,
// sign-out, session checks).
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
