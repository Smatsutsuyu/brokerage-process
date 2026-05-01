"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, LogOut, Settings } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils";

type UserMenuProps = {
  name: string;
  email: string;
  role: "owner" | "broker" | "analyst" | "viewer";
};

const ROLE_LABEL: Record<UserMenuProps["role"], string> = {
  owner: "Owner",
  broker: "Broker",
  analyst: "Analyst",
  viewer: "Viewer",
};

export function UserMenu({ name, email, role }: UserMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      await signOut();
      router.push("/sign-in");
      router.refresh();
    });
  }

  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-100",
          isPending && "opacity-60",
        )}
      >
        <div className="bg-brand-ink flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-semibold text-gray-900">{name}</div>
          <div className="truncate text-[10px] text-gray-500">{ROLE_LABEL[role]}</div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <div className="px-2 py-1.5">
          <div className="text-[12px] font-semibold text-gray-900">{name}</div>
          <div className="truncate text-[11px] text-gray-500">{email}</div>
        </div>
        <DropdownMenuSeparator />
        {role === "owner" && (
          <DropdownMenuItem
            onSelect={() => router.push("/admin/members")}
            className="text-[13px]"
          >
            <Settings className="h-3.5 w-3.5" />
            Members
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleSignOut} className="text-[13px]">
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
