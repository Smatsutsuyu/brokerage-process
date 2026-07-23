"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { reorderDeals } from "@/components/layout/reorder-actions";
import { cn } from "@/lib/utils";

type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";

const PHASE_CHIP: Record<Phase | "complete", { label: string; cls: string }> = {
  phase_1: { label: "Phase 1", cls: "bg-blue-100 text-blue-800" },
  phase_2: { label: "Phase 2", cls: "bg-emerald-100 text-emerald-800" },
  phase_3: { label: "Phase 3", cls: "bg-purple-100 text-purple-800" },
  phase_4: { label: "Phase 4", cls: "bg-orange-100 text-orange-800" },
  complete: { label: "Complete", cls: "bg-green-600 text-white" },
};

export type SidebarDealItem = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  priority: "normal" | "high";
  // Deals with archivedAt set are hidden by default under a collapsible
  // "Show archived" section at the bottom of the list.
  archived: boolean;
  total: number;
  done: number;
  phase: Phase | "complete" | null;
};

type SidebarDealsListProps = {
  deals: SidebarDealItem[];
  activeDealId?: string;
};

// Client-side sortable wrapper around the deal list. Server component
// (Sidebar) does the DB query and passes pre-shaped rows in; this owns
// drag interaction + optimistic reorder + persist. Archived deals are
// hidden by default under a collapsible section at the bottom.
export function SidebarDealsList({ deals, activeDealId }: SidebarDealsListProps) {
  // Split active vs archived. Only active deals participate in drag-
  // reorder; archived is a passive list shown when the user asks for it.
  const { activeDeals, archivedDeals } = useMemo(() => {
    const active: SidebarDealItem[] = [];
    const archived: SidebarDealItem[] = [];
    for (const d of deals) {
      if (d.archived) archived.push(d);
      else active.push(d);
    }
    return { activeDeals: active, archivedDeals: archived };
  }, [deals]);

  // Local order mirrors the ACTIVE prop list. Drag updates this
  // synchronously so the row visually settles in its new slot the moment
  // the user drops, then we persist + revalidate to confirm.
  const [order, setOrder] = useState<string[]>(() => activeDeals.map((d) => d.id));
  const [, startPersist] = useTransition();
  // Auto-expand when the user lands on an archived deal, but let the
  // user override with the toggle. Once they've clicked the toggle,
  // archivedOpen becomes authoritative regardless of navigation state.
  // Prevents the "click Archived to collapse and nothing happens" bug
  // that a purely-derived-from-viewingArchived state had.
  const viewingArchived = archivedDeals.some((d) => d.id === activeDealId);
  const [userToggled, setUserToggled] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState<boolean>(viewingArchived);
  const showArchived = userToggled ? archivedOpen : viewingArchived || archivedOpen;

  function handleArchivedToggle() {
    setUserToggled(true);
    setArchivedOpen((v) => !v);
  }

  // Reconcile order state to prop identity (active deals only) — a deal
  // archived server-side leaves the active list and needs to fall out of
  // the drag order; a new deal appended by the server needs to appear.
  const activeIds = useMemo(() => activeDeals.map((d) => d.id), [activeDeals]);
  if (activeIds.join("|") !== order.join("|")) {
    const known = new Set(activeIds);
    const filtered = order.filter((id) => known.has(id));
    const filteredSet = new Set(filtered);
    const tail = activeIds.filter((id) => !filteredSet.has(id));
    const next = [...filtered, ...tail];
    if (next.join("|") !== order.join("|")) {
      // setState during render is fine for derived-from-props reconciles
      // when guarded by an equality check — React docs explicitly allow it.
      setOrder(next);
    }
  }

  // Index lookup so the sortable list can re-derive deal objects in the
  // user's current order without an O(N) find per row.
  const activeById = useMemo(() => {
    const m = new Map<string, SidebarDealItem>();
    for (const d of activeDeals) m.set(d.id, d);
    return m;
  }, [activeDeals]);

  // Pointer sensor with a small activation distance so a quick click on
  // the grip handle (or anywhere in the row) doesn't accidentally start
  // a drag — the user has to actually move 4px before drag engages.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(String(active.id));
    const newIdx = order.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    // Fire-and-forget persist. revalidatePath("/", "layout") in the
    // action refreshes the server-rendered Sidebar so the next nav
    // sees the new order even on a hard refresh.
    startPersist(async () => {
      await reorderDeals(next);
    });
  }

  if (deals.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-gray-400 italic">
        No deals yet. Run <code>npm run db:seed</code> to add sample data.
      </div>
    );
  }

  return (
    <div>
      {/* Explicit `id` on DndContext so dnd-kit's accessibility describedby
          IDs (DndDescribedBy-N) are deterministic across SSR/hydration.
          Without this, the module-level counter assigns different values
          server-side vs client-side and triggers a hydration mismatch. */}
      {activeDeals.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-gray-400 italic">
          No active deals.
        </div>
      ) : (
        <DndContext
          id="sidebar-deals-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => {
              const d = activeById.get(id);
              if (!d) return null;
              return (
                <SortableDealRow
                  key={id}
                  deal={d}
                  isActive={d.id === activeDealId}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}

      {archivedDeals.length > 0 && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={handleArchivedToggle}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-wider text-gray-400 uppercase hover:bg-gray-50 hover:text-gray-600"
            aria-expanded={showArchived}
          >
            {showArchived ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Archive className="h-3 w-3" />
            <span>Archived</span>
            <span className="text-gray-400 tabular-nums">{archivedDeals.length}</span>
          </button>
          {showArchived && (
            <div className="mt-1 space-y-0.5 opacity-70">
              {archivedDeals.map((d) => (
                <ArchivedDealRow key={d.id} deal={d} isActive={d.id === activeDealId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ArchivedDealRowProps = {
  deal: SidebarDealItem;
  isActive: boolean;
};

// Compact, non-draggable row for archived deals. Still links through to
// the deal page so the user can unarchive from there. Visually recedes
// (grayscale + reduced opacity via the parent wrapper).
function ArchivedDealRow({ deal, isActive }: ArchivedDealRowProps) {
  return (
    <Link
      href={`/deals/${deal.id}`}
      className={cn(
        "block truncate rounded px-2 py-1 text-[12px] text-gray-500 hover:bg-gray-100 hover:text-gray-700",
        isActive && "bg-blue-50 text-brand-blue",
      )}
    >
      {deal.name}
      {(deal.city || deal.state) && (
        <span className="ml-1.5 text-[10px] text-gray-400">
          {[deal.city, deal.state].filter(Boolean).join(", ")}
        </span>
      )}
    </Link>
  );
}

type SortableDealRowProps = {
  deal: SidebarDealItem;
  isActive: boolean;
};

function SortableDealRow({ deal, isActive }: SortableDealRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  const pct = deal.total > 0 ? Math.round((deal.done / deal.total) * 100) : 0;
  const phaseChip = deal.phase ? PHASE_CHIP[deal.phase] : null;

  // dnd-kit applies translate + scale via CSS variables for smooth FLIP
  // animation. Wrap them through @dnd-kit/utilities' CSS helper which
  // emits the right transform string.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative mb-1 flex items-stretch rounded-lg border border-transparent transition-colors",
        isActive ? "border-brand-blue bg-blue-50" : "hover:bg-gray-100",
        // Lift the dragged row above siblings + slight shadow so the
        // drop target reads clearly. dnd-kit handles the FLIP, we just
        // style the floating state.
        isDragging && "z-10 shadow-md ring-1 ring-gray-300",
      )}
    >
      {/* Dedicated left gutter for the drag handle. Narrow + flush with
          content so it doesn't visually push the deal name right. Grip
          stays subtle at rest, intensifies on hover/drag. The whole
          gutter is the drag target (not just the icon glyph) so it's
          forgiving to click. */}
      <button
        type="button"
        aria-label={`Reorder ${deal.name}`}
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className={cn(
          "flex w-3 flex-shrink-0 cursor-grab items-center justify-center rounded-l-lg text-gray-300 transition-colors hover:bg-gray-200/60 hover:text-gray-700 active:cursor-grabbing",
          isDragging && "cursor-grabbing text-gray-700",
        )}
      >
        <GripVertical className="h-3 w-3" />
      </button>

      <Link href={`/deals/${deal.id}`} className="block min-w-0 flex-1 py-3 pr-3 pl-1">
        {/* Row 1: title gets the full width; truncates with ellipsis if
            long. Priority star sits inline before the name. */}
        <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
          {deal.priority === "high" && (
            <span className="text-brand-accent flex-shrink-0 text-xs">★</span>
          )}
          <span className="min-w-0 flex-1 truncate">{deal.name}</span>
        </div>
        {/* Row 2: city (truncates to absorb overflow) + progress dot +
            phase chip at the far right. flex-shrink-0 on the right-hand
            cluster guarantees the chip + progress stay intact when the
            row is narrow. */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="min-w-0 flex-1 truncate">
            {[deal.city, deal.state].filter(Boolean).join(", ") || "—"}
          </span>
          <span className="flex flex-shrink-0 items-center gap-1.5">
            <span className="h-1 w-10 overflow-hidden rounded-full bg-gray-200">
              <span
                className="bg-brand-blue block h-full"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="font-medium tabular-nums">
              {deal.done}/{deal.total}
            </span>
          </span>
          {phaseChip && (
            <span
              className={cn(
                "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase",
                phaseChip.cls,
              )}
            >
              {phaseChip.label}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}
