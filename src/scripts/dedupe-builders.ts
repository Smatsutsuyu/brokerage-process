// Merges all case-insensitive duplicate builders within each org. Sister
// of dedupe-kb-homes.ts but operates on every (org_id, lower(trim(name)))
// group with >1 row.
//
// Keeper selection per group:
//   1. Most contacts (the populated one usually has them).
//   2. Tiebreaker: most deal_buyers.
//   3. Tiebreaker: earliest createdAt (the "original" row).
//
// For every non-keeper duplicate:
//   - Re-point all contacts at the duplicate → keeper.
//   - For each deal_buyers row at the duplicate:
//       · if keeper has a row on the same deal → MERGE field-by-field
//         (see merge strategy below) and drop the duplicate's row;
//       · else → re-point the duplicate's row's builder_id to keeper.
//   - Delete the duplicate builder.
//
// Merge strategy on a shared deal:
//   tier:            non-"not_selected" wins; conflict (both non-default
//                    and different) → skip the entire pair, surface for
//                    manual review.
//   leadUserId:      non-null wins; both-set-and-different → skip pair.
//   ccUserIds:       union (deduped).
//   calledAt:        latest non-null.
//   omSentAt:        latest non-null.
//   offerReceivedAt: latest non-null.
//   confiSignedAt:   latest non-null.
//   comments:        if both set, concat with "\n\n---\n\n"; else
//                    whichever is non-null.
//
// Run diagnostic:
//   DATABASE_URL=... npx tsx src/scripts/dedupe-builders.ts
// Apply:
//   DATABASE_URL=... npx tsx src/scripts/dedupe-builders.ts --apply
//
// Decoupled from @/lib/env so it works against prod without env stubs.

import { eq, inArray } from "drizzle-orm";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { Pool, neonConfig } from "@neondatabase/serverless";
import postgres from "postgres";
import ws from "ws";

import { builders, contacts, dealBuyers, deals } from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

const isNeon = databaseUrl.includes("neon.tech");
if (isNeon && !neonConfig.webSocketConstructor) {
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const db = isNeon
  ? drizzleNeonServerless({
      client: new Pool({ connectionString: databaseUrl }),
      casing: "snake_case",
    })
  : drizzlePostgres(postgres(databaseUrl, { max: 1 }), { casing: "snake_case" });

type Tier = "green" | "yellow" | "red" | "not_selected";

type DealBuyerRow = {
  id: string;
  builderId: string;
  dealId: string;
  dealName: string;
  tier: Tier;
  leadUserId: string | null;
  ccUserIds: string[];
  calledAt: Date | null;
  omSentAt: Date | null;
  offerReceivedAt: Date | null;
  confiSignedAt: Date | null;
  comments: string | null;
};

type BuilderInfo = {
  id: string;
  name: string;
  orgId: string;
  createdAt: Date;
  contactCount: number;
  dealBuyerRows: DealBuyerRow[];
};

function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function unionUuids(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

async function loadBuilderInfo(builderId: string): Promise<BuilderInfo> {
  const [b] = await db.select().from(builders).where(eq(builders.id, builderId));
  if (!b) throw new Error(`builder ${builderId} not found`);

  const contactRows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.builderId, builderId));

  const dealBuyerRows = await db
    .select({
      id: dealBuyers.id,
      builderId: dealBuyers.builderId,
      dealId: deals.id,
      dealName: deals.name,
      tier: dealBuyers.tier,
      leadUserId: dealBuyers.leadUserId,
      ccUserIds: dealBuyers.ccUserIds,
      calledAt: dealBuyers.calledAt,
      omSentAt: dealBuyers.omSentAt,
      offerReceivedAt: dealBuyers.offerReceivedAt,
      confiSignedAt: dealBuyers.confiSignedAt,
      comments: dealBuyers.comments,
    })
    .from(dealBuyers)
    .innerJoin(deals, eq(deals.id, dealBuyers.dealId))
    .where(eq(dealBuyers.builderId, builderId));

  return {
    id: b.id,
    name: b.name,
    orgId: b.orgId,
    createdAt: b.createdAt,
    contactCount: contactRows.length,
    dealBuyerRows: dealBuyerRows as DealBuyerRow[],
  };
}

type MergedRow = {
  tier: Tier;
  leadUserId: string | null;
  ccUserIds: string[];
  calledAt: Date | null;
  omSentAt: Date | null;
  offerReceivedAt: Date | null;
  confiSignedAt: Date | null;
  comments: string | null;
};

type MergeOutcome =
  | { kind: "ok"; merged: MergedRow }
  | { kind: "conflict"; reason: string };

function mergeRows(keeper: DealBuyerRow, dupe: DealBuyerRow): MergeOutcome {
  // tier
  let tier: Tier;
  if (keeper.tier === "not_selected") tier = dupe.tier;
  else if (dupe.tier === "not_selected") tier = keeper.tier;
  else if (keeper.tier === dupe.tier) tier = keeper.tier;
  else return { kind: "conflict", reason: `tier mismatch ${keeper.tier} vs ${dupe.tier}` };

  // leadUserId
  let leadUserId: string | null;
  if (!keeper.leadUserId) leadUserId = dupe.leadUserId;
  else if (!dupe.leadUserId) leadUserId = keeper.leadUserId;
  else if (keeper.leadUserId === dupe.leadUserId) leadUserId = keeper.leadUserId;
  else
    return {
      kind: "conflict",
      reason: `lead mismatch ${keeper.leadUserId} vs ${dupe.leadUserId}`,
    };

  let comments: string | null;
  if (keeper.comments && dupe.comments) comments = `${keeper.comments}\n\n---\n\n${dupe.comments}`;
  else comments = keeper.comments ?? dupe.comments;

  return {
    kind: "ok",
    merged: {
      tier,
      leadUserId,
      ccUserIds: unionUuids(keeper.ccUserIds, dupe.ccUserIds),
      calledAt: laterDate(keeper.calledAt, dupe.calledAt),
      omSentAt: laterDate(keeper.omSentAt, dupe.omSentAt),
      offerReceivedAt: laterDate(keeper.offerReceivedAt, dupe.offerReceivedAt),
      confiSignedAt: laterDate(keeper.confiSignedAt, dupe.confiSignedAt),
      comments,
    },
  };
}

// Optional manual pairs to merge that don't normalize to the same string
// via lower(trim()) — e.g. "DR Horton" vs "D.R. Horton". The script
// merges every member of each pair into one builder using the same
// keeper-selection + merge logic as the auto-detected groups.
const MANUAL_PAIRS: { names: string[] }[] = [{ names: ["DR Horton", "D.R. Horton"] }];

async function main() {
  // Pull every builder once, group in JS. At Lakebridge scale (dozens
  // of rows per org) this is cheaper than the cross-driver dance to
  // get db.execute aggregations typed right.
  const allBuilders = await db.select().from(builders);

  type GroupKey = string;
  const groupKey = (orgId: string, name: string): GroupKey =>
    `${orgId}::${name.trim().toLowerCase()}`;

  const byKey = new Map<GroupKey, typeof allBuilders>();
  for (const b of allBuilders) {
    const k = groupKey(b.orgId, b.name);
    const arr = byKey.get(k) ?? [];
    arr.push(b);
    byKey.set(k, arr);
  }

  // Auto-detected groups (case-insensitive trim collision).
  const autoGroups = Array.from(byKey.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([k, rows]) => ({ key: k, norm: k.split("::")[1], ids: rows.map((r) => r.id) }));

  // Manual pair groups: look up builders matching one of the names
  // (case-insensitive, trimmed). All matches across the same org get
  // merged into one group.
  const manualGroups: { key: string; norm: string; ids: string[] }[] = [];
  for (const pair of MANUAL_PAIRS) {
    const wanted = new Set(pair.names.map((n) => n.trim().toLowerCase()));
    const matches = allBuilders.filter((b) => wanted.has(b.name.trim().toLowerCase()));
    const byOrg = new Map<string, typeof matches>();
    for (const m of matches) {
      const arr = byOrg.get(m.orgId) ?? [];
      arr.push(m);
      byOrg.set(m.orgId, arr);
    }
    for (const [orgId, rows] of byOrg.entries()) {
      if (rows.length < 2) continue;
      manualGroups.push({
        key: `${orgId}::manual::${pair.names.join("|")}`,
        norm: pair.names.join(" | "),
        ids: rows.map((r) => r.id),
      });
    }
  }

  // De-dupe so a builder that matches both an auto group and a manual
  // pair only gets merged once. Manual takes priority because it's
  // explicit.
  const seenIds = new Set<string>();
  const groupRows: { key: string; norm: string; ids: string[] }[] = [];
  for (const g of manualGroups) {
    groupRows.push(g);
    for (const id of g.ids) seenIds.add(id);
  }
  for (const g of autoGroups) {
    const remaining = g.ids.filter((id) => !seenIds.has(id));
    if (remaining.length < 2) continue;
    groupRows.push({ ...g, ids: remaining });
    for (const id of remaining) seenIds.add(id);
  }

  if (groupRows.length === 0) {
    console.log("No duplicate builders. Nothing to do.");
    return;
  }

  console.log(`Found ${groupRows.length} duplicate group(s):\n`);

  let totalMerges = 0;
  let totalRepoints = 0;
  let totalContactRepoints = 0;
  let totalDuplicatesDeleted = 0;
  const conflicts: { group: string; reason: string }[] = [];

  type Plan = {
    keeper: BuilderInfo;
    dupes: BuilderInfo[];
    merges: { dupeRow: DealBuyerRow; keeperRow: DealBuyerRow; merged: MergedRow }[];
    repoints: DealBuyerRow[];
    contactRepointsFromDupeIds: string[];
    skipped: boolean;
  };
  const plans: Plan[] = [];

  for (const g of groupRows) {
    const ids: string[] = g.ids;
    const infos = await Promise.all(ids.map((id) => loadBuilderInfo(id)));
    const sortedByMerit = [...infos].sort((a, b) => {
      if (b.contactCount !== a.contactCount) return b.contactCount - a.contactCount;
      if (b.dealBuyerRows.length !== a.dealBuyerRows.length)
        return b.dealBuyerRows.length - a.dealBuyerRows.length;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const keeper = sortedByMerit[0];
    const dupes = sortedByMerit.slice(1);

    console.log(`  group "${g.norm}"  (${ids.length} rows)`);
    for (const info of infos) {
      const marker = info.id === keeper.id ? "★ keeper" : "  dupe  ";
      console.log(
        `    ${marker} ${info.id} "${info.name}" contacts=${info.contactCount} deal_buyers=${info.dealBuyerRows.length} created=${info.createdAt.toISOString().slice(0, 10)}`,
      );
    }

    const plan: Plan = {
      keeper,
      dupes,
      merges: [],
      repoints: [],
      contactRepointsFromDupeIds: dupes.map((d) => d.id),
      skipped: false,
    };

    for (const dupe of dupes) {
      for (const dupeRow of dupe.dealBuyerRows) {
        const keeperRow = keeper.dealBuyerRows.find((r) => r.dealId === dupeRow.dealId);
        if (keeperRow) {
          const outcome = mergeRows(keeperRow, dupeRow);
          if (outcome.kind === "conflict") {
            conflicts.push({
              group: g.norm,
              reason: `deal "${dupeRow.dealName}" (${dupeRow.dealId}): ${outcome.reason}`,
            });
            plan.skipped = true;
          } else {
            plan.merges.push({ dupeRow, keeperRow, merged: outcome.merged });
          }
        } else {
          plan.repoints.push(dupeRow);
        }
      }
    }

    if (!plan.skipped) {
      console.log(
        `    plan: ${plan.merges.length} merge(s), ${plan.repoints.length} re-point(s), repoint contacts from ${plan.contactRepointsFromDupeIds.length} dupe(s), delete ${dupes.length} dupe builder(s).`,
      );
    } else {
      console.log("    SKIP: see conflicts below.");
    }
    plans.push(plan);
    console.log();
  }

  if (conflicts.length > 0) {
    console.log("Conflicts (skipping their groups):");
    for (const c of conflicts) console.log(`  [${c.group}] ${c.reason}`);
    console.log();
  }

  const actionable = plans.filter((p) => !p.skipped);
  if (actionable.length === 0) {
    console.log("Nothing applicable. Resolve conflicts manually and re-run.");
    return;
  }

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to execute.");
    return;
  }

  await db.transaction(async (tx) => {
    for (const plan of actionable) {
      for (const m of plan.merges) {
        await tx.update(dealBuyers).set(m.merged).where(eq(dealBuyers.id, m.keeperRow.id));
        await tx.delete(dealBuyers).where(eq(dealBuyers.id, m.dupeRow.id));
        totalMerges++;
      }
      if (plan.repoints.length > 0) {
        await tx
          .update(dealBuyers)
          .set({ builderId: plan.keeper.id })
          .where(
            inArray(
              dealBuyers.id,
              plan.repoints.map((r) => r.id),
            ),
          );
        totalRepoints += plan.repoints.length;
      }
      if (plan.contactRepointsFromDupeIds.length > 0) {
        // Count contacts about to be re-pointed before the UPDATE
        // (avoids .returning() driver-shape differences).
        const before = await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(inArray(contacts.builderId, plan.contactRepointsFromDupeIds));
        await tx
          .update(contacts)
          .set({ builderId: plan.keeper.id })
          .where(inArray(contacts.builderId, plan.contactRepointsFromDupeIds));
        totalContactRepoints += before.length;
      }
      await tx.delete(builders).where(
        inArray(
          builders.id,
          plan.dupes.map((d) => d.id),
        ),
      );
      totalDuplicatesDeleted += plan.dupes.length;
    }
  });

  console.log(
    `Done. merges=${totalMerges}, repoints=${totalRepoints}, contact-repoints=${totalContactRepoints}, deleted builders=${totalDuplicatesDeleted}.`,
  );
  if (conflicts.length > 0) console.log("(Conflict groups were skipped — resolve manually.)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
