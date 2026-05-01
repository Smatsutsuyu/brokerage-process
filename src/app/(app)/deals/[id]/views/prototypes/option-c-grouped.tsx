"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Mail, Pencil, Phone, Trash2 } from "lucide-react";

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
  { label: string; chip: string; ribbon: string; dot: string | null }
> = {
  all: { label: "All", chip: "border-brand-ink bg-brand-ink text-white", ribbon: "", dot: null },
  green: {
    label: "Interested",
    chip: "bg-green-100 text-green-800 border-green-300",
    ribbon: "border-l-tier-green",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    ribbon: "border-l-tier-yellow",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Immediate Pass",
    chip: "bg-red-100 text-red-800 border-red-300",
    ribbon: "border-l-tier-red",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    ribbon: "border-l-gray-300",
    dot: "bg-gray-400",
  },
};

const FILTERS: FilterValue[] = ["all", "green", "yellow", "red", "not_selected"];

type OptionCGroupedProps = {
  dealId: string;
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
};

export function OptionCGrouped({ dealId, groups, leadOptions }: OptionCGroupedProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
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

  async function handleDeleteContact(contactId: string, name: string) {
    const ok = await confirm({
      title: "Delete contact?",
      description: `${name} will be removed. The builder stays on the deal.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await deleteContact({ dealId, contactId });
    });
  }

  return (
    <div className="space-y-4">
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
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
                <th className="px-4 py-2.5 text-left">Contact</th>
                <th className="px-4 py-2.5 text-left">Title</th>
                <th className="px-4 py-2.5 text-left">Email</th>
                <th className="px-4 py-2.5 text-left">Phone</th>
                <th className="w-[1%] px-4 py-2.5"></th>
              </tr>
            </thead>
            {visibleGroups.map((g) => {
              const meta = FILTER_META[g.tier];
              return (
                <tbody key={g.dealBuyerId}>
                    {/* Builder header row spanning all columns. Holds tier,
                        type, lead, called/OM toggles. Visually separates
                        builders so the same name doesn't repeat per contact. */}
                    <tr className={cn("border-l-[3px]", meta.ribbon)}>
                      <td colSpan={5} className="bg-gray-50/80 px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-[14px] font-semibold text-gray-900">
                            {g.builderName}
                          </span>
                          <span className="rounded bg-white px-1.5 py-0.5 text-[10px] tracking-wider text-gray-600 uppercase">
                            {g.classification}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {g.contacts.length} contact{g.contacts.length === 1 ? "" : "s"}
                          </span>
                          <div className="ml-auto flex items-center gap-3 text-xs">
                            <TierBadge
                              dealBuyerId={g.dealBuyerId}
                              dealId={dealId}
                              tier={g.tier}
                            />
                            <span className="flex items-center gap-1.5 text-gray-500">
                              Lead:
                              <LeadPicker
                                dealId={dealId}
                                dealBuyerId={g.dealBuyerId}
                                currentUserId={g.leadUserId}
                                currentName={g.leadName}
                                options={leadOptions}
                              />
                            </span>
                            <span className="flex items-center gap-1.5">
                              <BuyerCheckbox
                                dealBuyerId={g.dealBuyerId}
                                dealId={dealId}
                                field="called"
                                checked={g.called}
                              />
                              <span className="text-gray-600">Called</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <BuyerCheckbox
                                dealBuyerId={g.dealBuyerId}
                                dealId={dealId}
                                field="omSent"
                                checked={g.omSent}
                              />
                              <span className="text-gray-600">OM</span>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {g.contacts.length === 0 ? (
                      <tr className="border-b border-gray-100">
                        <td colSpan={5} className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setAddContactFor({ id: g.builderId, name: g.builderName })
                            }
                            className="text-xs text-gray-400 italic hover:text-gray-700"
                          >
                            No contacts yet — click to add one
                          </button>
                        </td>
                      </tr>
                    ) : (
                      g.contacts.map((c) => (
                        <tr
                          key={c.id}
                          className="group border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="px-4 py-2.5 pl-8 text-gray-700">{c.fullName}</td>
                          <td className="px-4 py-2.5 text-gray-600">
                            {c.title ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">
                            {c.email ? (
                              <a
                                href={`mailto:${c.email}`}
                                className="hover:text-brand-blue inline-flex items-center gap-1"
                              >
                                <Mail className="h-3 w-3" />
                                {c.email}
                              </a>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">
                            {c.phone ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {c.phone}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteContact(c.id, c.fullName)}
                                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
