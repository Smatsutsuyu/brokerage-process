"use client";

import { useState, type ReactNode } from "react";
import { FlaskConical } from "lucide-react";

import { FeedbackZone } from "@/components/feedback/feedback-zone";
import { cn } from "@/lib/utils";

type TabKey =
  | "checklist"
  | "contacts"
  | "qa"
  | "issues"
  | "consultants"
  | "proto-a"
  | "proto-b"
  | "proto-c"
  | "proto-d";

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

const TABS: Array<{ key: TabKey; label: string; group?: "main" | "proto" }> = [
  { key: "checklist", label: "Checklist", group: "main" },
  { key: "contacts", label: "Contacts", group: "main" },
  { key: "qa", label: "Q&A", group: "main" },
  { key: "issues", label: "Issues", group: "main" },
  { key: "consultants", label: "Consultants", group: "main" },
  { key: "proto-a", label: "A · Cards", group: "proto" },
  { key: "proto-b", label: "B · Pane", group: "proto" },
  { key: "proto-c", label: "C · Grouped", group: "proto" },
  { key: "proto-d", label: "D · Compact", group: "proto" },
];

export function DealTabs({ counts, children }: DealTabsProps) {
  const [active, setActive] = useState<TabKey>("checklist");

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
      // Prototype tabs share the buyer count from contacts.
      case "proto-a":
      case "proto-b":
      case "proto-c":
      case "proto-d":
        return null;
    }
  }

  const mainTabs = TABS.filter((t) => t.group === "main");
  const protoTabs = TABS.filter((t) => t.group === "proto");

  // Prototype switcher is only relevant when looking at Contacts or one of
  // the prototype views — hide it on Checklist / Q&A / Issues / Consultants.
  const showProtoStrip = active === "contacts" || active.startsWith("proto-");

  return (
    <>
      <nav
        className={cn(
          "flex flex-wrap items-center gap-0 border-b-2 border-gray-200",
          showProtoStrip ? "mb-2" : "mb-6",
        )}
      >
        {mainTabs.map((tab) => {
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

      {/* Prototype switcher — only visible when looking at Contacts or a
          prototype view. Visually offset so it reads as throwaway exploration.
          Wrapped in a FeedbackZone so Chris can leave notes specifically about
          the prototypes (which one he prefers, what's missing, etc.). */}
      {showProtoStrip && (
        <FeedbackZone section="contacts-prototypes" className="mb-6">
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2">
            <FlaskConical className="h-3.5 w-3.5 text-amber-700" />
            <span className="mr-2 text-[10px] font-bold tracking-wider text-amber-800 uppercase">
              Contacts prototypes
            </span>
            {protoTabs.map((tab) => {
              const isActive = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    isActive
                      ? "bg-amber-700 text-white"
                      : "text-amber-800 hover:bg-amber-100",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </FeedbackZone>
      )}

      <div>{children[active]}</div>
    </>
  );
}
