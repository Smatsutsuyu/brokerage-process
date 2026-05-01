import type { ReactNode } from "react";

import { env } from "@/lib/env";

import { FeedbackButton } from "./feedback-button";
import { FeedbackContextProvider } from "./feedback-context";
import { FeedbackModal } from "./feedback-modal";

// Mounts the in-app feedback widgets when NEXT_PUBLIC_FEEDBACK_ENABLED is true.
// When false (typically production after handoff), renders children only —
// the entire feedback module gets tree-shaken from the client bundle.
export function FeedbackShell({ children }: { children: ReactNode }) {
  if (!env.NEXT_PUBLIC_FEEDBACK_ENABLED) return <>{children}</>;
  return (
    <FeedbackContextProvider>
      {children}
      <FeedbackButton />
      <FeedbackModal commitSha={env.NEXT_PUBLIC_COMMIT_SHA} />
    </FeedbackContextProvider>
  );
}
