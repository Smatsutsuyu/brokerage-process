"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type UserLinkProps = {
  name: string;
  email: string;
  role: "owner" | "broker" | "analyst" | "viewer";
};

const ROLE_LABEL: Record<UserLinkProps["role"], string> = {
  owner: "Owner",
  broker: "Broker",
  analyst: "Analyst",
  viewer: "Viewer",
};

export function UserLink({ name, email, role }: UserLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === "/profile" || pathname.startsWith("/profile/");

  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <Link
      href="/profile"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors",
        isActive
          ? "border-brand-blue bg-blue-50"
          : "border-transparent hover:bg-gray-100",
      )}
      title={email}
    >
      <div className="bg-brand-ink flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[12px] font-semibold",
            isActive ? "text-brand-blue" : "text-gray-900",
          )}
        >
          {name}
        </div>
        <div className="truncate text-[10px] text-gray-500">{ROLE_LABEL[role]}</div>
      </div>
    </Link>
  );
}
