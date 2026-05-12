"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

import { bulkAddContactsToDeal, type BulkStandaloneTarget } from "../actions";

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
  // Builders currently on the deal — these are the assignment targets for
  // standalone contacts, alongside an inline "+ Create new builder" option.
  dealBuilders: DealBuilderOption[];
  // All contacts in the org. The modal filters out anyone already at one of
  // the deal's builders since they already show up in the table.
  contacts: ExistingContactOption[];
};

// Sentinel for the "+ Create new builder" option in the standalone target
// picker. Picking it reveals an inline name + classification input.
const NEW_BUILDER = "__new__";

export function PickExistingContactModal({
  open,
  onOpenChange,
  dealId,
  dealBuilders,
  contacts,
}: PickExistingContactModalProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [standaloneTargetChoice, setStandaloneTargetChoice] = useState<string>("");
  const [newBuilderName, setNewBuilderName] = useState("");
  const [newBuilderClassification, setNewBuilderClassification] = useState<
    "private" | "public" | "developer"
  >("private");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset everything when the modal closes (with a small delay so users
  // don't see the form clear during the close animation).
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setSearch("");
        setSelectedIds(new Set());
        setStandaloneTargetChoice("");
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

  // Selection summary derived from the id set. Splitting into has-builder
  // vs standalone counts drives whether the standalone target picker shows.
  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );
  const standaloneCount = selected.filter((c) => !c.builderId).length;
  const withBuilderCount = selected.length - standaloneCount;
  const needsStandaloneTarget = standaloneCount > 0;
  const isNewBuilder = standaloneTargetChoice === NEW_BUILDER;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of visibleCandidates) next.add(c.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleSubmit() {
    if (selected.length === 0) return;
    setError(null);

    if (needsStandaloneTarget && !standaloneTargetChoice) {
      setError(`Pick a builder for the ${standaloneCount} standalone contact${standaloneCount === 1 ? "" : "s"}.`);
      return;
    }
    if (needsStandaloneTarget && isNewBuilder && !newBuilderName.trim()) {
      setError("Enter a name for the new builder.");
      return;
    }

    let standaloneTarget: BulkStandaloneTarget | undefined;
    if (needsStandaloneTarget) {
      standaloneTarget = isNewBuilder
        ? {
            type: "new",
            name: newBuilderName.trim(),
            classification: newBuilderClassification,
          }
        : { type: "existing", builderId: standaloneTargetChoice };
    }

    startTransition(async () => {
      try {
        await bulkAddContactsToDeal({
          dealId,
          contactIds: Array.from(selectedIds),
          standaloneTarget,
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add contacts to deal.");
      }
    });
  }

  const targetLabel = (() => {
    if (standaloneTargetChoice === NEW_BUILDER) return "+ Create new builder";
    return (
      dealBuilders.find((b) => b.id === standaloneTargetChoice)?.name ?? "Pick a builder"
    );
  })();

  // Visible-list "select all" affordance state.
  const allVisibleSelected =
    visibleCandidates.length > 0 &&
    visibleCandidates.every((c) => selectedIds.has(c.id));

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Existing Contacts</DialogTitle>
          <DialogDescription>
            Pick one or more contacts from the org directory. Each selected contact&rsquo;s
            builder gets attached to this deal automatically; standalone contacts need you to
            pick (or create) a builder for them below.
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

            {/* Selection toolbar — count + select-all/clear shortcuts.
                Always rendered so the layout doesn't jump when the first
                contact gets ticked. */}
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <div className="text-gray-500">
                {selected.length === 0 ? (
                  <span>None selected</span>
                ) : (
                  <span>
                    <span className="font-semibold text-gray-700">
                      {selected.length} selected
                    </span>
                    {selected.length > 0 && (
                      <span className="ml-1 text-gray-400">
                        ({withBuilderCount} with builder · {standaloneCount} standalone)
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {visibleCandidates.length > 0 && !allVisibleSelected && (
                  <button
                    type="button"
                    onClick={selectAllVisible}
                    className="text-brand-blue hover:underline"
                  >
                    Select all {search ? "matching" : ""} ({visibleCandidates.length})
                  </button>
                )}
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-gray-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-gray-200">
              {visibleCandidates.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">No matches.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visibleCandidates.map((c) => {
                    const isSelected = selectedIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          className={cn(
                            "flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors",
                            isSelected ? "bg-blue-50" : "hover:bg-gray-50",
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggle(c.id)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
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
                                <span className="text-amber-600">standalone</span>
                              )}
                              {c.title && <span>· {c.title}</span>}
                              {c.email && <span>· {c.email}</span>}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Standalone target picker — only renders when at least one
                selected contact is standalone. Single picker for the whole
                batch (per-row would be more flexible but slower; can revisit
                if Chris needs it). */}
            {needsStandaloneTarget && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3">
                <Label htmlFor="standalone-target">
                  {standaloneCount === 1
                    ? "1 standalone contact needs a builder"
                    : `${standaloneCount} standalone contacts need a builder`}
                </Label>
                <Select
                  value={standaloneTargetChoice}
                  onValueChange={(v) => v && setStandaloneTargetChoice(v)}
                >
                  <SelectTrigger id="standalone-target" className="w-full bg-white">
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
                  <div className="space-y-2 rounded-md border border-amber-200 bg-white p-3">
                    <Input
                      value={newBuilderName}
                      onChange={(e) => setNewBuilderName(e.target.value)}
                      placeholder="New builder name (e.g. Lennar)"
                    />
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium text-gray-700">
                        Classification
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["private", "public", "developer"] as const).map((value) => {
                          const isActive = value === newBuilderClassification;
                          const label =
                            value === "private"
                              ? "Private"
                              : value === "public"
                                ? "Public"
                                : "Developer";
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
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
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
              if (isPending || selected.length === 0) return true;
              if (needsStandaloneTarget && !standaloneTargetChoice) return true;
              if (needsStandaloneTarget && isNewBuilder && !newBuilderName.trim()) return true;
              return false;
            })()}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add {selected.length > 0 ? `${selected.length} ` : ""}to deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
