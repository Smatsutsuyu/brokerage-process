"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Mail,
  MessageSquare,
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

import { removeContactFromDeal } from "../../actions";
import { AddContactModal, type EditingContact } from "../add-contact-modal";
import { BlastModal } from "../blast-modal";
import { BuyerCheckbox } from "../buyer-checkbox";
import { BuyerCommentsEditor } from "../buyer-comments-editor";
import { LeadPicker, type LeadOption } from "../lead-picker";
import { ReceivesCommunicationToggle } from "../receives-communication-toggle";
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
    ribbon: "border-l-gray-200",
    dot: null,
  },
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

type OptionACardsProps = {
  dealId: string;
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
  orgContacts: ExistingContactOption[];
};

export function OptionACards({ dealId, groups, leadOptions, orgContacts }: OptionACardsProps) {
  const [filter, setFilter] = useState<FilterValue>("all");

  // Initial mount: expand every group with contacts so first-visit shows
  // populated cards open. Lazy init avoids touching refs during render
  // (lint rule: react-hooks/refs).
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.contacts.length > 0).map((g) => g.dealBuyerId)),
  );

  // Tracks which group ids we've reconciled. The effect below uses it to
  // tell "this card was already here, the user might have collapsed it"
  // apart from "this card just appeared, expand it so new contacts are
  // visible." Starts empty; populated by the effect on first run.
  const seenIdsRef = useRef<Set<string>>(new Set());

  // After mount, whenever groups changes (server action revalidate, etc.):
  // - Drop seen-ids no longer present so a card that disappeared (last
  //   contact removed) and later reappears (re-added) re-expands instead
  //   of staying collapsed.
  // - Expand any newly-appeared id with contacts. The bail-out `return
  //   prev` skips the re-render when nothing actually changed (which is
  //   the common case on first effect run, where seenIds catches up to
  //   what the lazy initializer already expanded).
  useEffect(() => {
    const currentIds = new Set(groups.map((g) => g.dealBuyerId));
    for (const id of seenIdsRef.current) {
      if (!currentIds.has(id)) seenIdsRef.current.delete(id);
    }
    setExpanded((prev) => {
      let added = false;
      const next = new Set(prev);
      for (const g of groups) {
        if (!seenIdsRef.current.has(g.dealBuyerId)) {
          seenIdsRef.current.add(g.dealBuyerId);
          if (g.contacts.length > 0 && !next.has(g.dealBuyerId)) {
            next.add(g.dealBuyerId);
            added = true;
          }
        }
      }
      return added ? next : prev;
    });
  }, [groups]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [pickExistingOpen, setPickExistingOpen] = useState(false);
  const [blastOpen, setBlastOpen] = useState(false);
  const [addContactFor, setAddContactFor] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<EditingContact | null>(null);
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  const tierCounts = useMemo(() => {
    const counts: Record<FilterValue, number> = {
      all: groups.length,
      green: 0,
      yellow: 0,
      red: 0,
      not_selected: 0,
    };
    for (const g of groups) {
      // Unaffiliated has no tier — only count it under "all".
      if (g.kind === "builder") counts[g.tier]++;
    }
    return counts;
  }, [groups]);

  const visibleGroups = useMemo(() => {
    if (filter === "all") return groups;
    // Tier filter applies to builder groups only; the Unaffiliated card is
    // hidden when a specific tier is selected since it has no tier.
    return groups.filter((g) => g.kind === "builder" && g.tier === filter);
  }, [groups, filter]);

  // Builder picker only sees builder groups — the Unaffiliated bucket isn't
  // a target for "Add contact at [builder]".
  const builderOptions = useMemo(
    () =>
      groups
        .filter((g): g is Extract<BuyerGroup, { kind: "builder" }> => g.kind === "builder")
        .map((g) => ({ id: g.builderId, name: g.builderName })),
    [groups],
  );

  // Set of contact ids currently on the deal — feeds the
  // PickExistingContactModal so it doesn't show people already added.
  const onDealContactIds = useMemo(
    () => new Set(groups.flatMap((g) => g.contacts.map((c) => c.id))),
    [groups],
  );

  // Lead options for the OM-blast filter — only people actually leading a
  // builder on this deal. Avoids the dropdown listing every org member
  // (coordinators, analysts) who never lead a buyer relationship.
  const dealLeadOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: LeadOption[] = [];
    for (const g of groups) {
      if (g.kind !== "builder") continue;
      if (!g.leadUserId || !g.leadName || seen.has(g.leadUserId)) continue;
      seen.add(g.leadUserId);
      out.push({ id: g.leadUserId, name: g.leadName });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [groups]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // "Remove from deal" — drops the deal_contacts row, leaves the contact
  // intact in the org directory. The builder card disappears automatically
  // when its last contact is removed (purely query-derived; per-builder
  // dealBuyer metadata persists for re-add scenarios).
  async function handleRemoveFromDeal(contactId: string, name: string) {
    const ok = await confirm({
      title: "Remove from deal?",
      description: `${name} will be removed from this deal. The contact stays in the org directory and can be added back anytime.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    startDelete(async () => {
      await removeContactFromDeal({ dealId, contactId });
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Same destination as the deal-menu Generate Marketing
              // Report item — duplicated here because the data is
              // derived from this tab and the natural place to find
              // "give me the PDF of this" is right next to the data.
              window.open(`/api/deals/${dealId}/marketing-report.pdf`, "_blank");
            }}
            title="Download the per-builder Marketing Report PDF for this deal"
          >
            <FileText className="h-3.5 w-3.5" />
            Marketing Report
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setBlastOpen(true)}
            title="Filter contacts by tier and assignment, preview the recipient list (sending lands in Phase 2)"
          >
            <Mail className="h-3.5 w-3.5" />
            Send OM blast
          </Button>
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
              title="Pick one or more existing org contacts and add them to this deal"
            >
              + Existing Contact
            </Button>
          )}
          <Button size="sm" onClick={() => setAddContactOpen(true)}>
            + Add Contact
          </Button>
        </div>
      </div>

      <AddContactModal
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        dealId={dealId}
        builders={builderOptions}
      />

      <PickExistingContactModal
        open={pickExistingOpen}
        onOpenChange={setPickExistingOpen}
        dealId={dealId}
        dealBuilders={builderOptions}
        contacts={orgContacts}
        excludeContactIds={onDealContactIds}
      />

      <BlastModal
        open={blastOpen}
        onOpenChange={setBlastOpen}
        dealId={dealId}
        leadOptions={dealLeadOptions}
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
            {groups.length === 0
              ? "No contacts on this deal yet."
              : "No buyers in this tier."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map((g) => {
            const isOpen = expanded.has(g.dealBuyerId);
            // Builder cards get the tier ribbon; Unaffiliated gets a neutral
            // gray border to read as a sibling card without implying tier.
            const ribbon =
              g.kind === "builder" ? FILTER_META[g.tier].ribbon : "border-l-gray-300";
            return (
              <div
                key={g.dealBuyerId}
                className={cn(
                  "overflow-hidden rounded-xl border-l-[3px] bg-white shadow-sm transition-shadow",
                  ribbon,
                )}
              >
                {/* Header row — always visible. Click to expand/collapse. */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(g.dealBuyerId)}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleExpanded(g.dealBuyerId)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    {g.kind === "builder" ? (
                      <>
                        <span className="text-[15px] font-semibold text-gray-900">
                          {g.builderName}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wider text-gray-600 uppercase">
                          {g.classification}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[15px] font-semibold text-gray-700 italic">
                          Unaffiliated
                        </span>
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] tracking-wider text-amber-700 uppercase">
                          no builder
                        </span>
                      </>
                    )}
                    <span className="text-xs text-gray-500">
                      {g.contacts.length} contact{g.contacts.length === 1 ? "" : "s"}
                    </span>
                    {g.kind === "builder" && g.comments && (
                      <span className="text-gray-400">
                        <MessageSquare className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>

                  {/* Tier / Lead / Called / OM only apply to builder cards.
                      Unaffiliated gets nothing here — it's just a contacts
                      bucket without per-builder metadata. */}
                  {g.kind === "builder" && (
                    <>
                      <TierBadge dealBuyerId={g.dealBuyerId} dealId={dealId} tier={g.tier} />
                      <div className="flex items-center gap-3 text-xs">
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
                          <span className="text-gray-600">OM</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Expanded contacts panel. */}
                {isOpen && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                    {/* Comments editor — per-builder interest notes that
                        feed into the Marketing Report PDF. Only on builder
                        cards (Unaffiliated has no dealBuyer row). */}
                    {g.kind === "builder" && (
                      <BuyerCommentsEditor
                        dealBuyerId={g.dealBuyerId}
                        dealId={dealId}
                        initialComments={g.comments}
                      />
                    )}

                    {g.contacts.length === 0 ? (
                      <div className="py-4 text-center text-xs text-gray-400 italic">
                        No contacts yet.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {g.contacts.map((c) => (
                          <div
                            key={c.id}
                            className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white"
                          >
                            <div className="flex flex-1 items-center gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900">
                                  {c.fullName}
                                  <ReceivesCommunicationToggle
                                    dealId={dealId}
                                    contactId={c.id}
                                    receivesCommunication={c.receivesCommunication}
                                  />
                                </div>
                                {c.title && (
                                  <div className="text-[11px] text-gray-500">{c.title}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {c.email && (
                                  <a
                                    href={`mailto:${c.email}`}
                                    className="hover:text-brand-blue inline-flex items-center gap-1 text-gray-600"
                                  >
                                    <Mail className="h-3 w-3" />
                                    {c.email}
                                  </a>
                                )}
                                {c.phone && (
                                  <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums text-gray-600">
                                    <Phone className="h-3 w-3" />
                                    {formatPhone(c.phone)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setEditing({
                                    contactId: c.id,
                                    builderId: g.kind === "builder" ? g.builderId : null,
                                    firstName: c.firstName,
                                    lastName: c.lastName,
                                    title: c.title,
                                    email: c.email,
                                    phone: c.phone,
                                    notes: c.notes,
                                    receivesCommunication: c.receivesCommunication,
                                  })
                                }
                                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveFromDeal(c.id, c.fullName)}
                                className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Remove from deal"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {g.kind === "builder" && (
                      <button
                        type="button"
                        onClick={() =>
                          setAddContactFor({ id: g.builderId, name: g.builderName })
                        }
                        className="mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800"
                      >
                        <Plus className="h-3 w-3" />
                        Add contact at {g.builderName}
                      </button>
                    )}
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
