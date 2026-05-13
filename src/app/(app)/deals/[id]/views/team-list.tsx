"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bell,
  BellOff,
  Briefcase,
  Building2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { Button } from "@/components/ui/button";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

import {
  removeDealTeamMember,
  setDealTeamMemberIncluded,
  type DealTeamMemberRow,
  type TeamPickerContact,
  type TeamPickerUser,
} from "../actions";
import { TeamAddModal } from "./team-add-modal";
import { TeamEditModal, type EditingMember } from "./team-edit-modal";

type Team = "owner" | "broker" | "buyer";

type TeamListProps = {
  dealId: string;
  members: DealTeamMemberRow[];
  // Broker picker = org users only. Outside cobrokers should be added
  // via /admin/members first (login can stay un-issued).
  brokerUserOptions: TeamPickerUser[];
  // Buyer picker is scoped to contacts already on this deal so the
  // buyer team is a curated subset of "the buyers we're talking to."
  buyerContactOptions: TeamPickerContact[];
};

const TEAM_META: Record<
  Team,
  { label: string; description: string; icon: typeof UserRound; accent: string; bg: string }
> = {
  owner: {
    label: "Owner Team",
    description: "Sellers and principals on this deal.",
    icon: Building2,
    accent: "text-amber-700",
    bg: "bg-amber-50",
  },
  broker: {
    label: "Broker Team",
    description:
      "Everyone running point on this deal. Pick from users; add outside cobrokers as users (Admin → Members) first.",
    icon: Briefcase,
    accent: "text-blue-700",
    bg: "bg-blue-50",
  },
  buyer: {
    label: "Buyer Team",
    description:
      "The chosen buyer's contacts. Pick from contacts already on this deal (Contacts tab).",
    icon: Users,
    accent: "text-green-700",
    bg: "bg-green-50",
  },
};

const TEAMS: Team[] = ["owner", "broker", "buyer"];

export function TeamList({
  dealId,
  members,
  brokerUserOptions,
  buyerContactOptions,
}: TeamListProps) {
  const [adding, setAdding] = useState<Team | null>(null);
  const [editing, setEditing] = useState<EditingMember | null>(null);

  const byTeam = useMemo(() => {
    const m: Record<Team, DealTeamMemberRow[]> = { owner: [], broker: [], buyer: [] };
    for (const r of members) m[r.team].push(r);
    return m;
  }, [members]);

  const includedCount = members.filter((m) => m.includeInEmails).length;

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-gray-200 bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Deal Team Roster</h2>
            <p className="mt-1 text-[12px] text-gray-500">
              Three sub-teams. The checkmark per row decides whether the person
              is CC&apos;d on Deal Team email sends (Share DD Material, Send
              Issues PDF, etc.).
            </p>
          </div>
          <div className="flex-shrink-0 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium tabular-nums text-gray-700">
            {includedCount} of {members.length} on email sends
          </div>
        </div>
      </header>

      {TEAMS.map((team) => {
        const meta = TEAM_META[team];
        const rows = byTeam[team];
        const Icon = meta.icon;
        return (
          <section key={team} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div
              className={cn(
                "flex items-center justify-between border-b border-gray-100 px-5 py-3",
                meta.bg,
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("h-4 w-4", meta.accent)} />
                <div>
                  <h3 className="text-[13px] font-semibold text-gray-900">{meta.label}</h3>
                  <p className="text-[11px] text-gray-600">{meta.description}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAdding(team)}>
                <Plus className="h-3.5 w-3.5" />
                Add member(s)
              </Button>
            </div>

            {rows.length === 0 ? (
              <div className="px-5 py-6 text-center text-[12px] text-gray-400 italic">
                No {meta.label.toLowerCase()} members yet.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <MemberRow
                    key={r.id}
                    dealId={dealId}
                    member={r}
                    onEdit={() =>
                      setEditing({
                        memberId: r.id,
                        team: r.team,
                        roleLabel: r.roleLabel,
                        notes: r.notes,
                        // Identity fields only meaningful for free-text edits.
                        // The modal renders them read-only for FK rows.
                        name: r.name,
                        email: r.email,
                        phone: r.phone,
                        source: r.source,
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <TeamAddModal
        open={adding !== null}
        onOpenChange={(o) => {
          if (!o) setAdding(null);
        }}
        dealId={dealId}
        team={adding ?? "owner"}
        brokerUserOptions={brokerUserOptions}
        buyerContactOptions={buyerContactOptions}
      />
      <TeamEditModal
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        dealId={dealId}
        member={editing}
      />
    </div>
  );
}

type MemberRowProps = {
  dealId: string;
  member: DealTeamMemberRow;
  onEdit: () => void;
};

function MemberRow({ dealId, member, onEdit }: MemberRowProps) {
  // Optimistic local state on the bell toggle so the icon flips
  // immediately on click and the server action confirms in the
  // background. Mirrors the per-contact ReceivesCommunicationToggle
  // pattern on the contacts tab.
  const [optimisticIncluded, setOptimisticIncluded] = useState(
    member.includeInEmails,
  );
  const [includePending, startInclude] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const confirm = useConfirm();

  function toggleInclude() {
    const next = !optimisticIncluded;
    setOptimisticIncluded(next);
    startInclude(async () => {
      try {
        await setDealTeamMemberIncluded({
          memberId: member.id,
          dealId,
          included: next,
        });
      } catch (err) {
        console.error("[deal-team] include toggle failed", err);
        setOptimisticIncluded(!next);
      }
    });
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description:
        "Removes this person from the Deal Team Roster on this deal. Doesn't affect any other deal or the underlying user/contact record.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await removeDealTeamMember({ memberId: member.id, dealId });
    });
  }

  // Source badge: tiny icon + tooltip explaining where this row's
  // identity comes from. Helps users understand which rows are "linked"
  // (and would update if the canonical record changes) vs "free-text"
  // (snapshot only).
  const sourceMeta =
    member.source.kind === "user"
      ? {
          label: "Org user",
          tip: "Linked to a Lakebridge org user. Name and email come from the user record.",
          icon: UserRound,
          color: "text-blue-600",
        }
      : member.source.kind === "contact"
        ? {
            label: member.source.builderName
              ? `Contact · ${member.source.builderName}`
              : "Contact",
            tip: "Linked to a contacts directory entry. Name, email, and phone come from the contact record.",
            icon: Building2,
            color: "text-green-600",
          }
        : {
            label: "Free-text",
            tip: "No canonical link. Edit the row to update name, email, or phone.",
            icon: Pencil,
            color: "text-gray-400",
          };
  const SourceIcon = sourceMeta.icon;

  return (
    <li className="group flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50">
      {/* Bell toggle. Matches the per-contact ReceivesCommunicationToggle
          on the contacts tab — gray bell when included (low-key, the
          default), prominent "no email" pill when excluded so the
          exclusion is visible at a glance. */}
      {optimisticIncluded ? (
        <button
          type="button"
          onClick={toggleInclude}
          title="Included in Deal Team email sends. Click to exclude."
          aria-pressed={true}
          aria-label="Exclude from Deal Team emails"
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800",
            includePending && "opacity-60",
          )}
        >
          {includePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleInclude}
          title="Excluded from Deal Team email sends. Click to include."
          aria-pressed={false}
          aria-label="Include in Deal Team emails"
          className={cn(
            "inline-flex flex-shrink-0 items-center gap-0.5 rounded bg-gray-200 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-gray-600 uppercase transition-colors hover:bg-amber-100 hover:text-amber-800",
            includePending && "opacity-60",
          )}
        >
          {includePending ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <BellOff className="h-2.5 w-2.5" />
          )}
          no email
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-gray-900">{member.name}</span>
          <span className="text-[11px] text-gray-500">{member.roleLabel}</span>
          <span
            title={sourceMeta.tip}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium tracking-wide",
              sourceMeta.color,
            )}
          >
            <SourceIcon className="h-3 w-3" />
            {sourceMeta.label}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="hover:text-brand-blue inline-flex items-center gap-1"
            >
              <Mail className="h-3 w-3" />
              {member.email}
            </a>
          )}
          {member.phone && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Phone className="h-3 w-3" />
              {formatPhone(member.phone)}
            </span>
          )}
          {member.notes && <span className="italic">{member.notes}</span>}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deletePending}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Remove"
        >
          {deletePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </li>
  );
}
