"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type TabKey =
  | "checklist"
  | "contacts"
  | "qa"
  | "issues"
  | "consultants"
  | "team";

const TAB_KEYS: ReadonlySet<TabKey> = new Set([
  "checklist",
  "contacts",
  "qa",
  "issues",
  "consultants",
  "team",
]);

function isTabKey(s: string | null | undefined): s is TabKey {
  return s !== null && s !== undefined && TAB_KEYS.has(s as TabKey);
}

type DealTabsProps = {
  counts: {
    checklist: { done: number; total: number };
    contacts: number;
    qa: { approved: number; total: number };
    issuesOpen: number;
    consultants: number;
    team: number;
  };
  children: Record<TabKey, ReactNode>;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "checklist", label: "Checklist" },
  { key: "contacts", label: "Contacts" },
  { key: "qa", label: "Q&A" },
  { key: "issues", label: "Issues" },
  { key: "consultants", label: "Consultants" },
  { key: "team", label: "Teams" },
];

export function DealTabs({ counts, children }: DealTabsProps) {
  // URL is the single source of truth for the active tab. ?tab= = deep-link
  // friendly (Contacts directory links straight to /deals/[id]?tab=contacts);
  // tab clicks call router.replace so changes don't pollute browser history.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("tab");
  const active: TabKey = isTabKey(param) ? param : "checklist";

  function setActive(next: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "checklist") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    // Leaving Contacts drops the ?layout= param so it doesn't stick around
    // as noise when the user navigates to a different tab.
    if (next !== "contacts") {
      params.delete("layout");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function badgeFor(key: TabKey): string | null {
    switch (key) {
      case "checklist":
        return `${counts.checklist.done}/${counts.checklist.total}`;
      case "contacts":
        return String(counts.contacts);
      case "qa":
        return `${counts.qa.approved}/${counts.qa.total}`;
      case "issues":
        return `${counts.issuesOpen} open`;
      case "consultants":
        return String(counts.consultants);
      case "team":
        return String(counts.team);
    }
  }

  return (
    <>
      <nav className="mb-6 flex flex-wrap items-center gap-0 border-b-2 border-gray-200">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const badge = badgeFor(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={cn(
                "-mb-[2px] flex items-center gap-1.5 border-b-2 px-5 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
                isActive
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {tab.label}
              {badge && (
                <span
                  className={cn(
                    "rounded-full px-2 py-px text-[11px] font-medium tabular-nums",
                    isActive ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500",
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div>{children[active]}</div>
    </>
  );
}
