"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { PlannedAction } from "@/components/planned-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { deleteContact } from "../../actions";
import { AddContactModal, type EditingContact } from "../add-contact-modal";
import { BuyerCheckbox } from "../buyer-checkbox";
import { LeadPicker, type LeadOption } from "../lead-picker";
import { InternalMarketingReportPdfButton } from "../internal-marketing-report-pdf-button";
import { MarketingReportPdfButton } from "../marketing-report-pdf-button";
import { SendMarketingReportButton } from "../send-marketing-report-button";
import {
  PickExistingContactModal,
  type ExistingContactOption,
} from "../pick-existing-contact-modal";
import { TierBadge } from "../tier-badge";

import type { BuyerGroup, Tier } from "./load-buyers";

type FilterValue = Tier | "all";

const FILTER_META: Record<
  FilterValue,
  { label: string; chip: string; ribbon: string; dot: string | null }
> = {
  all: {
    label: "All",
    chip: "border-brand-ink bg-brand-ink text-white",
    ribbon: "bg-gray-100",
    dot: null,
  },
  green: {
    label: "Interested",
    chip: "bg-green-100 text-green-800 border-green-300",
    ribbon: "bg-tier-green",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    ribbon: "bg-tier-yellow",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Pass",
    chip: "bg-red-100 text-red-800 border-red-300",
    ribbon: "bg-tier-red",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    ribbon: "bg-gray-300",
    dot: "bg-gray-400",
  },
};

const FILTERS: FilterValue[] = ["all", "green", "yellow", "red", "not_selected"];

type OptionBPaneProps = {
  dealId: string;
  groups: Extract<BuyerGroup, { kind: "builder" }>[];
  leadOptions: LeadOption[];
  orgContacts: ExistingContactOption[];
};

export function OptionBPane({ dealId, groups, leadOptions, orgContacts }: OptionBPaneProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => groups[0]?.dealBuyerId ?? null,
  );
  // Two AddContactModal instances: toolbar (no default builder, full freedom)
  // and inner (pre-pinned to the currently-selected builder in the right pane).
  const [toolbarAddOpen, setToolbarAddOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [pickExistingOpen, setPickExistingOpen] = useState(false);
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

  // Selected group derives from `groups` so it stays fresh after revalidation.
  const selected = useMemo(
    () => groups.find((g) => g.dealBuyerId === selectedId) ?? null,
    [groups, selectedId],
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
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              FILTER_META[filter].chip,
            )}
          >
            {FILTER_META[filter].dot && (
              <span className={cn("h-2 w-2 rounded-full", FILTER_META[filter].dot)} />
            )}
            {FILTER_META[filter].label}
            <span className="text-[10px] tabular-nums opacity-70">({tierCounts[filter]})</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {FILTERS.map((value) => {
              const meta = FILTER_META[value];
              const isCurrent = value === filter;
              return (
                <DropdownMenuItem
                  key={value}
                  onClick={() => setFilter(value)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  {meta.dot ? (
                    <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                  ) : (
                    <span className="h-2 w-2" />
                  )}
                  <span className="flex-1">{meta.label}</span>
                  <span className="text-[11px] tabular-nums text-gray-500">
                    {tierCounts[value]}
                  </span>
                  {isCurrent && <Check className="h-3.5 w-3.5 text-gray-400" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex flex-wrap gap-2">
          <MarketingReportPdfButton dealId={dealId} />
          <InternalMarketingReportPdfButton dealId={dealId} />
          <SendMarketingReportButton dealId={dealId} compact={false} />
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
          {orgContacts.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickExistingOpen(true)}
              title="Pick an existing org contact"
            >
              + Existing Contact
            </Button>
          )}
          <Button size="sm" onClick={() => setToolbarAddOpen(true)}>
            + Add Contact
          </Button>
        </div>
      </div>

      <AddContactModal
        open={toolbarAddOpen}
        onOpenChange={setToolbarAddOpen}
        dealId={dealId}
        builders={builderOptions}
      />
      <AddContactModal
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        dealId={dealId}
        builders={builderOptions}
        defaultBuilderId={selected?.builderId}
      />
      <PickExistingContactModal
        open={pickExistingOpen}
        onOpenChange={setPickExistingOpen}
        dealId={dealId}
        dealBuilders={builderOptions}
        contacts={orgContacts}
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

      <div className="grid grid-cols-[300px_1fr] gap-4 rounded-xl bg-white shadow-sm">
        {/* Left list of builders. */}
        <div className="border-r border-gray-200">
          <div className="border-b border-gray-200 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
            Builders ({visibleGroups.length})
          </div>
          {visibleGroups.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-400">
              {groups.length === 0 ? "Add a buyer to get started." : "No builders in this tier."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visibleGroups.map((g) => {
                const isSelected = g.dealBuyerId === selectedId;
                const meta = FILTER_META[g.tier];
                return (
                  <li key={g.dealBuyerId}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(g.dealBuyerId)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                        isSelected ? "bg-blue-50" : "hover:bg-gray-50",
                      )}
                    >
                      <span
                        className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", meta.ribbon)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-gray-900">
                          {g.builderName}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                          <span className="uppercase">{g.classification}</span>
                          <span>·</span>
                          <span>
                            {g.contacts.length} contact{g.contacts.length === 1 ? "" : "s"}
                          </span>
                          {g.called && <span className="text-gray-400">· Called</span>}
                          {g.omSent && <span className="text-gray-400">· OM</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right detail pane. */}
        <div className="min-h-[400px] p-5">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">{selected.builderName}</h3>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wider text-gray-600 uppercase">
                      {selected.classification}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {selected.contacts.length} contact{selected.contacts.length === 1 ? "" : "s"} ·
                    {" "}
                    {selected.called ? "Called" : "Not called yet"} ·{" "}
                    {selected.omSent ? "OM sent" : "OM not sent"}
                  </p>
                </div>
                <TierBadge
                  dealBuyerId={selected.dealBuyerId}
                  dealId={dealId}
                  tier={selected.tier}
                />
              </div>

              <div className="grid grid-cols-6 gap-3 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3 text-xs">
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Lead
                  </div>
                  <LeadPicker
                    dealId={dealId}
                    dealBuyerId={selected.dealBuyerId}
                    currentUserId={selected.leadUserId}
                    currentName={selected.leadName}
                    options={leadOptions}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Called
                  </div>
                  <BuyerCheckbox
                    dealBuyerId={selected.dealBuyerId}
                    dealId={dealId}
                    field="called"
                    checked={selected.called}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Confi
                  </div>
                  <BuyerCheckbox
                    dealBuyerId={selected.dealBuyerId}
                    dealId={dealId}
                    field="confiSigned"
                    checked={selected.confiSigned}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    OM Sent
                  </div>
                  <BuyerCheckbox
                    dealBuyerId={selected.dealBuyerId}
                    dealId={dealId}
                    field="omSent"
                    checked={selected.omSent}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    DD
                  </div>
                  <BuyerCheckbox
                    dealBuyerId={selected.dealBuyerId}
                    dealId={dealId}
                    field="ddSent"
                    checked={selected.ddSent}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Offer
                  </div>
                  <BuyerCheckbox
                    dealBuyerId={selected.dealBuyerId}
                    dealId={dealId}
                    field="offerReceived"
                    checked={selected.offerReceived}
                  />
                </div>
              </div>

              {selected.comments && (
                <div className="rounded-lg border border-gray-200 px-4 py-3">
                  <div className="mb-1 text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                    Notes
                  </div>
                  <p className="text-[13px] text-gray-700">{selected.comments}</p>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
                    Contacts
                  </h4>
                  <Button size="sm" variant="outline" onClick={() => setAddContactOpen(true)}>
                    <Plus className="h-3 w-3" />
                    Add Contact
                  </Button>
                </div>

                {selected.contacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-xs text-gray-400">
                    No contacts yet at {selected.builderName}.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {selected.contacts.map((c) => (
                      <div key={c.id} className="group flex items-center gap-3 px-4 py-3">
                        <div className="flex-1">
                          <div className="text-[13px] font-medium text-gray-900">{c.fullName}</div>
                          {c.title && (
                            <div className="text-[11px] text-gray-500">{c.title}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600">
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
                            <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                              <Phone className="h-3 w-3" />
                              {formatPhone(c.phone)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                contactId: c.id,
                                builderId: selected.builderId,
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-gray-400">
              <Building2 className="mb-3 h-10 w-10 opacity-40" />
              <p className="text-sm">Pick a builder from the list</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
