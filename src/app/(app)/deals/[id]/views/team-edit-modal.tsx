"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Loader2, UserRound } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

import { updateDealTeamMember } from "../actions";

import { ROLE_OPTIONS } from "./team-add-modal";

type Team = "owner" | "broker" | "buyer";

type EditingSource =
  | { kind: "user"; userId: string }
  | { kind: "contact"; contactId: string; builderName: string | null }
  | { kind: "freetext" };

export type EditingMember = {
  memberId: string;
  team: Team;
  roleLabel: string;
  notes: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: EditingSource;
};

type TeamEditModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  member: EditingMember | null;
};

const TEAM_LABELS: Record<Team, string> = {
  owner: "Owner Team",
  broker: "Broker Team",
  buyer: "Buyer Team",
};

// Single-member edit. Identity behavior depends on the row's source:
//   - FK rows (user / contact): identity is read-only; only role + notes
//     are editable. Swapping identity means remove + re-add.
//   - Free-text rows (owners): identity fields are fully editable.
//
// Role is a strict dropdown driven by ROLE_OPTIONS from the add modal.
// Adding new roles = appending to that constant.
export function TeamEditModal({
  open,
  onOpenChange,
  dealId,
  member,
}: TeamEditModalProps) {
  const [roleLabel, setRoleLabel] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !member) return;
    setRoleLabel(member.roleLabel);
    setNotes(member.notes ?? "");
    setName(member.name);
    setEmail(member.email ?? "");
    setPhone(member.phone ?? "");
  }, [open, member]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!member) return null;

  const isFreeText = member.source.kind === "freetext";
  const submitDisabled =
    pending || !roleLabel.trim() || (isFreeText && !name.trim());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    if (submitDisabled) return;
    startTransition(async () => {
      await updateDealTeamMember({
        memberId: member.memberId,
        dealId,
        roleLabel,
        notes: notes || null,
        name: isFreeText ? name : undefined,
        email: isFreeText ? email || null : undefined,
        phone: isFreeText ? phone || null : undefined,
      });
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {TEAM_LABELS[member.team]} member</DialogTitle>
          <DialogDescription>
            {isFreeText
              ? "Free-text member. Update identity, role, or notes."
              : "Linked to a canonical record. Identity is read-only; update the linked record itself if it changes."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          {isFreeText ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="team-edit-name">Name</Label>
                <Input
                  id="team-edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="team-edit-email">Email</Label>
                  <Input
                    id="team-edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="team-edit-phone">Phone</Label>
                  <Input
                    id="team-edit-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            <SourceReadOnlyBlock member={member} />
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="team-edit-role">Role</Label>
            <Select
              value={roleLabel}
              onValueChange={(v) => v && setRoleLabel(v)}
            >
              <SelectTrigger id="team-edit-role">
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS[member.team].map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
                {/* The row's current role might not be in the canonical
                    list (e.g. if it predates a list trim). Render it
                    as a kept option so saving doesn't silently change
                    the value. */}
                {!ROLE_OPTIONS[member.team].includes(roleLabel) && roleLabel && (
                  <SelectItem value={roleLabel}>{roleLabel} (legacy)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="team-edit-notes">Notes</Label>
            <Textarea
              id="team-edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[60px]"
            />
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
            <Button type="submit" disabled={submitDisabled}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SourceReadOnlyBlock({ member }: { member: EditingMember }) {
  const Icon = member.source.kind === "user" ? UserRound : Building2;
  const caption =
    member.source.kind === "user"
      ? "From the linked org user. Update there to change name/email."
      : "From the linked contacts directory entry. Update there to change.";
  return (
    <>
      <div className="grid gap-1.5">
        <Label className="text-gray-500" htmlFor="team-edit-name-readonly">
          Name
        </Label>
        <div className="relative">
          <Icon className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            id="team-edit-name-readonly"
            value={member.name}
            disabled
            readOnly
            className="pl-8"
          />
        </div>
        <p className="text-[10px] text-gray-500 italic">{caption}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-gray-500" htmlFor="team-edit-email-readonly">
            Email
          </Label>
          <Input
            id="team-edit-email-readonly"
            value={member.email ?? ""}
            disabled
            readOnly
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-gray-500" htmlFor="team-edit-phone-readonly">
            Phone
          </Label>
          <Input
            id="team-edit-phone-readonly"
            value={member.phone ?? ""}
            disabled
            readOnly
          />
        </div>
      </div>
    </>
  );
}
