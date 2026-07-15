import { redirect } from "next/navigation";

import { ConfirmProvider } from "@/components/confirm/confirm-provider";
import { FeedbackShell } from "@/components/feedback/feedback-shell";
import { FeedbackZone } from "@/components/feedback/feedback-zone";
import { PriorityRibbon } from "@/components/layout/priority-ribbon";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Password-reset gate. Individual pages still handle their own sign-in
  // redirect when getCurrentUser returns null; this layout only intercepts
  // signed-in users mid-flow whose owner has forced a password reset.
  // Extra DB round-trip is free thanks to React.cache() inside getCurrentUser.
  const me = await getCurrentUser();
  if (me?.mustSetPassword) redirect("/set-password");

  return (
    <ConfirmProvider>
      <FeedbackShell>
        {/* h-dvh (dynamic viewport height) instead of h-screen (100vh) so
            the layout shrinks when Android/iOS browser chrome or system
            nav bars cover the bottom of the viewport. h-screen extends
            past the visible area on tablets, hiding the sidebar's
            bottom-pinned UserLink under the system nav. */}
        <div className="flex h-dvh flex-col">
          <FeedbackZone section="priority-ribbon" align="inside">
            <PriorityRibbon />
          </FeedbackZone>
          <div className="flex min-h-0 flex-1">{children}</div>
        </div>
      </FeedbackShell>
      <Toaster position="bottom-right" />
    </ConfirmProvider>
  );
}
