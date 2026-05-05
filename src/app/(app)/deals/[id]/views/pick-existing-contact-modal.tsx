"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, Loader2, Search } from "lucide-react";

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

import { addBuilderToDeal, attachBuilderToDeal } from "../actions";
import { updateContact } from "@/app/(app)/contacts/actions";

export type ExistingContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  title: string | null;
  geography: string | null;
  builderId: string | null;
  builderName: string | null;
};

export type DealBuilderOption = {
  id: string;
  name: string;
};

type PickExistingContactModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  // Builders currently on the deal — these are the assignment targets,
  // alongside an inline "+ Create new builder" option.
  dealBuilders: DealBuilderOption[];
  // All contacts in the org. The modal filters out anyone already at one of
  // the deal's builders since they already show up in the table.
  contacts: ExistingContactOption[];
};

// Sentinel for the "+ Create new builder" option in the target picker. Picking
// it reveals an inline name + classification input and routes the submit
// through addBuilderToDeal first (creates builder + deal_buyer), then
// updateContact (re-points the picked contact at the new builder).
const NEW_BUILDER = "__new__";

export function PickExistingContactModal({
  open,
  onOpenChange,
  dealId,
  dealBuilders,
  contacts,
}: PickExistingContactModalProps) {
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [targetBuilderChoice, setTargetBuilderChoice] = useState<string>("");
  const [newBuilderName, setNewBuilderName] = useState("");
  const [newBuilderClassification, setNewBuilderClassification] = useState<
    "private" | "public"
  >("private");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setSearch("");
        setSelectedContactId(null);
        setTargetBuilderChoice("");
        setNewBuilderName("");
        setNewBuilderClassification("private");
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Hide contacts already attached to one of the deal's builders — they're
  // already on the deal. Surfacing them again would be confusing.
  const dealBuilderIds = useMemo(
    () => new Set(dealBuilders.map((b) => b.id)),
    [dealBuilders],
  );

  const candidates = useMemo(() => {
    return contacts.filter((c) => !c.builderId || !dealBuilderIds.has(c.builderId));
  }, [contacts, dealBuilderIds]);

  const visibleCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.builderName?.toLowerCase().includes(q) ?? false) ||
        (c.title?.toLowerCase().includes(q) ?? false),
    );
  }, [candidates, search]);

  const selected = useMemo(
    () => candidates.find((c) => c.id === selectedContactId) ?? null,
    [candidates, selectedContactId],
  );

  const isNewBuilder = targetBuilderChoice === NEW_BUILDER;

  function handleSelect(contact: ExistingContactOption) {
    setSelectedContactId(contact.id);
    // Picker is only relevant for standalone contacts. For contacts who
    // already have a builder, we silently bring that builder along — no
    // need to ask. Default-fill the picker for standalone contacts so the
    // common "use the first deal-builder" case is one click.
    setTargetBuilderChoice(contact.builderId ? "" : (dealBuilders[0]?.id ?? NEW_BUILDER));
    setError(null);
  }

  function handleSubmit() {
    if (!selected) return;

    const contactHasBuilder = Boolean(selected.builderId);
    if (!contactHasBuilder) {
      if (!targetBuilderChoice) {
        setError("Pick a builder or create a new one.");
        return;
      }
      if (isNewBuilder && !newBuilderName.trim()) {
        setError("Enter a name for the new builder.");
        return;
      }
    }

    startTransition(async () => {
      try {
        if (contactHasBuilder) {
          // Contact's builder isn't yet on this deal (the candidate filter
          // already excluded contacts whose builder IS on the deal). Just
          // attach their existing builder — idempotent action, safe to call.
          await attachBuilderToDeal({ dealId, builderId: selected.builderId! });
          // No updateContact needed — they're already at the right builder.
        } else {
          let builderId: string;
          if (isNewBuilder) {
            // Bootstrap the new builder + attach it to the deal first, then
            // re-point the standalone contact at it.
            const result = await addBuilderToDeal({
              dealId,
              name: newBuilderName,
              classification: newBuilderClassification,
              tier: "not_selected",
            });
            builderId = result.builderId;
          } else {
            builderId = targetBuilderChoice;
          }

          await updateContact({
            contactId: selected.id,
            data: {
              firstName: selected.firstName,
              lastName: selected.lastName,
              title: selected.title ?? undefined,
              email: selected.email ?? undefined,
              geography: selected.geography ?? undefined,
              builderId,
            },
          });
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add contact to deal.");
      }
    });
  }

  const targetLabel = (() => {
    if (targetBuilderChoice === NEW_BUILDER) return "+ Create new builder";
    return dealBuilders.find((b) => b.id === targetBuilderChoice)?.name ?? "Pick a builder";
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Existing Contact</DialogTitle>
          <DialogDescription>
            Pick a contact from the org directory and assign them to a builder on this deal.
            They&rsquo;ll appear in the deal&rsquo;s Contacts list immediately.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            No org contacts available to add. Everyone is either already on this deal or there
            aren&rsquo;t any standalone contacts yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, builder, title…"
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-gray-200">
              {visibleCandidates.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  No matches.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleCandidates.map((c) => {
                    const isSelected = c.id === selectedContactId;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => handleSelect(c)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors",
                            isSelected ? "bg-blue-50" : "hover:bg-gray-50",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-gray-900">
                              {c.fullName}
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-gray-500">
                              {c.builderName ? (
                                <span className="inline-flex items-center gap-1">
                                  <Building2 className="h-3 w-3 flex-shrink-0" />
                                  {c.builderName}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                              {c.title && <span>· {c.title}</span>}
                              {c.email && <span>· {c.email}</span>}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selected && selected.builderId && selected.builderName ? (
              // Contact already has a builder. We bring that builder onto
              // the deal automatically — no picker needed. Just confirm what
              // will happen so it's not invisible.
              <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3 text-[13px]">
                <div className="font-medium text-gray-900">
                  Add {selected.fullName} to this deal
                </div>
                <div className="text-gray-600">
                  via{" "}
                  <span className="inline-flex items-center gap-1 font-medium text-gray-800">
                    <Building2 className="h-3 w-3 flex-shrink-0" />
                    {selected.builderName}
                  </span>
                  {!dealBuilderIds.has(selected.builderId) && (
                    <span className="text-gray-500">
                      {" "}
                      ({selected.builderName} will be added to the deal too)
                    </span>
                  )}
                </div>
              </div>
            ) : selected ? (
              // Standalone contact — needs a builder assignment to surface
              // on the deal. Pick existing or create new.
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3">
                <Label htmlFor="target-builder">
                  {selected.fullName} has no builder yet. Pick or create one for this deal.
                </Label>
                <Select
                  value={targetBuilderChoice}
                  onValueChange={(v) => v && setTargetBuilderChoice(v)}
                >
                  <SelectTrigger id="target-builder" className="w-full bg-white">
                    <SelectValue>{targetLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_BUILDER}>+ Create new builder</SelectItem>
                    {dealBuilders.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {isNewBuilder && (
                  <div className="space-y-2 rounded-md border border-blue-200 bg-white p-3">
                    <Input
                      value={newBuilderName}
                      onChange={(e) => setNewBuilderName(e.target.value)}
                      placeholder="New builder name (e.g. Lennar)"
                    />
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium text-gray-700">
                        Classification
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["private", "public"] as const).map((value) => {
                          const isActive = value === newBuilderClassification;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setNewBuilderClassification(value)}
                              className={cn(
                                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                                isActive
                                  ? "border-brand-blue bg-brand-blue text-white"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                              )}
                            >
                              {value === "private" ? "Private" : "Public"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={(() => {
              if (isPending || !selected) return true;
              // Contacts who already have a builder can submit immediately —
              // no picker. Standalone contacts need a target picked.
              if (selected.builderId) return false;
              if (!targetBuilderChoice) return true;
              if (isNewBuilder && !newBuilderName.trim()) return true;
              return false;
            })()}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add to Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
