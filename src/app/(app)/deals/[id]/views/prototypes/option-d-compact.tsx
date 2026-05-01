"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { PlannedAction } from "@/components/planned-action";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { deleteContact } from "../../actions";
import { AddContactModal, type EditingContact } from "../add-contact-modal";
import { BuyerCheckbox } from "../buyer-checkbox";
import { LeadPicker, type LeadOption } from "../lead-picker";
import { TierBadge } from "../tier-badge";

import { AddBuyerModal } from "./add-buyer-modal";
import type { BuyerGroup, Tier } from "./load-buyers";

type FilterValue = Tier | "all";

const FILTER_META: Record<
  FilterValue,
  { label: string; chip: string; dot: string | null }
> = {
  all: { label: "All", chip: "border-brand-ink bg-brand-ink text-white", dot: null },
  green: {
    label: "Interested",
    chip: "bg-green-100 text-green-800 border-green-300",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Immediate Pass",
    chip: "bg-red-100 text-red-800 border-red-300",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    dot: "bg-gray-400",
  },
};

const TIER_DOT: Record<Tier, string> = {
  green: "bg-tier-green",
  yellow: "bg-tier-yellow",
  red: "bg-tier-red",
  not_selected: "bg-gray-300",
};

const FILTERS: FilterValue[] = ["all", "green", "yellow", "red", "not_selected"];

type OptionDCompactProps = {
  dealId: string;
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
};

export function OptionDCompact({ dealId, groups, leadOptions }: OptionDCompactProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [addContactFor, setAddContactFor] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  const visibleGroups = useMemo(() => {
    if (filter === "all") return groups;
    return groups.filter((g) => g.tier === filter);
  }, [groups, filter]);

  const tierCounts = useMemo(() => {
    const counts: Record<FilterValue, number> = {
      all: groups.length,
      green: 0,
      yellow: 0,
      red: 0,
      not_selected: 0,
    };
    for (const g of groups) counts[g.tier]++;
    return counts;
  }, [groups]);

  const builderOptions = useMemo(
    () => groups.map((g) => ({ id: g.builderId, name: g.builderName })),
    [groups],
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteContact(contactId: string, name: string) {
    const ok = await confirm({
      title: "Delete contact?",
      description: `${name} will be removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteContact({ dealId, contactId });
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((value) => {
          const isActive = value === filter;
          const meta = FILTER_META[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                isActive
                  ? meta.chip
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
              )}
            >
              {meta.dot && <span className={cn("h-2 w-2 rounded-full", meta.dot)} />}
              {meta.label}
              <span className="text-[10px] tabular-nums opacity-70">({tierCounts[value]})</span>
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap gap-2">
          <PlannedAction
            label="Send OM blast"
            icon={Mail}
            feature="OM blast email"
            description="Composes templated OM-distribution emails per buyer tier (Green / Yellow), opens a review screen, then sends via Resend."
            phase="phase_2"
          />
          <PlannedAction
            label="Send follow-up"
            icon={Mail}
            feature="Follow-up to non-responders"
            description="Drafts a templated follow-up email to Green/Yellow buyers who have OM Sent but no offer received yet."
            phase="phase_2"
          />
          <PlannedAction
            label="Import from Excel"
            icon={Download}
            feature="Excel buyer import"
            description="Upload a marketing list (.xlsx) and map columns to builders + contacts. Skips duplicates, suggests tier from prior deals."
            phase="phase_2"
          />
          <Button size="sm" onClick={() => setAddBuyerOpen(true)}>
            + Add Buyer
          </Button>
        </div>
      </div>

      <AddBuyerModal
        open={addBuyerOpen}
        onOpenChange={setAddBuyerOpen}
        dealId={dealId}
        existingBuilderNames={groups.map((g) => g.builderName)}
      />
      <AddContactModal
        open={addContactFor !== null}
        onOpenChange={(open) => {
          if (!open) setAddContactFor(null);
        }}
        dealId={dealId}
        builders={builderOptions}
        defaultBuilderId={addContactFor?.id}
      />
      <AddContactModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        dealId={dealId}
        builders={builderOptions}
        editing={editing ?? undefined}
      />

      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-sm text-gray-500">
            {groups.length === 0 ? "No buyers on this deal yet." : "No buyers in this tier."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {visibleGroups.map((g, idx) => {
            const isOpen = expanded.has(g.dealBuyerId);
            return (
              <div
                key={g.dealBuyerId}
                className={cn(idx > 0 && "border-t border-gray-100")}
              >
                {/* Single dense row, height ~36px. Click anywhere to expand. */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(g.dealBuyerId)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  )}
                  <span
                    className={cn(
                      "h-2 w-2 flex-shrink-0 rounded-full",
                      TIER_DOT[g.tier],
                    )}
                  />
                  <span className="text-[13px] font-medium text-gray-900">
                    {g.builderName}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-px text-[9px] tracking-wider text-gray-500 uppercase">
                    {g.classification}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {g.contacts.length === 0
                      ? "no contacts"
                      : `${g.contacts.length} contact${g.contacts.length === 1 ? "" : "s"}`}
                  </span>

                  <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
                    {g.leadName && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5">
                        {g.leadName.split(" ")[0]}
                      </span>
                    )}
                    {g.called && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                        Called
                      </span>
                    )}
                    {g.omSent && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                        OM
                      </span>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-3 pl-9">
                    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Tier:</span>
                        <TierBadge
                          dealBuyerId={g.dealBuyerId}
                          dealId={dealId}
                          tier={g.tier}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Lead:</span>
                        <LeadPicker
                          dealId={dealId}
                          dealBuyerId={g.dealBuyerId}
                          currentUserId={g.leadUserId}
                          currentName={g.leadName}
                          options={leadOptions}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BuyerCheckbox
                          dealBuyerId={g.dealBuyerId}
                          dealId={dealId}
                          field="called"
                          checked={g.called}
                        />
                        <span className="text-gray-600">Called</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BuyerCheckbox
                          dealBuyerId={g.dealBuyerId}
                          dealId={dealId}
                          field="omSent"
                          checked={g.omSent}
                        />
                        <span className="text-gray-600">OM Sent</span>
                      </div>
                    </div>

                    {g.comments && (
                      <div className="mb-3 rounded border border-gray-200 bg-white px-3 py-2 text-[12px] text-gray-700">
                        {g.comments}
                      </div>
                    )}

                    {g.contacts.length === 0 ? (
                      <div className="py-2 text-xs text-gray-400 italic">No contacts.</div>
                    ) : (
                      <div className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
                        {g.contacts.map((c) => (
                          <div
                            key={c.id}
                            className="group flex items-center gap-3 px-3 py-2"
                          >
                            <div className="flex-1">
                              <div className="text-[12px] font-medium text-gray-900">
                                {c.fullName}
                                {c.title && (
                                  <span className="ml-2 text-[11px] font-normal text-gray-500">
                                    {c.title}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-gray-600">
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="hover:text-brand-blue inline-flex items-center gap-1"
                                >
                                  <Mail className="h-3 w-3" />
                                  {c.email}
                                </a>
                              )}
                              {c.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {c.phone}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing({
                                    contactId: c.id,
                                    builderId: g.builderId,
                                    firstName: c.firstName,
                                    lastName: c.lastName,
                                    title: c.title,
                                    email: c.email,
                                    phone: c.phone,
                                    notes: c.notes,
                                  })
                                }
                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Edit"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteContact(c.id, c.fullName)}
                                className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setAddContactFor({ id: g.builderId, name: g.builderName })
                      }
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800"
                    >
                      <Plus className="h-3 w-3" />
                      Add contact
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
