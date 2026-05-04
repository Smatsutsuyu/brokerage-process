// .env.local is loaded by `tsx --env-file=.env.local` before any imports run.
// See package.json db:seed script.
import { eq, inArray, sql } from "drizzle-orm";

import { auth } from "@/lib/auth/auth";

import { seedChecklistForDeal } from "./checklist-template";
import { db, schema } from "./index";

const DEV_PASSWORD = "lakebridge-dev-password";

async function main() {
  console.log("Wiping existing data...");
  // Order matters for FK cascade. Truncate everything; identity columns reset.
  // Auth tables are wiped too so we can re-create Chris's account fresh.
  await db.execute(sql`TRUNCATE TABLE
    audit_log,
    documents,
    consultants,
    issues,
    qa_items,
    checklist_item_dependencies,
    checklist_items,
    checklist_categories,
    deal_buyers,
    contacts,
    builders,
    deals,
    users,
    organizations,
    auth_session,
    auth_account,
    auth_verification,
    auth_user
    RESTART IDENTITY CASCADE`);

  console.log("Seeding organization...");
  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: "org_dev_lakebridge",
      name: "Lakebridge Capital",
      slug: "lakebridge",
    })
    .returning();

  console.log("Creating dev auth accounts...");
  console.log(`  - cshiota@lakebridgecap.com / ${DEV_PASSWORD}`);
  console.log("  - seanesparza@gmail.com / Abcd1234!");
  // Use Better Auth's API so passwords get hashed correctly (rather than
  // hand-inserting into auth_account ourselves).
  const chrisAuth = await auth.api.signUpEmail({
    body: {
      name: "Chris Shiota",
      email: "cshiota@lakebridgecap.com",
      password: DEV_PASSWORD,
    },
  });

  const seanAuth = await auth.api.signUpEmail({
    body: {
      name: "Sean Esparza",
      email: "seanesparza@gmail.com",
      password: "Abcd1234!",
    },
  });

  const [chris] = await db
    .insert(schema.users)
    .values([
      {
        orgId: org.id,
        authUserId: chrisAuth.user.id,
        role: "owner",
      },
      {
        orgId: org.id,
        authUserId: seanAuth.user.id,
        role: "owner",
      },
    ])
    .returning();

  console.log("Seeding builders + contacts...");
  const builderRows = await db
    .insert(schema.builders)
    .values([
      { orgId: org.id, name: "Lennar", classification: "public" },
      { orgId: org.id, name: "Toll Brothers", classification: "public" },
      { orgId: org.id, name: "Pulte Homes", classification: "public" },
      { orgId: org.id, name: "Shea Homes", classification: "private" },
      { orgId: org.id, name: "New Home Co.", classification: "private" },
    ])
    .returning();

  await db.insert(schema.contacts).values([
    // Lennar — two contacts (multi-contact case)
    {
      orgId: org.id,
      builderId: builderRows[0].id,
      firstName: "Mark",
      lastName: "Sustana",
      title: "VP of Land Acquisition",
      email: "msustana@lennar.com",
      phone: "(949) 555-0101",
    },
    {
      orgId: org.id,
      builderId: builderRows[0].id,
      firstName: "Jennifer",
      lastName: "Lee",
      title: "Director of Acquisitions",
      email: "jlee@lennar.com",
      phone: "(949) 555-0111",
    },
    // Toll Brothers — two contacts (multi-contact case)
    {
      orgId: org.id,
      builderId: builderRows[1].id,
      firstName: "Sarah",
      lastName: "Pham",
      title: "Director of Land",
      email: "spham@tollbrothers.com",
      phone: "(949) 555-0102",
    },
    {
      orgId: org.id,
      builderId: builderRows[1].id,
      firstName: "Michael",
      lastName: "Chen",
      title: "Senior Land Manager",
      email: "mchen@tollbrothers.com",
      phone: "(949) 555-0112",
    },
    // Shea Homes — one contact
    {
      orgId: org.id,
      builderId: builderRows[3].id,
      firstName: "David",
      lastName: "Kim",
      title: "Land Acquisition Manager",
      email: "dkim@sheahomes.com",
      phone: "(949) 555-0103",
    },
  ]);

  console.log("Seeding deals...");
  const [riverside, lakeview] = await db
    .insert(schema.deals)
    .values([
      {
        orgId: org.id,
        name: "Riverside Estates Phase 2",
        units: 142,
        city: "Riverside",
        state: "CA",
        type: "Finished lots",
        priority: "high",
      },
      {
        orgId: org.id,
        name: "Lakeview Heights",
        units: 86,
        city: "Temecula",
        state: "CA",
        type: "Paper lots",
        priority: "normal",
      },
    ])
    .returning();

  console.log("Seeding deal_buyers...");
  await db.insert(schema.dealBuyers).values([
    { orgId: org.id, dealId: riverside.id, builderId: builderRows[0].id, tier: "green", leadUserId: chris.id },
    { orgId: org.id, dealId: riverside.id, builderId: builderRows[1].id, tier: "yellow", leadUserId: chris.id },
    { orgId: org.id, dealId: riverside.id, builderId: builderRows[2].id, tier: "red" },
    { orgId: org.id, dealId: riverside.id, builderId: builderRows[3].id, tier: "green", leadUserId: chris.id },
    { orgId: org.id, dealId: lakeview.id, builderId: builderRows[0].id, tier: "yellow" },
    { orgId: org.id, dealId: lakeview.id, builderId: builderRows[3].id, tier: "not_selected" },
  ]);

  console.log("Seeding checklist (all four phases per CLAUDE.md, hierarchical)...");
  // Pulled from the shared template module so seed and createDeal can never
  // drift. Edits to the canonical list happen in `checklist-template.ts`.
  for (const deal of [riverside, lakeview]) {
    await seedChecklistForDeal(db, { orgId: org.id, dealId: deal.id });

    // Mark a few Phase 1 items complete on Riverside so progress isn't 0%.
    if (deal.id === riverside.id) {
      const all = await db
        .select({ id: schema.checklistItems.id, name: schema.checklistItems.name })
        .from(schema.checklistItems)
        .innerJoin(
          schema.checklistCategories,
          eq(schema.checklistItems.categoryId, schema.checklistCategories.id),
        )
        .where(eq(schema.checklistCategories.dealId, riverside.id));
      const completedNames = new Set([
        "Listing Agreement",
        "Initial List of Potential Buyers",
        "HOA Budget",
        "Cost to Complete",
        "Premium Analysis",
        "Offering Memorandum",
      ]);
      const toComplete = all.filter((i) => completedNames.has(i.name)).map((i) => i.id);
      if (toComplete.length > 0) {
        await db
          .update(schema.checklistItems)
          .set({ completed: true, completedAt: new Date(), completedBy: chris.id })
          .where(inArray(schema.checklistItems.id, toComplete));
      }
    }
  }

  console.log("Seeding sample Q&A on Riverside...");
  await db.insert(schema.qaItems).values([
    {
      orgId: org.id,
      dealId: riverside.id,
      question: "Are CFD bonds still outstanding for this site?",
      answer: "Yes — approximately $2.4M outstanding. Annual special tax burden is ~$1,850/lot.",
      approved: true,
      approvedAt: new Date(),
      approvedBy: chris.id,
    },
    {
      orgId: org.id,
      dealId: riverside.id,
      question: "Has a phasing plan been recorded?",
      answer: "Recorded TM allows for two phases. Phase 2 grading permit anticipated Q3.",
      approved: false,
    },
  ]);

  console.log("Seeding sample issues on Riverside...");
  await db.insert(schema.issues).values([
    {
      orgId: org.id,
      dealId: riverside.id,
      title: "Soils report needs amendment",
      description:
        "Geotechnical report from 2019 — buyer requesting updated borings on lots 41-58 before LOI.",
      status: "open",
      priority: "high",
      assignedUserId: chris.id,
    },
    {
      orgId: org.id,
      dealId: riverside.id,
      title: "HOA documents incomplete",
      description: "Missing CC&Rs and architectural guidelines.",
      status: "in_progress",
      priority: "medium",
      assignedUserId: chris.id,
    },
  ]);

  console.log("Seeding sample consultants on Riverside...");
  await db.insert(schema.consultants).values([
    {
      orgId: org.id,
      dealId: riverside.id,
      role: "civil_engineer",
      side: "seller",
      firmName: "Hunsaker & Associates",
      contactName: "Jane Doe",
      contactEmail: "jdoe@hunsaker.com",
      contactPhone: "(949) 555-0201",
    },
    {
      orgId: org.id,
      dealId: riverside.id,
      role: "soils_engineer",
      side: "seller",
      firmName: "GeoTek Engineering",
      contactName: "Robert Liu",
      contactEmail: "rliu@geotek.com",
      contactPhone: "(949) 555-0202",
    },
  ]);

  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
