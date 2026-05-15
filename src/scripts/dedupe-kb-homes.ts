// One-off: KB Homes shows up twice in prod — one populated with contacts,
// one empty but stuck on a deal so /builders refuses to delete it. The
// "empty" builder holds the deal_buyers row (with tier, lead, CC list,
// flags), so we want to re-point that row to the populated builder
// rather than drop it — preserving the per-deal buyer state — and then
// delete the now-detached empty builder.
//
// Run diagnostic against any DB:
//   DATABASE_URL=... npx tsx src/scripts/dedupe-kb-homes.ts
//
// Apply the fix:
//   DATABASE_URL=... npx tsx src/scripts/dedupe-kb-homes.ts --apply
//
// Decoupled from @/lib/env so it can be invoked against prod without
// juggling Better Auth / Resend stubs. Same pattern as
// backfill-confidentiality-agreement.ts.

import { eq, ilike, inArray } from "drizzle-orm";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { Pool, neonConfig } from "@neondatabase/serverless";
import postgres from "postgres";
import ws from "ws";

import { builders, contacts, dealBuyers, deals } from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is required. Set inline (e.g. `DATABASE_URL=... npx tsx ...`) or via .env.local.",
  );
  process.exit(1);
}

const apply = process.argv.includes("--apply");

const isNeon = databaseUrl.includes("neon.tech");

// Neon-serverless (WebSocket) supports transactions; neon-http does not.
// We need transactions for the atomic merge below.
if (isNeon && !neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const db = isNeon
  ? drizzleNeonServerless({
      client: new Pool({ connectionString: databaseUrl }),
      casing: "snake_case",
    })
  : drizzlePostgres(postgres(databaseUrl, { max: 1 }), { casing: "snake_case" });

async function main() {
  const matches = await db
    .select()
    .from(builders)
    .where(ilike(builders.name, "kb home%"))
    .orderBy(builders.createdAt);

  if (matches.length === 0) {
    console.log("No builders matched 'kb home%'. Nothing to do.");
    return;
  }

  console.log(`Found ${matches.length} builder row(s) matching 'kb home%':\n`);

  type DealBuyerRef = {
    id: string;
    dealId: string;
    dealName: string;
    tier: string;
    leadUserId: string | null;
    calledAt: Date | null;
    omSentAt: Date | null;
    offerReceivedAt: Date | null;
    confiSignedAt: Date | null;
    ccUserIds: string[];
    comments: string | null;
  };
  type Summary = {
    builderId: string;
    name: string;
    classification: string;
    contactCount: number;
    dealBuyerRows: DealBuyerRef[];
  };

  const summaries: Summary[] = [];

  for (const b of matches) {
    const contactRows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.builderId, b.id));

    const dealBuyerRows = await db
      .select({
        id: dealBuyers.id,
        dealId: deals.id,
        dealName: deals.name,
        tier: dealBuyers.tier,
        leadUserId: dealBuyers.leadUserId,
        calledAt: dealBuyers.calledAt,
        omSentAt: dealBuyers.omSentAt,
        offerReceivedAt: dealBuyers.offerReceivedAt,
        confiSignedAt: dealBuyers.confiSignedAt,
        ccUserIds: dealBuyers.ccUserIds,
        comments: dealBuyers.comments,
      })
      .from(dealBuyers)
      .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
      .where(eq(dealBuyers.builderId, b.id));

    summaries.push({
      builderId: b.id,
      name: b.name,
      classification: b.classification,
      contactCount: contactRows.length,
      dealBuyerRows,
    });

    console.log(`  builder ${b.id}`);
    console.log(`    name:            ${b.name}`);
    console.log(`    classification:  ${b.classification}`);
    console.log(`    createdAt:       ${b.createdAt.toISOString()}`);
    console.log(`    contacts:        ${contactRows.length}`);
    console.log(`    deal_buyers:     ${dealBuyerRows.length}`);
    for (const d of dealBuyerRows) {
      console.log(`      · deal "${d.dealName}" (${d.dealId})`);
      console.log(`        tier=${d.tier}  lead=${d.leadUserId ?? "—"}  cc=${d.ccUserIds.length}`);
      console.log(
        `        called=${d.calledAt ? "Y" : "—"}  om=${d.omSentAt ? "Y" : "—"}  offer=${d.offerReceivedAt ? "Y" : "—"}  confi=${d.confiSignedAt ? "Y" : "—"}`,
      );
      if (d.comments) {
        console.log(`        comments: ${d.comments.slice(0, 80)}${d.comments.length > 80 ? "…" : ""}`);
      }
    }
    console.log();
  }

  const empty = summaries.filter((s) => s.contactCount === 0);
  const populated = summaries.filter((s) => s.contactCount > 0);

  if (empty.length !== 1 || populated.length !== 1) {
    console.log(
      `Expected exactly one empty + one populated match. Empty: ${empty.length}, populated: ${populated.length}.`,
    );
    console.log("Refusing to auto-fix. Inspect manually.");
    return;
  }

  const target = empty[0];
  const keeper = populated[0];

  // For each deal the empty builder is on, decide: re-point or merge-conflict.
  const targetDealIds = new Set(target.dealBuyerRows.map((r) => r.dealId));
  const keeperDealIds = new Set(keeper.dealBuyerRows.map((r) => r.dealId));
  const conflicts = [...targetDealIds].filter((id) => keeperDealIds.has(id));

  console.log(`Plan:`);
  console.log(`  empty builder:     ${target.builderId} (${target.name})`);
  console.log(`  keeper builder:    ${keeper.builderId} (${keeper.name}, ${keeper.contactCount} contacts)`);
  console.log(`  deal_buyers rows on empty:   ${target.dealBuyerRows.length}`);
  console.log(`  deal_buyers rows on keeper:  ${keeper.dealBuyerRows.length}`);
  console.log(`  shared-deal conflicts:       ${conflicts.length}`);

  // Plan each shared-deal merge: build the field-by-field merged values
  // we'll write onto the keeper's row, then drop the empty's row. Strategy:
  // empty wins for "engagement" fields (tier, lead, CCs, called, OM,
  // offer, comments) because that's where the real buyer history lives;
  // keeper wins for confi_signed_at because that's the field someone
  // explicitly checked on the keeper's card AFTER the duplicate was
  // created. Confirmed by Sean for this run.
  type DealBuyerUpdate = Partial<typeof dealBuyers.$inferInsert>;
  type MergePlan = {
    dealId: string;
    dealName: string;
    keeperRowId: string;
    emptyRowId: string;
    update: Required<
      Pick<
        DealBuyerUpdate,
        | "tier"
        | "leadUserId"
        | "ccUserIds"
        | "calledAt"
        | "omSentAt"
        | "offerReceivedAt"
        | "confiSignedAt"
        | "comments"
      >
    >;
  };

  const mergePlans: MergePlan[] = conflicts.map((dealId) => {
    const t = target.dealBuyerRows.find((r) => r.dealId === dealId)!;
    const k = keeper.dealBuyerRows.find((r) => r.dealId === dealId)!;
    return {
      dealId,
      dealName: t.dealName,
      keeperRowId: k.id,
      emptyRowId: t.id,
      update: {
        // Empty wins on engagement when keeper still has the default.
        tier: (t.tier !== "not_selected" ? t.tier : k.tier) as "green" | "yellow" | "red" | "not_selected",
        leadUserId: t.leadUserId ?? k.leadUserId,
        ccUserIds: t.ccUserIds.length > 0 ? t.ccUserIds : k.ccUserIds,
        calledAt: t.calledAt ?? k.calledAt,
        omSentAt: t.omSentAt ?? k.omSentAt,
        offerReceivedAt: t.offerReceivedAt ?? k.offerReceivedAt,
        // Keeper wins on confi — explicit per user.
        confiSignedAt: k.confiSignedAt ?? t.confiSignedAt,
        comments: t.comments ?? k.comments,
      },
    };
  });

  // The empty's rows that aren't part of a conflict still need re-pointing.
  const nonConflictEmptyRows = target.dealBuyerRows.filter(
    (r) => !conflicts.includes(r.dealId),
  );

  console.log("\nMerge plan (conflict deals):");
  for (const p of mergePlans) {
    console.log(`  deal "${p.dealName}" (${p.dealId})`);
    console.log(
      `    → keeper row ${p.keeperRowId}: tier=${p.update.tier}  lead=${p.update.leadUserId ?? "—"}  cc=${p.update.ccUserIds.length}  called=${p.update.calledAt ? "Y" : "—"}  om=${p.update.omSentAt ? "Y" : "—"}  offer=${p.update.offerReceivedAt ? "Y" : "—"}  confi=${p.update.confiSignedAt ? "Y" : "—"}`,
    );
    if (p.update.comments) {
      console.log(`    → comments: ${p.update.comments.slice(0, 100)}${p.update.comments.length > 100 ? "…" : ""}`);
    }
    console.log(`    drop empty row ${p.emptyRowId}`);
  }

  if (nonConflictEmptyRows.length > 0) {
    console.log(`\nNon-conflict re-points (${nonConflictEmptyRows.length}):`);
    for (const r of nonConflictEmptyRows) {
      console.log(`  empty row ${r.id} on "${r.dealName}" → builder_id ${keeper.builderId}`);
    }
  }

  console.log(`\nFinal: DELETE empty builder ${target.builderId}.`);

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to execute.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const p of mergePlans) {
      await tx.update(dealBuyers).set(p.update).where(eq(dealBuyers.id, p.keeperRowId));
      console.log(`Updated keeper row on "${p.dealName}".`);
      await tx.delete(dealBuyers).where(eq(dealBuyers.id, p.emptyRowId));
      console.log(`Dropped empty row on "${p.dealName}".`);
    }
    if (nonConflictEmptyRows.length > 0) {
      await tx
        .update(dealBuyers)
        .set({ builderId: keeper.builderId })
        .where(
          inArray(
            dealBuyers.id,
            nonConflictEmptyRows.map((r) => r.id),
          ),
        );
      console.log(`Re-pointed ${nonConflictEmptyRows.length} non-conflict row(s).`);
    }
    const deleted = await tx
      .delete(builders)
      .where(eq(builders.id, target.builderId))
      .returning();
    console.log(`Deleted builder row(s): ${deleted.length}`);
  });

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
