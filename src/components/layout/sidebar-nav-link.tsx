"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SidebarNavLinkProps = {
  href: string;
  icon: ReactNode;
  children: ReactNode;
};

export function SidebarNavLink({ href, icon, children }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors",
        isActive
          ? "border-brand-blue bg-blue-50 text-brand-blue border font-semibold"
          : "border border-transparent text-gray-700 hover:bg-gray-100",
      )}
    >
      <span className={cn("flex h-3.5 w-3.5 items-center justify-center", !isActive && "text-gray-500")}>
        {icon}
      </span>
      {children}
    </Link>
  );
}
