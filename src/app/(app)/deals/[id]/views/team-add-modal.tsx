"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Briefcase,
  Building2,
  ChevronDown,
  Loader2,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  addDealTeamMembers,
  type TeamPickerContact,
  type TeamPickerUser,
} from "../actions";

type Team = "owner" | "broker" | "buyer";

// Excel-derived role lists per team. Extend by adding entries here, no
// schema change needed (the `role_label` column is text). Edit lands a
// quick follow-up in the dropdown — no free-text fallback so reporting
// stays uniform.
export const ROLE_OPTIONS: Record<Team, string[]> = {
  owner: ["Owner"],
  broker: ["Cobroker", "Marketing Coordinator", "Analyst"],
  buyer: ["Buyer"],
};

// Returns the auto-pickable role for a team whose role list has only one
// entry (Owner Team, Buyer Team today). Multi-option teams (Broker)
// return null and the user picks from the dropdown.
function singletonRoleFor(team: Team): string | null {
  return ROLE_OPTIONS[team].length === 1 ? ROLE_OPTIONS[team][0] : null;
}

const TEAM_LABELS: Record<Team, string> = {
  owner: "Owner Team",
  broker: "Broker Team",
  buyer: "Buyer Team",
};

// One staging row. `identity` is either a linked user/contact (Broker /
// Buyer flow) or free-text fields (Owner flow). `roleLabel` starts null
// and the user picks it from the strict dropdown before saving.
type StagingRow =
  | {
      key: string;
      kind: "user";
      user: TeamPickerUser;
      roleLabel: string | null;
    }
  | {
      key: string;
      kind: "contact";
      contact: TeamPickerContact;
      roleLabel: string | null;
    }
  | {
      key: string;
      kind: "freetext";
      name: string;
      email: string;
      phone: string;
      roleLabel: string | null;
    };

type TeamAddModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  team: Team;
  brokerUserOptions: TeamPickerUser[];
  buyerContactOptions: TeamPickerContact[];
};

function freshOwnerRow(): Extract<StagingRow, { kind: "freetext" }> {
  return {
    key: crypto.randomUUID(),
    kind: "freetext",
    name: "",
    email: "",
    phone: "",
    roleLabel: singletonRoleFor("owner"),
  };
}

export function TeamAddModal({
  open,
  onOpenChange,
  dealId,
  team,
  brokerUserOptions,
  buyerContactOptions,
}: TeamAddModalProps) {
  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [pending, startTransition] = useTransition();

  // Reset staging each time the modal opens. For Owner team, seed with
  // one empty row so the user has somewhere to type immediately.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setStaging(team === "owner" ? [freshOwnerRow()] : []);
  }, [open, team]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function addUser(u: TeamPickerUser) {
    // Dedupe: clicking the same user twice is a no-op.
    if (staging.some((r) => r.kind === "user" && r.user.id === u.id)) return;
    setStaging((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        kind: "user",
        user: u,
        roleLabel: singletonRoleFor(team),
      },
    ]);
  }
  function addContact(c: TeamPickerContact) {
    if (staging.some((r) => r.kind === "contact" && r.contact.id === c.id)) return;
    setStaging((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        kind: "contact",
        contact: c,
        roleLabel: singletonRoleFor(team),
      },
    ]);
  }
  function addOwnerRow() {
    setStaging((prev) => [...prev, freshOwnerRow()]);
  }
  function updateRow(key: string, patch: Partial<StagingRow>) {
    setStaging((prev) =>
      prev.map((r) => (r.key === key ? ({ ...r, ...patch } as StagingRow) : r)),
    );
  }
  function removeRow(key: string) {
    setStaging((prev) => prev.filter((r) => r.key !== key));
  }

  // Validation summary: each row needs a role; free-text rows also need
  // a name. Used to enable the Save button + show inline highlights.
  const rolesValid = staging.every((r) => Boolean(r.roleLabel));
  const freeTextNamesValid = staging.every(
    (r) => r.kind !== "freetext" || r.name.trim().length > 0,
  );
  const canSubmit =
    staging.length > 0 && rolesValid && freeTextNamesValid && !pending;

  async function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const members = staging.map((r) => {
        const roleLabel = r.roleLabel!;
        if (r.kind === "user") {
          return {
            team,
            roleLabel,
            source: "user" as const,
            userId: r.user.id,
          };
        }
        if (r.kind === "contact") {
          return {
            team,
            roleLabel,
            source: "contact" as const,
            contactId: r.contact.id,
          };
        }
        return {
          team,
          roleLabel,
          source: "freetext" as const,
          name: r.name,
          email: r.email || null,
          phone: r.phone || null,
        };
      });
      await addDealTeamMembers({ dealId, members });
      onOpenChange(false);
    });
  }

  const description =
    team === "owner" ? (
      <>
        Add one or more owners. Sellers and principals don&apos;t live in another
        table yet, so identity stays free-text here.
      </>
    ) : team === "broker" ? (
      <>
        Pick from users to stage members. Outside cobrokers should be added as
        a user via Admin → Members first; granting login can come later.
      </>
    ) : (
      <>
        Pick from contacts already on this deal to stage members. Add buyers
        from the Contacts tab first if they&apos;re not there yet.
      </>
    );

  const submitLabel =
    staging.length === 0
      ? "Add members"
      : `Add ${staging.length} member${staging.length === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add to {TEAM_LABELS[team]}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {team !== "owner" && (
          <CanonicalPicker
            team={team}
            users={team === "broker" ? brokerUserOptions : []}
            contacts={team === "broker" ? [] : buyerContactOptions}
            stagedUserIds={new Set(
              staging.filter((r) => r.kind === "user").map((r) => (r as Extract<StagingRow, { kind: "user" }>).user.id),
            )}
            stagedContactIds={new Set(
              staging.filter((r) => r.kind === "contact").map((r) => (r as Extract<StagingRow, { kind: "contact" }>).contact.id),
            )}
            onPickUser={addUser}
            onPickContact={addContact}
          />
        )}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
              Staged ({staging.length})
            </Label>
            {!rolesValid && staging.length > 0 && singletonRoleFor(team) === null && (
              <span className="text-[10px] text-amber-700">
                Pick a role for every staged member
              </span>
            )}
          </div>

          {staging.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 px-4 py-6 text-center text-[12px] text-gray-400 italic">
              {team === "owner"
                ? "No owners staged. Add one below."
                : "Nothing staged yet. Pick from above to start building the team."}
            </div>
          ) : (
            <ul className="space-y-2">
              {staging.map((row) => (
                <StagingRowCard
                  key={row.key}
                  row={row}
                  team={team}
                  onUpdate={(patch) => updateRow(row.key, patch)}
                  onRemove={() => removeRow(row.key)}
                />
              ))}
            </ul>
          )}

          {team === "owner" && (
            <button
              type="button"
              onClick={addOwnerRow}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-700 hover:text-blue-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Add another owner
            </button>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StagingRowCardProps = {
  row: StagingRow;
  team: Team;
  onUpdate: (patch: Partial<StagingRow>) => void;
  onRemove: () => void;
};

function StagingRowCard({ row, team, onUpdate, onRemove }: StagingRowCardProps) {
  const roleNeeded = row.roleLabel === null;
  // Hide the role dropdown when there's only one possible role; the
  // role is auto-set at stage time and shown as a small static chip.
  const singletonRole = singletonRoleFor(team);
  const Icon =
    row.kind === "user"
      ? UserRound
      : row.kind === "contact"
        ? Building2
        : Briefcase;

  // Single-line layout. The amber border on the card carries the
  // "needs role" cue so the dropdown itself stays visually identical
  // before and after a role is picked.
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md border bg-white px-2 py-1.5 transition-colors",
        roleNeeded ? "border-amber-300 bg-amber-50/40" : "border-gray-200",
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />

      {row.kind === "user" && (
        <div className="min-w-0 flex-1 truncate">
          <span className="text-[12px] font-medium text-gray-900">{row.user.name}</span>
          <span className="ml-1.5 text-[11px] text-gray-500">{row.user.email}</span>
          {row.user.phone && (
            <span className="ml-1.5 text-[11px] text-gray-500">· {row.user.phone}</span>
          )}
        </div>
      )}

      {row.kind === "contact" && (
        <div className="min-w-0 flex-1" title={row.contact.email ?? undefined}>
          <span className="text-[12px] font-medium text-gray-900">
            {row.contact.fullName}
          </span>
          {row.contact.builderName && (
            <span className="ml-1.5 text-[11px] text-gray-500">
              · {row.contact.builderName}
            </span>
          )}
        </div>
      )}

      {row.kind === "freetext" && (
        <>
          <Input
            value={row.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            required
            placeholder="Name"
            className="h-8 min-w-0 flex-1 text-[12px]"
            aria-label="Name"
          />
          <Input
            type="email"
            value={row.email}
            onChange={(e) => onUpdate({ email: e.target.value })}
            placeholder="Email"
            className="h-8 w-44 min-w-0 text-[12px]"
            aria-label="Email"
          />
          <Input
            type="tel"
            value={row.phone}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            placeholder="Phone"
            className="h-8 w-32 min-w-0 text-[12px]"
            aria-label="Phone"
          />
        </>
      )}

      {singletonRole ? (
        // Single-role team: render the role as a static chip. No
        // dropdown UX needed since there's nothing to pick.
        <span className="inline-flex flex-shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
          {singletonRole}
        </span>
      ) : (
        <Select
          // Pass `null` (Base UI's "no selection" sentinel) instead of
          // `undefined` so the Select is controlled from the first
          // render. Switching from undefined to a string later triggers
          // Base UI's "uncontrolled to controlled" warning.
          value={row.roleLabel ?? null}
          onValueChange={(v) => v && onUpdate({ roleLabel: v })}
        >
          <SelectTrigger
            aria-label="Role"
            // `data-placeholder:text-foreground` keeps the unset
            // placeholder text in the same color as a picked value, so
            // the only visual difference between "needs role" and
            // "role set" is the card-level amber tint, not the text
            // weight.
            className="h-8 w-36 flex-shrink-0 text-[12px] data-placeholder:text-foreground"
          >
            <SelectValue placeholder="Pick role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS[team].map((r) => (
              <SelectItem key={r} value={r} className="text-[12px]">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
        title="Remove from staging"
        aria-label="Remove from staging"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

type CanonicalPickerProps = {
  team: "broker" | "buyer";
  users: TeamPickerUser[];
  contacts: TeamPickerContact[];
  stagedUserIds: Set<string>;
  stagedContactIds: Set<string>;
  onPickUser: (u: TeamPickerUser) => void;
  onPickContact: (c: TeamPickerContact) => void;
};

function CanonicalPicker({
  team,
  users,
  contacts,
  stagedUserIds,
  stagedContactIds,
  onPickUser,
  onPickContact,
}: CanonicalPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Open on click / typing only, never on focus alone (Dialog auto-
  // focuses on mount and would otherwise pop the dropdown open).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filteredUsers = q
      ? users.filter(
          (u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        )
      : users;
    const filteredContacts = q
      ? contacts.filter(
          (c) =>
            c.fullName.toLowerCase().includes(q) ||
            (c.email?.toLowerCase().includes(q) ?? false) ||
            (c.builderName?.toLowerCase().includes(q) ?? false),
        )
      : contacts;
    return { users: filteredUsers, contacts: filteredContacts };
  }, [query, users, contacts]);

  const placeholder =
    team === "broker"
      ? "Search users…"
      : "Search contacts on this deal…";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-8"
        />
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      </div>

      {open && (
        <div className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.users.length === 0 && filtered.contacts.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-gray-400 italic">
              No matches.{" "}
              {team === "broker"
                ? "Add the person as a user via Admin → Members first."
                : "Add them to the deal from the Contacts tab first."}
            </div>
          ) : (
            <>
              {filtered.users.length > 0 && (
                <div className="bg-gray-50 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                  <Briefcase className="mr-1 inline h-3 w-3" />
                  Org users
                </div>
              )}
              {filtered.users.map((u) => {
                const alreadyStaged = stagedUserIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={alreadyStaged}
                    onClick={() => {
                      onPickUser(u);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px]",
                      alreadyStaged
                        ? "cursor-default bg-gray-50 opacity-50"
                        : "hover:bg-blue-50",
                    )}
                  >
                    <UserRound className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="truncate text-[11px] text-gray-500">{u.email}</div>
                    </div>
                    {alreadyStaged && (
                      <span className="text-[10px] tracking-wide text-gray-400 uppercase">
                        staged
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.contacts.length > 0 && (
                <div className="bg-gray-50 px-3 py-1 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
                  <Building2 className="mr-1 inline h-3 w-3" />
                  Contacts
                </div>
              )}
              {filtered.contacts.map((c) => {
                const alreadyStaged = stagedContactIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={alreadyStaged}
                    onClick={() => {
                      onPickContact(c);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px]",
                      alreadyStaged
                        ? "cursor-default bg-gray-50 opacity-50"
                        : "hover:bg-blue-50",
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-gray-900">{c.fullName}</span>
                        {c.builderName && (
                          <span className="text-[11px] text-gray-500">
                            · {c.builderName}
                          </span>
                        )}
                      </div>
                      {c.email && (
                        <div className="truncate text-[11px] text-gray-500">
                          {c.email}
                        </div>
                      )}
                    </div>
                    {alreadyStaged && (
                      <span className="text-[10px] tracking-wide text-gray-400 uppercase">
                        staged
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
