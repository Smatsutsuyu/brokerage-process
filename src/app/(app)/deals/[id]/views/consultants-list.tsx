"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Mail, Pencil, Phone, Plus, StickyNote, Trash2 } from "lucide-react";

import { useConfirm } from "@/components/confirm/confirm-provider";
import { cn } from "@/lib/utils";

import { deleteConsultant, type ConsultantRole, type ConsultantSide } from "../actions";

import { ConsultantModal, type EditingConsultant } from "./consultant-modal";
import { CONSULTANT_ROLES, SIDE_META } from "./consultant-roles";

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

      <div className="space-y-3">
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
                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
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
                <div className="space-y-1.5">
                  {roleItems.map((item) => (
                    <ConsultantEntry
                      key={item.id}
                      item={item}
                      isDeleting={deletingId === item.id}
                      onEdit={() =>
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
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
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

type ConsultantEntryProps = {
  item: ConsultantRow;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

function ConsultantEntry({ item, isDeleting, onEdit, onDelete }: ConsultantEntryProps) {
  const [showNote, setShowNote] = useState(false);
  const sideMeta = SIDE_META[item.side];
  const hasContact = Boolean(item.contactEmail || item.contactPhone);
  const hasNote = Boolean(item.notes?.trim());

  return (
    <div
      className={cn(
        "group/item rounded-lg border border-gray-100 bg-gray-50/40",
        isDeleting && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2 px-2.5 py-1.5">
        <div className="flex flex-shrink-0 flex-col items-center gap-1">
          <span
            className={cn(
              "mt-0.5 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wider uppercase",
              sideMeta.chip,
            )}
          >
            {sideMeta.label}
          </span>
          {hasNote && (
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              aria-expanded={showNote}
              aria-label={showNote ? "Hide note" : "Show note"}
              title={showNote ? "Hide note" : "Show note"}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded transition-colors",
                showNote
                  ? "bg-amber-100 text-amber-700"
                  : "text-amber-500 hover:bg-amber-50 hover:text-amber-700",
              )}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-gray-900 select-text">
              {item.firmName}
            </span>
            {item.contactName && (
              <span className="truncate text-[12px] text-gray-500 select-text">
                · {item.contactName}
              </span>
            )}
          </div>
          {hasContact && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-gray-500">
              {item.contactEmail && (
                <a
                  href={`mailto:${item.contactEmail}`}
                  className="inline-flex items-center gap-1 hover:text-blue-600"
                >
                  <Mail className="h-3 w-3" />
                  <span className="select-text">{item.contactEmail}</span>
                </a>
              )}
              {item.contactPhone && (
                <span className="inline-flex items-center gap-1 select-text">
                  <Phone className="h-3 w-3" />
                  {item.contactPhone}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-600"
            title="Edit consultant"
            aria-label="Edit consultant"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
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

      {hasNote && showNote && (
        <div className="border-t border-gray-200 px-3 py-2">
          <div className="max-h-32 overflow-y-auto rounded bg-white px-2 py-1.5 text-[11px] leading-relaxed text-gray-600 italic select-text">
            {item.notes}
          </div>
        </div>
      )}
    </div>
  );
}
