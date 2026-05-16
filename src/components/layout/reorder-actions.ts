"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { deals, userDealOrders } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

// Per-user deal reordering for the sidebar list. The model is sparse:
// only deals the user has explicitly reordered have rows in
// user_deal_orders. On each move we re-materialize ALL the user's deals
// into a dense 1..N order — cheap for the < 50-deal scale and avoids
// gap-management bookkeeping.
//
// Move semantics:
//   moveDealUp(dealId)   — swap with the deal directly above
//   moveDealDown(dealId) — swap with the deal directly below
// At list boundaries the action is a no-op.

async function getOrderedDeals(userId: string, orgId: string) {
  // LEFT JOIN to user_deal_orders so unordered deals fall to the bottom.
  // COALESCE the sort_order with a large number; ties broken by deal
  // name. Returns the user's current effective sidebar order.
  return db
    .select({
      id: deals.id,
      sortOrder: sql<number>`coalesce(${userDealOrders.sortOrder}, 2147483647)`.as(
        "sort_order_effective",
      ),
      name: deals.name,
    })
    .from(deals)
    .leftJoin(
      userDealOrders,
      and(eq(userDealOrders.dealId, deals.id), eq(userDealOrders.userId, userId)),
    )
    .where(eq(deals.orgId, orgId))
    .orderBy(sql`sort_order_effective`, asc(deals.name));
}

async function applyDenseOrder(
  userId: string,
  orderedDealIds: string[],
): Promise<void> {
  // Upsert every deal with its new dense position (1..N). Single
  // statement via array unnest would be cleaner but Drizzle's
  // onConflictDoUpdate makes the per-row form readable enough.
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedDealIds.length; i++) {
      const dealId = orderedDealIds[i];
      const sortOrder = i + 1;
      await tx
        .insert(userDealOrders)
        .values({ userId, dealId, sortOrder })
        .onConflictDoUpdate({
          target: [userDealOrders.userId, userDealOrders.dealId],
          set: { sortOrder },
        });
    }
  });
}

async function move(dealId: string, direction: "up" | "down"): Promise<void> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) return;

  const ordered = await getOrderedDeals(me.id, org.id);
  const idx = ordered.findIndex((d) => d.id === dealId);
  if (idx === -1) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return;

  const ids = ordered.map((d) => d.id);
  [ids[idx], ids[swapWith]] = [ids[swapWith], ids[idx]];

  await applyDenseOrder(me.id, ids);
  revalidatePath("/", "layout");
}

export async function moveDealUp(dealId: string): Promise<void> {
  await move(dealId, "up");
}

export async function moveDealDown(dealId: string): Promise<void> {
  await move(dealId, "down");
}
