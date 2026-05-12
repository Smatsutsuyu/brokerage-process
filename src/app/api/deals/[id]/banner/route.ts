// Streams a deal's banner image. Private Vercel Blob means the URL stored
// in deals.banner_image_path isn't directly fetchable — the SDK with
// BLOB_READ_WRITE_TOKEN resolves it to bytes. Same pattern as the
// per-document download endpoint.
//
// 404 if no banner is set; the UI renders the default fallback in that
// case rather than relying on an image-load error.

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { get } from "@vercel/blob";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse | Response> {
  const me = await getCurrentUser();
  const org = await getCurrentOrg();
  if (!me || !org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const [deal] = await db
    .select({ banner: deals.bannerImagePath })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, org.id)))
    .limit(1);

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  if (!deal.banner) {
    return NextResponse.json({ error: "No banner set" }, { status: 404 });
  }

  const blob = await get(deal.banner, { access: "private" });
  if (!blob) {
    return NextResponse.json({ error: "Banner blob missing" }, { status: 404 });
  }

  // Inferred content type — banners are always image/* (enforced at upload).
  // Cache aggressively in the browser since banners change infrequently.
  const headers = new Headers();
  headers.set("Content-Type", "image/jpeg");
  headers.set("Cache-Control", "private, max-age=300");

  return new Response(blob.stream, { status: 200, headers });
}
