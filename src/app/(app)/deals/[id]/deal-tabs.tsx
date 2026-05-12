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
  | "proto-a"
  | "proto-b"
  | "proto-c"
  | "proto-d";

const TAB_KEYS: ReadonlySet<TabKey> = new Set([
  "checklist",
  "contacts",
  "qa",
  "issues",
  "consultants",
  "proto-a",
  "proto-b",
  "proto-c",
  "proto-d",
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
      // Prototype tabs share the buyer count from contacts.
      case "proto-a":
      case "proto-b":
      case "proto-c":
      case "proto-d":
        return null;
    }
  }

  const mainTabs = TABS.filter((t) => t.group === "main");

  // Prototype switcher removed (2026-05-12) — Chris picked the cards layout
  // as canonical. The proto-* tab keys still resolve via ?tab= so the views
  // stay reachable for design review, but no UI affordance surfaces them.

  return (
    <>
      <nav className="mb-6 flex flex-wrap items-center gap-0 border-b-2 border-gray-200">
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

      <div>{children[active]}</div>
    </>
  );
}
