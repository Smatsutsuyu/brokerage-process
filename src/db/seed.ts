// .env.local is loaded by `tsx --env-file=.env.local` before any imports run.
// See package.json db:seed script.
import { eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "./index";

async function main() {
  console.log("Wiping existing data...");
  // Order matters for FK cascade. Truncate everything; identity columns reset.
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
    organizations
    RESTART IDENTITY CASCADE`);

  console.log("Seeding organization + user...");
  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: "org_dev_lakebridge",
      name: "Lakebridge Capital",
      slug: "lakebridge",
    })
    .returning();

  const [chris] = await db
    .insert(schema.users)
    .values({
      orgId: org.id,
      clerkUserId: "user_dev_chris",
      email: "cshiota@lakebridgecap.com",
      firstName: "Chris",
      lastName: "Shiota",
      role: "owner",
    })
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
      builderId: builderRows[1].id,
      firstName: "Sarah",
      lastName: "Pham",
      title: "Director of Land",
      email: "spham@tollbrothers.com",
      phone: "(949) 555-0102",
    },
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
        status: "phase_2",
        priority: "high",
      },
      {
        orgId: org.id,
        name: "Lakeview Heights",
        units: 86,
        city: "Temecula",
        state: "CA",
        type: "Paper lots",
        status: "phase_1",
        priority: "medium",
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

  console.log("Seeding checklist (Phase 1)...");
  // Categorize Phase 1 items per CLAUDE.md hierarchical structure.
  const phase1Categories = [
    {
      name: "Listing & Buyer Setup",
      items: ["Listing Agreement", "Initial List of Potential Buyers"],
    },
    {
      name: "Third Party Marketing Reports",
      items: [
        { name: "HOA Budget" },
        { name: "Cost to Complete (CTC)" },
        { name: "CFD Analysis" },
        { name: "Market Study", optional: true },
      ],
    },
    {
      name: "Valuation",
      items: ["Premium Analysis", "Valuation"],
    },
    {
      name: "Marketing Documents",
      items: [
        { name: "Entitlement Schedule" },
        { name: "Development Schedule", optional: true },
        { name: "Entitlement Summary" },
      ],
    },
    {
      name: "Underwriting & OM",
      items: [
        "Custom Underwriting File for Deal",
        "Offering Memorandum",
        "Marketing Report (Green/Yellow/Red)",
        "Determine PSA Attorney",
      ],
    },
  ];

  for (const deal of [riverside, lakeview]) {
    for (const [catIdx, cat] of phase1Categories.entries()) {
      const [category] = await db
        .insert(schema.checklistCategories)
        .values({
          orgId: org.id,
          dealId: deal.id,
          phase: "phase_1",
          name: cat.name,
          sortOrder: catIdx,
        })
        .returning();

      const itemRows = cat.items.map((it, idx) => {
        if (typeof it === "string") {
          return { orgId: org.id, categoryId: category.id, name: it, sortOrder: idx };
        }
        return {
          orgId: org.id,
          categoryId: category.id,
          name: it.name,
          optional: it.optional ?? false,
          sortOrder: idx,
        };
      });
      await db.insert(schema.checklistItems).values(itemRows);
    }

    // Mark a few items complete on Riverside so the progress bar isn't 0%.
    if (deal.id === riverside.id) {
      const all = await db
        .select({ id: schema.checklistItems.id, name: schema.checklistItems.name })
        .from(schema.checklistItems)
        .innerJoin(
          schema.checklistCategories,
          eq(schema.checklistItems.categoryId, schema.checklistCategories.id),
        )
        .where(eq(schema.checklistCategories.dealId, riverside.id));
      const toComplete = all
        .filter((i) =>
          [
            "Listing Agreement",
            "Initial List of Potential Buyers",
            "HOA Budget",
            "Cost to Complete (CTC)",
            "Premium Analysis",
            "Offering Memorandum",
          ].includes(i.name),
        )
        .map((i) => i.id);
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
