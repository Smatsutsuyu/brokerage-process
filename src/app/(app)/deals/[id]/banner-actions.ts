"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { del, head } from "@vercel/blob";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

// Records an uploaded banner image as the deal's PDF banner. Verifies the
// blob exists in our store via head() before writing the path — same
// guard as recordUploadedDocument, prevents a forged client from setting
// an arbitrary URL as a "banner."
//
// Replaces any existing banner: best-effort deletes the old blob so we
// don't accumulate orphaned uploads. If the delete fails (e.g. blob
// already gone), we log and proceed — the path swap is the load-bearing
// part.
export async function setDealBanner(input: {
  dealId: string;
  pathname: string;
}): Promise<void> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) throw new Error("Not signed in");

  // Confirm deal belongs to caller's org.
  const [deal] = await db
    .select({ id: deals.id, currentBanner: deals.bannerImagePath })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) throw new Error("Deal not found");

  // Validate the blob actually exists in our store and is an image.
  const meta = await head(input.pathname);
  if (!meta.contentType?.startsWith("image/")) {
    throw new Error("Banner must be an image");
  }

  // Best-effort cleanup of the previous banner blob.
  if (deal.currentBanner && deal.currentBanner !== input.pathname) {
    try {
      await del(deal.currentBanner);
    } catch (err) {
      console.warn("[banner] failed to delete previous blob", err);
    }
  }

  await db
    .update(deals)
    .set({ bannerImagePath: input.pathname })
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, org.id)));

  revalidatePath(`/deals/${input.dealId}`);
}

// Clears the deal's banner — deletes the blob (best effort) + nulls the
// path column. The PDF then falls back to the Land Advisors-branded
// default header.
export async function clearDealBanner(dealId: string): Promise<void> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) throw new Error("Not signed in");

  const [deal] = await db
    .select({ id: deals.id, currentBanner: deals.bannerImagePath })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)))
    .limit(1);
  if (!deal) throw new Error("Deal not found");

  if (deal.currentBanner) {
    try {
      await del(deal.currentBanner);
    } catch (err) {
      console.warn("[banner] failed to delete blob during clear", err);
    }
  }

  await db
    .update(deals)
    .set({ bannerImagePath: null })
    .where(and(eq(deals.id, dealId), eq(deals.orgId, org.id)));

  revalidatePath(`/deals/${dealId}`);
}
