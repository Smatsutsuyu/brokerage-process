"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TabKey = "checklist" | "contacts" | "qa" | "issues" | "consultants";

type DealTabsProps = {
  counts: {
    checklist: { done: number; total: number };
    contacts: number;
    qa: { approved: number; total: number };
    issuesOpen: number;
    consultants: number;
  };
  children: Record<TabKey, ReactNode>;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "checklist", label: "Checklist" },
  { key: "contacts", label: "Contacts" },
  { key: "qa", label: "Q&A" },
  { key: "issues", label: "Issues" },
  { key: "consultants", label: "Consultants" },
];

export function DealTabs({ counts, children }: DealTabsProps) {
  const [active, setActive] = useState<TabKey>("checklist");

  function badgeFor(key: TabKey): string {
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
    }
  }

  return (
    <>
      <nav className="mb-6 flex flex-wrap gap-0 border-b-2 border-gray-200">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
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
              <span
                className={cn(
                  "rounded-full px-2 py-px text-[11px] font-medium tabular-nums",
                  isActive ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500",
                )}
              >
                {badgeFor(tab.key)}
              </span>
            </button>
          );
        })}
      </nav>

      <div>{children[active]}</div>
    </>
  );
}
