import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { LinksToTab } from "@/db/checklist-template";
import { cn } from "@/lib/utils";

const TAB_LABEL: Record<LinksToTab, string> = {
  checklist: "Checklist",
  contacts: "Contacts",
  qa: "Q&A",
  issues: "Issues",
  consultants: "Consultants",
  team: "Teams",
};

type ChecklistTabLinkProps = {
  dealId: string;
  tab: LinksToTab;
};

// Small "Open [Tab]" affordance on a checklist row, used when the row's
// data lives on a sibling tab (e.g. Issues Tracking row links to the
// Issues tab). Same compact button styling as the planned-action chips
// so it sits naturally with them in the row's action area.
export function ChecklistTabLink({ dealId, tab }: ChecklistTabLinkProps) {
  const href = tab === "checklist" ? `/deals/${dealId}` : `/deals/${dealId}?tab=${tab}`;
  return (
    <Link
      href={href}
      title={`Open the ${TAB_LABEL[tab]} tab on this deal`}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-700",
      )}
    >
      <ArrowUpRight className="h-3 w-3" />
      Open {TAB_LABEL[tab]}
    </Link>
  );
}
