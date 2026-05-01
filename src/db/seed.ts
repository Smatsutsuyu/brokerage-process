// .env.local is loaded by `tsx --env-file=.env.local` before any imports run.
// See package.json db:seed script.
import { eq, inArray, sql } from "drizzle-orm";

import { auth } from "@/lib/auth/auth";

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

  console.log(
    `Creating Chris's auth account (sign in locally with cshiota@lakebridgecap.com / ${DEV_PASSWORD})...`,
  );
  // Use Better Auth's API so the password gets hashed correctly (rather than
  // hand-inserting into auth_account ourselves).
  const signUpResult = await auth.api.signUpEmail({
    body: {
      name: "Chris Shiota",
      email: "cshiota@lakebridgecap.com",
      password: DEV_PASSWORD,
    },
  });

  const [chris] = await db
    .insert(schema.users)
    .values({
      orgId: org.id,
      authUserId: signUpResult.user.id,
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

  console.log("Seeding checklist (all four phases per CLAUDE.md, hierarchical)...");
  // Items are CLAUDE.md verbatim. Phase 1 uses the category groupings the
  // discovery section sketches (Valuation, Third Party Marketing Reports,
  // Marketing Documents, plus Listing & Buyer Setup and Underwriting & OM
  // for items not covered by Chris's sketched categories). Phases 2-4 use a
  // single "Items" bucket since CLAUDE.md doesn't break them down further;
  // categories can be added per Chris's preference later without schema work.
  const phaseSpec: Array<{
    phase: "phase_1" | "phase_2" | "phase_3" | "phase_4";
    categories: Array<{ name: string; items: Array<string | { name: string; optional?: boolean }> }>;
  }> = [
    {
      phase: "phase_1",
      categories: [
        {
          name: "Listing & Buyer Setup",
          items: ["Listing Agreement", "Initial List of Potential Buyers"],
        },
        {
          name: "Third Party Marketing Reports",
          items: [
            "HOA Budget",
            "Cost to Complete",
            "CFD Analysis",
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
            "Entitlement Schedule",
            { name: "Development Schedule", optional: true },
            "Entitlement Summary",
          ],
        },
        {
          name: "Underwriting & OM",
          items: [
            "Custom Underwriting File for Deal",
            "Offering Memorandum",
            "Marketing Report (Green/Yellow/Red buyer categorization)",
            "Determine PSA Attorney (drafting preference)",
          ],
        },
      ],
    },
    {
      phase: "phase_2",
      categories: [
        {
          name: "Items",
          items: [
            "Send out OM / Blast (personalized by buyer tier)",
            "Request In-Person Meeting with Top (Green) Buyers",
            "Coordinate a Q&A File",
            "Send out Q&A File",
            { name: "Share Market Study", optional: true },
            "Email Notification of Offers Due (X days before)",
            "Day-of Reminder",
            "Automated follow-up to Green & Yellow buyers whose offers haven't come in",
          ],
        },
      ],
    },
    {
      phase: "phase_3",
      categories: [
        {
          name: "Items",
          items: [
            "Schedule Meeting with Ownership",
            "Create Initial Summary (send out as received)",
            "Review Underwriting Sheets for clarification",
            "Run LOI through AI → SOO Matrix",
            "Run UW Sheets through AI → Revenue Charts & UW Summary",
            "PDF everything together",
            "Create Recommendation memo (Pro/Con of each offer)",
          ],
        },
      ],
    },
    {
      phase: "phase_4",
      categories: [
        {
          name: "Items",
          items: [
            "Share All Due Diligence",
            "Kick Off PSA",
            "Kickoff Call",
            "Bi-Weekly Meeting Schedule for DD",
            "Determine CTC Date",
            "Issues Tracking Sheet (living document)",
            "Consultant Roster",
          ],
        },
      ],
    },
  ];

  for (const deal of [riverside, lakeview]) {
    let phaseIdx = 0;
    for (const spec of phaseSpec) {
      for (const [catIdx, cat] of spec.categories.entries()) {
        const [category] = await db
          .insert(schema.checklistCategories)
          .values({
            orgId: org.id,
            dealId: deal.id,
            phase: spec.phase,
            name: cat.name,
            sortOrder: phaseIdx * 100 + catIdx,
          })
          .returning();

        const itemRows = cat.items.map((it, idx) => {
          const base = { orgId: org.id, categoryId: category.id, sortOrder: idx };
          return typeof it === "string"
            ? { ...base, name: it }
            : { ...base, name: it.name, optional: it.optional ?? false };
        });
        await db.insert(schema.checklistItems).values(itemRows);
      }
      phaseIdx++;
    }

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
