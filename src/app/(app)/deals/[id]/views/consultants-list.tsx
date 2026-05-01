"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { cn } from "@/lib/utils";

import { deleteConsultant, type ConsultantRole, type ConsultantSide } from "../actions";

import { ConsultantModal, type EditingConsultant } from "./consultant-modal";

export type ConsultantRow = {
  id: string;
  role: ConsultantRole;
  side: ConsultantSide;
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
};

type ConsultantsListProps = {
  dealId: string;
  items: ConsultantRow[];
};

export const CONSULTANT_ROLES: Array<{ value: ConsultantRole; label: string }> = [
  { value: "landscape_architect", label: "Landscape Architect" },
  { value: "civil_engineer", label: "Civil Engineer" },
  { value: "soils_engineer", label: "Soils Engineer" },
  { value: "cost_to_complete", label: "Cost to Complete Consultant" },
  { value: "hoa", label: "HOA Consultant" },
  { value: "dry_utility", label: "Dry Utility Consultant" },
  { value: "phase_1_environmental", label: "Phase I Environmental Consultant" },
  { value: "land_use", label: "Land Use Consultant" },
  { value: "biologist", label: "Biologist" },
  { value: "architect", label: "Architect" },
  { value: "psa_attorney", label: "PSA Attorney" },
];

const SIDE_META: Record<ConsultantSide, { label: string; chip: string }> = {
  buyer: { label: "Buyer", chip: "bg-blue-100 text-blue-700" },
  seller: { label: "Seller", chip: "bg-emerald-100 text-emerald-700" },
};

export function ConsultantsList({ dealId, items }: ConsultantsListProps) {
  const [editing, setEditing] = useState<EditingConsultant | null>(null);
  const [adding, setAdding] = useState<{ role: ConsultantRole } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();
  const confirm = useConfirm();

  const byRole = useMemo(() => {
    const map = new Map<ConsultantRole, ConsultantRow[]>();
    for (const item of items) {
      const list = map.get(item.role) ?? [];
      list.push(item);
      map.set(item.role, list);
    }
    return map;
  }, [items]);

  const filledCount = useMemo(
    () => CONSULTANT_ROLES.filter((r) => (byRole.get(r.value)?.length ?? 0) > 0).length,
    [byRole],
  );

  async function handleDelete(consultant: ConsultantRow) {
    const ok = await confirm({
      title: "Remove this consultant?",
      description: `${consultant.firmName} will be removed from this deal.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    setDeletingId(consultant.id);
    startDelete(async () => {
      await deleteConsultant({ dealId, consultantId: consultant.id });
      setDeletingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
          Consultant Roster
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-semibold tabular-nums">{filledCount}</span> of{" "}
          <span className="tabular-nums">{CONSULTANT_ROLES.length}</span> roles filled
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3.5">
        {CONSULTANT_ROLES.map((role) => {
          const roleItems = byRole.get(role.value) ?? [];
          const isFilled = roleItems.length > 0;
          return (
            <article
              key={role.value}
              className={cn(
                "group rounded-xl bg-white p-4 shadow-sm",
                "border-l-[3px]",
                isFilled ? "border-l-blue-500" : "border-l-gray-200",
              )}
            >
              <header className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
                  {role.label}
                </div>
                <button
                  type="button"
                  onClick={() => setAdding({ role: role.value })}
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 opacity-0 hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100"
                  title={`Add ${role.label.toLowerCase()}`}
                  aria-label={`Add ${role.label.toLowerCase()}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </header>

              {roleItems.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAdding({ role: role.value })}
                  className="text-[13px] text-gray-300 italic hover:text-blue-500"
                >
                  No consultant yet — click to add
                </button>
              ) : (
                <div className="space-y-2.5">
                  {roleItems.map((item) => {
                    const sideMeta = SIDE_META[item.side];
                    const isDeleting = deletingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={cn("group/item relative", isDeleting && "opacity-50")}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wider uppercase",
                              sideMeta.chip,
                            )}
                          >
                            {sideMeta.label}
                          </span>
                          <span className="flex-1 text-[15px] font-semibold text-gray-900">
                            {item.firmName}
                          </span>
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                            <button
                              type="button"
                              onClick={() =>
                                setEditing({
                                  consultantId: item.id,
                                  role: item.role,
                                  side: item.side,
                                  firmName: item.firmName,
                                  contactName: item.contactName,
                                  contactEmail: item.contactEmail,
                                  contactPhone: item.contactPhone,
                                  notes: item.notes,
                                })
                              }
                              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                              title="Edit consultant"
                              aria-label="Edit consultant"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={isDeleting}
                              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove consultant"
                              aria-label="Remove consultant"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>
                        {item.contactName && (
                          <div className="text-[13px] text-gray-700">{item.contactName}</div>
                        )}
                        <div className="space-y-0.5 text-[12px] leading-relaxed text-gray-500">
                          {item.contactEmail && (
                            <a
                              href={`mailto:${item.contactEmail}`}
                              className="inline-flex items-center gap-1 hover:text-blue-600"
                            >
                              <Mail className="h-3 w-3" />
                              {item.contactEmail}
                            </a>
                          )}
                          {item.contactPhone && (
                            <div className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {item.contactPhone}
                            </div>
                          )}
                          {item.notes && (
                            <div className="mt-1 text-[11px] text-gray-400 italic">
                              {item.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <ConsultantModal
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        dealId={dealId}
        defaultRole={adding?.role}
      />
      <ConsultantModal
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        dealId={dealId}
        editing={editing ?? undefined}
      />
    </div>
  );
}
