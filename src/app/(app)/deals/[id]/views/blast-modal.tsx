"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, Loader2, Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastComingSoon } from "@/components/planned-action";
import { cn } from "@/lib/utils";

import {
  previewBlastRecipients,
  type BlastPreviewRow,
} from "../actions";
import type { LeadOption } from "./lead-picker";

type Tier = "green" | "yellow" | "red" | "not_selected";

const TIER_META: Record<Tier, { label: string; chip: string; dot: string }> = {
  green: {
    label: "Interested (Green)",
    chip: "bg-green-100 text-green-800 border-green-300",
    dot: "bg-tier-green",
  },
  yellow: {
    label: "Evaluating (Yellow)",
    chip: "bg-yellow-100 text-yellow-800 border-yellow-300",
    dot: "bg-tier-yellow",
  },
  red: {
    label: "Passed (Red)",
    chip: "bg-red-100 text-red-800 border-red-300",
    dot: "bg-tier-red",
  },
  not_selected: {
    label: "Not Selected",
    chip: "bg-gray-100 text-gray-700 border-gray-300",
    dot: "bg-gray-400",
  },
};

const TIERS: Tier[] = ["green", "yellow", "red", "not_selected"];

// Sentinel for the "Anyone" assignee filter (no leadUser filter applied).
const ANY_ASSIGNEE = "__any__";

type BlastModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  leadOptions: LeadOption[];
};

// OM-blast composer. Filter UI on top, live recipient preview below, "Send"
// button at the bottom. Sending isn't wired up yet (Phase 2 work, gated on
// Resend domain verification for landadvisors.com) — clicking shows a
// planned-action toast. The preview piece is the load-bearing part: it
// lets Chris verify the filter logic against real contacts before we ship
// the actual send.
export function BlastModal({ open, onOpenChange, dealId, leadOptions }: BlastModalProps) {
  // Default: include green + yellow (the typical OM-blast audience).
  const [selectedTiers, setSelectedTiers] = useState<Set<Tier>>(
    () => new Set(["green", "yellow"]),
  );
  const [assigneeChoice, setAssigneeChoice] = useState<string>(ANY_ASSIGNEE);
  const [recipients, setRecipients] = useState<BlastPreviewRow[]>([]);
  const [isLoading, startLoading] = useTransition();

  // Recompute the preview whenever filters change OR the modal opens.
  // useEffect rather than onChange so the recompute is debounced naturally
  // by React's batching and survives transient closes/reopens.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const tiers = Array.from(selectedTiers);
    if (tiers.length === 0) {
      setRecipients([]);
      return;
    }
    startLoading(async () => {
      try {
        const rows = await previewBlastRecipients({
          dealId,
          tiers,
          assigneeUserId: assigneeChoice === ANY_ASSIGNEE ? null : assigneeChoice,
        });
        setRecipients(rows);
      } catch (err) {
        console.error("[blast] preview failed", err);
        setRecipients([]);
      }
    });
  }, [open, dealId, selectedTiers, assigneeChoice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleTier(t: Tier) {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const assigneeLabel = useMemo(() => {
    if (assigneeChoice === ANY_ASSIGNEE) return "Anyone (no filter)";
    return leadOptions.find((u) => u.id === assigneeChoice)?.name ?? "Pick an assignee";
  }, [assigneeChoice, leadOptions]);

  // Group preview rows by builder for readability. Preserve the server's
  // sort order (alphabetical builder, alphabetical contact within).
  const grouped = useMemo(() => {
    const map = new Map<string, { builderName: string; contacts: BlastPreviewRow[] }>();
    for (const r of recipients) {
      let g = map.get(r.builderId);
      if (!g) {
        g = { builderName: r.builderName, contacts: [] };
        map.set(r.builderId, g);
      }
      g.contacts.push(r);
    }
    return Array.from(map.values());
  }, [recipients]);

  const recipientCount = recipients.length;
  const recipientsWithEmail = recipients.filter((r) => r.contactEmail).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send OM blast</DialogTitle>
          <DialogDescription>
            Filter by tier and (optionally) lead assignee. Contacts marked
            &ldquo;does not receive communication&rdquo; are excluded automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tier multi-select */}
          <div className="space-y-2">
            <Label>Tiers</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TIERS.map((t) => {
                const meta = TIER_META[t];
                const active = selectedTiers.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTier(t)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors",
                      active
                        ? meta.chip
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-400",
                    )}
                  >
                    <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", meta.dot)} />
                    <span className="flex-1">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assigned-to filter */}
          <div className="grid gap-2">
            <Label htmlFor="blast-assignee">Lead assignment</Label>
            <Select
              value={assigneeChoice}
              onValueChange={(v) => v && setAssigneeChoice(v)}
            >
              <SelectTrigger id="blast-assignee" className="w-full">
                <SelectValue>{assigneeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_ASSIGNEE}>Anyone (no filter)</SelectItem>
                {leadOptions.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    Only builders led by {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-500">
              When set, only contacts at builders where this person is the lead are included.
            </p>
          </div>

          {/* Recipient preview */}
          <div className="rounded-lg border border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
              <div className="text-[11px] font-semibold tracking-wider text-gray-600 uppercase">
                Recipients{" "}
                {isLoading && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
              </div>
              <div className="text-[12px] tabular-nums text-gray-600">
                <span className="font-semibold">{recipientCount}</span>
                {recipientCount > 0 && recipientsWithEmail !== recipientCount && (
                  <span className="ml-2 text-amber-700">
                    ({recipientCount - recipientsWithEmail} without email)
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto px-3 py-2">
              {selectedTiers.size === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400 italic">
                  Pick at least one tier to see who would receive the blast.
                </p>
              ) : recipientCount === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400 italic">
                  No contacts match these filters.
                </p>
              ) : (
                <ul className="space-y-3">
                  {grouped.map((g) => (
                    <li key={g.builderName}>
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-gray-700">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {g.builderName}
                        <span className="text-gray-400">·</span>
                        <span className="text-[10px] tabular-nums text-gray-500">
                          {g.contacts.length}
                        </span>
                      </div>
                      <ul className="ml-4 space-y-0.5">
                        {g.contacts.map((c) => (
                          <li
                            key={c.contactId}
                            className="flex items-center justify-between gap-2 text-[12px]"
                          >
                            <span className="font-medium text-gray-800">{c.contactName}</span>
                            {c.contactEmail ? (
                              <span className="inline-flex items-center gap-1 text-gray-500">
                                <Mail className="h-3 w-3" />
                                {c.contactEmail}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-700 italic">
                                no email
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="mr-auto text-[10px] text-gray-500">
            Preview only — sending lands in Phase 2 once email infra is live.
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={recipientsWithEmail === 0}
            onClick={() =>
              toastComingSoon({
                feature: "OM blast send",
                description:
                  "Composes the templated OM-distribution email per tier and sends via Resend. Wiring up requires the landadvisors.com sender-domain verification.",
              })
            }
          >
            <Send className="h-3.5 w-3.5" />
            Send to {recipientsWithEmail || "0"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
