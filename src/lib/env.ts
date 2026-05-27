import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 chars"),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
    // Email pipeline. Both optional — when RESEND_API_KEY is unset,
    // sendEmail becomes a no-op and we log instead of sending. Lets dev
    // boot without a Resend account; lets prod stay quiet during the brief
    // window between domain-add and DNS verification. Recipients for
    // feedback notifications come from the users table (owner role +
    // per-channel preferences), not env.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().email().optional(),
    // Minimum gap (ms) between outbound blast sends — throttles a blast
    // under Resend's per-second rate limit. Optional: when unset the
    // blast pipeline falls back to DEFAULT_SEND_INTERVAL_MS in
    // lib/email/blast.ts. Set this to tune the rate without a code change
    // (e.g. raise it if Resend lowers the cap, drop it to 0 to disable).
    SEND_INTERVAL_MS: z.coerce.number().int().nonnegative().optional(),
  },
  client: {
    NEXT_PUBLIC_FEEDBACK_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    NEXT_PUBLIC_COMMIT_SHA: z.string().default("unknown"),
    // Public app URL for building absolute links in emails. Defaults to
    // localhost; production overrides via Vercel env.
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SEND_INTERVAL_MS: process.env.SEND_INTERVAL_MS,
    NEXT_PUBLIC_FEEDBACK_ENABLED: process.env.NEXT_PUBLIC_FEEDBACK_ENABLED,
    NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
});
