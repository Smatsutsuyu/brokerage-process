import { ConfirmProvider } from "@/components/confirm/confirm-provider";
import { FeedbackShell } from "@/components/feedback/feedback-shell";
import { FeedbackZone } from "@/components/feedback/feedback-zone";
import { PriorityRibbon } from "@/components/layout/priority-ribbon";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
