"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
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
// drag interaction + optimistic reorder + persist.
export function SidebarDealsList({ deals, activeDealId }: SidebarDealsListProps) {
  // Local order mirrors the prop list. Drag updates this synchronously
  // so the row visually settles in its new slot the moment the user
  // drops, then we persist + revalidate to confirm.
  const [order, setOrder] = useState<string[]>(() => deals.map((d) => d.id));
  const [, startPersist] = useTransition();

  // Whenever the prop list identity shifts (server-side add/remove of a
  // deal, or a revalidate after persist), reconcile: keep the user's
  // current relative order for known IDs, append unseen IDs at the end.
  const propIds = useMemo(() => deals.map((d) => d.id), [deals]);
  if (propIds.join("|") !== order.join("|")) {
    const known = new Set(propIds);
    const filtered = order.filter((id) => known.has(id));
    const filteredSet = new Set(filtered);
    const tail = propIds.filter((id) => !filteredSet.has(id));
    const next = [...filtered, ...tail];
    if (next.join("|") !== order.join("|")) {
      // setState during render is fine for derived-from-props reconciles
      // when guarded by an equality check — React docs explicitly allow it.
      setOrder(next);
    }
  }

  // Index lookup so the sortable list can re-derive deal objects in the
  // user's current order without an O(N) find per row.
  const dealsById = useMemo(() => {
    const m = new Map<string, SidebarDealItem>();
    for (const d of deals) m.set(d.id, d);
    return m;
  }, [deals]);

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        {order.map((id) => {
          const d = dealsById.get(id);
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
