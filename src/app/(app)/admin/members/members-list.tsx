"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldOff, UserPlus } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { changeMemberRole, setMemberDisabled, type Role } from "../actions";

import { InviteMemberModal } from "./invite-member-modal";

export type MemberRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  disabled: boolean;
  createdAt: string;
};

type MembersListProps = {
  currentUserId: string;
  members: MemberRow[];
};

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  broker: "Broker",
  analyst: "Analyst",
  viewer: "Viewer",
};

const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: "Full access including member management",
  broker: "Create and manage deals, contacts, documents",
  analyst: "View deals, edit underwriting data",
  viewer: "Read-only access",
};

const ROLES: Role[] = ["owner", "broker", "analyst", "viewer"];

export function MembersList({ currentUserId, members }: MembersListProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();

  function handleRoleChange(userId: string, role: Role) {
    setPendingId(userId);
    startTransition(async () => {
      await changeMemberRole({ userId, role });
      setPendingId(null);
    });
  }

  async function handleToggleDisabled(member: MemberRow) {
    const next = !member.disabled;
    if (next) {
      const ok = await confirm({
        title: `Disable ${memberName(member)}?`,
        description:
          "They won't be able to sign in until you re-enable their account. Existing deal references stay intact.",
        confirmLabel: "Disable",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setPendingId(member.id);
    startTransition(async () => {
      await setMemberDisabled({ userId: member.id, disabled: next });
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {members.length} {members.length === 1 ? "member" : "members"}
          </div>
          <div className="text-xs text-gray-500">
            Each role gates what they can see and change in the platform.
          </div>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Invite member
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Role</th>
              <th className="px-4 py-2.5 text-left">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isMe = member.id === currentUserId;
              const isPending = pendingId === member.id;
              return (
                <tr
                  key={member.id}
                  className={cn(
                    "border-b border-gray-100 hover:bg-gray-50",
                    member.disabled && "opacity-60",
                    isPending && "opacity-50",
                  )}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-900">{memberName(member)}</span>
                    {isMe && (
                      <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{member.email}</td>
                  <td className="px-4 py-3">
                    {isMe ? (
                      <span className="text-gray-700">{ROLE_LABEL[member.role]}</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded text-gray-700 hover:text-gray-900"
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {ROLE_LABEL[member.role]}
                          <span className="text-gray-400">▾</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          {ROLES.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              onSelect={() => handleRoleChange(member.id, r)}
                              className="flex flex-col items-start gap-0.5"
                            >
                              <span className="text-[13px] font-semibold">{ROLE_LABEL[r]}</span>
                              <span className="text-[11px] text-gray-500">
                                {ROLE_DESCRIPTION[r]}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {member.disabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        Disabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isMe && (
                      <button
                        type="button"
                        onClick={() => handleToggleDisabled(member)}
                        disabled={isPending}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
                      >
                        {member.disabled ? (
                          "Re-enable"
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <ShieldOff className="h-3 w-3" />
                            Disable
                          </span>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InviteMemberModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function memberName(member: MemberRow): string {
  return `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() || member.email;
}
