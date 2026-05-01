import { FeedbackShell } from "@/components/feedback/feedback-shell";
import { FeedbackZone } from "@/components/feedback/feedback-zone";
import { PriorityRibbon } from "@/components/layout/priority-ribbon";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <FeedbackShell>
      <div className="flex h-screen flex-col">
        <FeedbackZone section="priority-ribbon" align="inside">
          <PriorityRibbon />
        </FeedbackZone>
        <div className="flex min-h-0 flex-1">{children}</div>
      </div>
    </FeedbackShell>
  );
}
