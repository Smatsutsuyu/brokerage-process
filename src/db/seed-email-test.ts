// Additive seed for reproducing the Resend rate-limit issue locally.
//
// Unlike seed.ts (which TRUNCATEs everything), this script is additive:
// it layers a dedicated test deal + N builders onto the EXISTING org so
// you don't lose your demo data. Re-running it cleans up its own prior
// artifacts first (matched by the RL_PREFIX name), then recreates.
//
// Every contact uses a Gmail subaddress — seanesparza+rlN@gmail.com —
// which all deliver to seanesparza@gmail.com, so one inbox receives the
// whole blast. The "+modifier" part is ignored by Gmail's routing but
// kept distinct so each builder's email is a unique To: address.
//
// Each builder = one outbound email (per-builder grouping in the
// composer), so BUILDER_COUNT controls how many Resend requests a single
// blast fires. 6 is the default; bump it if 6 doesn't reliably trip the
// per-second cap on your account (latency-dependent — see blast.ts).
//
// Usage:
//   npm run db:seed              # normal demo data first (if fresh DB)
//   npm run db:seed:email-test   # layer in the rate-limit test deal
//
// Then open the "RL Test — Rate Limit" deal, go to a Phase 2 row with a
// blast button (e.g. Confidentiality Agreement → "Send CA"), and send.
// Watch the dev server console for the per-send timing logs in blast.ts
// and any `[email:api-error] … rate_limit_exceeded` lines.
//
// Requires a real RESEND_API_KEY in .env.local — without it sendEmail
// no-ops and you won't reach Resend's limiter.

import { and, eq, inArray, like } from "drizzle-orm";

import { seedChecklistForDeal } from "./seed-checklist";
import { db, schema } from "./index";

// Builders = outbound emails per blast. Bump to fire more requests.
const BUILDER_COUNT = 6;
// Name prefix so the script can find + clean up its own artifacts on
// re-run without touching real demo data.
const RL_PREFIX = "RL Test —";
const DEAL_NAME = `${RL_PREFIX} Rate Limit`;

async function main() {
  const [org] = await db.select().from(schema.organizations).limit(1);
  if (!org) {
    throw new Error("No organization found. Run `npm run db:seed` first.");
  }

  // Lead user = first owner in the org (for the lead-assignment filter on
  // the blast composer; not strictly required since the default filter is
  // "anyone", but realistic).
  const [lead] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.orgId, org.id), eq(schema.users.role, "owner")))
    .limit(1);

  // --- Clean up any prior run -------------------------------------------
  console.log("Cleaning up prior RL test artifacts (if any)...");
  const priorDeals = await db
    .select({ id: schema.deals.id })
    .from(schema.deals)
    .where(and(eq(schema.deals.orgId, org.id), eq(schema.deals.name, DEAL_NAME)));
  const priorDealIds = priorDeals.map((d) => d.id);

  const priorBuilders = await db
    .select({ id: schema.builders.id })
    .from(schema.builders)
    .where(and(eq(schema.builders.orgId, org.id), like(schema.builders.name, `${RL_PREFIX}%`)));
  const priorBuilderIds = priorBuilders.map((b) => b.id);

  await db.transaction(async (tx) => {
    if (priorDealIds.length > 0) {
      // deal_contacts / deal_buyers / checklist cascade on deal delete.
      await tx.delete(schema.deals).where(inArray(schema.deals.id, priorDealIds));
    }
    if (priorBuilderIds.length > 0) {
      // Contacts reference builders; delete contacts first, then builders.
      await tx
        .delete(schema.contacts)
        .where(inArray(schema.contacts.builderId, priorBuilderIds));
      await tx.delete(schema.builders).where(inArray(schema.builders.id, priorBuilderIds));
    }
  });

  // --- Create fresh ------------------------------------------------------
  console.log(`Creating test deal "${DEAL_NAME}"...`);
  const [deal] = await db
    .insert(schema.deals)
    .values({
      orgId: org.id,
      name: DEAL_NAME,
      units: 100,
      city: "Testville",
      state: "CA",
      type: "Finished lots",
      priority: "normal",
    })
    .returning();

  console.log(`Creating ${BUILDER_COUNT} builders + contacts (seanesparza+rlN@gmail.com)...`);
  for (let i = 1; i <= BUILDER_COUNT; i++) {
    const [builder] = await db
      .insert(schema.builders)
      .values({
        orgId: org.id,
        name: `${RL_PREFIX} Builder ${i}`,
        classification: i % 2 === 0 ? "public" : "private",
      })
      .returning();

    const [contact] = await db
      .insert(schema.contacts)
      .values({
        orgId: org.id,
        builderId: builder.id,
        firstName: "Test",
        lastName: `Buyer ${i}`,
        title: "Land Acquisition",
        email: `seanesparza+rl${i}@gmail.com`,
        // receivesCommunication defaults true — leave it so the blast
        // filter includes them.
      })
      .returning();

    // deal_buyers: green tier so the default green/yellow blast filter
    // picks them up. Lead assigned when an owner exists.
    await db.insert(schema.dealBuyers).values({
      orgId: org.id,
      dealId: deal.id,
      builderId: builder.id,
      tier: "green",
      leadUserId: lead?.id ?? null,
    });

    // deal_contacts: required for the contact to surface as a blast
    // recipient (presence on the deal is this table's responsibility).
    await db.insert(schema.dealContacts).values({
      orgId: org.id,
      dealId: deal.id,
      contactId: contact.id,
    });
  }

  console.log("Seeding checklist so the Phase 2 blast buttons appear...");
  await seedChecklistForDeal(db, { orgId: org.id, dealId: deal.id });

  console.log("Done.");
  console.log(`\nOpen the "${DEAL_NAME}" deal, Phase 2 → Confidentiality Agreement → "Send CA".`);
  console.log(`All ${BUILDER_COUNT} emails route to seanesparza@gmail.com via + subaddressing.`);
  console.log("Watch the dev console for per-send timing + any rate_limit_exceeded errors.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
