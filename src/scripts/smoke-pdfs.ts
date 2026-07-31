// One-shot smoke test: render Due Diligence Tracking + Q&A + Consultant
// Roster PDFs to disk so we can eyeball the LAO theme without round-
// tripping through the dev server. Throwaway, left in src/scripts so
// it's git-tracked next to the other dev tools.
//
// Run: npx tsx src/scripts/smoke-pdfs.ts

import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync } from "node:fs";

import { ConsultantRosterDoc } from "../lib/pdf/consultant-roster";
import { DdTrackingDoc } from "../lib/pdf/dd-tracking";
import { QaFileDoc } from "../lib/pdf/qa-file";

async function main() {
  const ddBuf = await renderToBuffer(
    DdTrackingDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "May 13, 2026",
      purchasePrice: 24500000,
      milestones: [
        { label: "LOI Signed Date", date: "May 1, 2026", completed: true, hasHappened: true },
        { label: "PSA Effective Date", date: "May 12, 2026", completed: true, hasHappened: true },
        { label: "Receive 1st Draft Cost to Complete", date: "Jun 1, 2026", completed: false, hasHappened: false },
        { label: "Finalize Cost to Complete / Final Purchase Price", date: null, completed: false, hasHappened: false },
        { label: "Investment Committee Approval", date: null, completed: false, hasHappened: false },
        { label: "Waive Feasibility", date: null, completed: false, hasHappened: false },
        { label: "Closing Date", date: "Aug 30, 2026", completed: false, hasHappened: false },
      ],
      issues: [
        {
          title: "Soils report needs amendment",
          description: "Civil engineer flagged an inconsistency in the percolation table.",
          status: "open",
          priority: "high",
          assignedName: "Chris Shiota",
          identifiedDate: "May 5, 2026",
        },
        {
          title: "HOA documents incomplete",
          description: null,
          status: "in_progress",
          priority: "medium",
          assignedName: "Chris Shiota",
          identifiedDate: "May 5, 2026",
        },
        {
          title: "Title commitment received",
          description: "Reviewed and shared with buyer counsel.",
          status: "resolved",
          priority: "low",
          assignedName: null,
          identifiedDate: "Apr 28, 2026",
        },
      ],
      team: [
        {
          team: "owner",
          name: "Pat Owens",
          roleLabel: "Owner",
          email: "pat@example.com",
          phone: "(949) 555-0101",
        },
        {
          team: "broker",
          name: "Chris Shiota",
          roleLabel: "Lead Broker",
          email: "cshiota@lakebridgecap.com",
          phone: "(949) 555-0102",
        },
      ],
      consultants: [
        {
          roleLabel: "Civil Engineer",
          side: "seller",
          firmName: "Hunsaker & Associates",
          contactName: "Jane Doe",
          contactEmail: "jane@hunsaker.example",
          contactPhone: "(949) 555-0200",
        },
      ],
    }),
  );
  writeFileSync("c:/tmp/dd-tracking-smoke.pdf", ddBuf);
  console.log("dd-tracking:", ddBuf.length, "bytes");

  const qaBuf = await renderToBuffer(
    QaFileDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "May 13, 2026",
      rows: [
        {
          question: "What is the current entitlement status of the property?",
          answer: "Tentative Map approved March 2026. Final Map expected Q4 2026.",
        },
        {
          question: "Are there any outstanding CFD obligations?",
          answer:
            "Yes. CFD 2018-1 levies an annual special tax of approximately $2,400 per unit, escalating 2% per year.",
        },
        {
          question: "What is the timeline for grading permit issuance?",
          answer: null,
        },
      ],
    }),
  );
  writeFileSync("c:/tmp/qa-file-smoke.pdf", qaBuf);
  console.log("q&a:", qaBuf.length, "bytes");

  const rosterBuf = await renderToBuffer(
    ConsultantRosterDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "July 30, 2026",
      dealSubtitle: "182 units · Single Family Detached · Riverside, CA",
      filledCount: 5,
      totalRoles: 13,
      groups: [
        {
          roleLabel: "Landscape Architect",
          entries: [
            {
              side: "seller",
              firmName: "Summers / Murphy & Partners",
              contactName: "Dana Reyes",
              contactEmail: "dreyes@summersmurphy.example",
              contactPhone: "(949) 555-0310",
            },
          ],
        },
        {
          roleLabel: "Civil Engineer",
          entries: [
            {
              side: "seller",
              firmName: "Hunsaker & Associates",
              contactName: "Jane Doe",
              contactEmail: "jane.doe@hunsaker.example",
              contactPhone: "(949) 555-0200",
            },
            {
              side: "buyer",
              firmName: "Fuscoe Engineering",
              contactName: "Marcus Webb",
              contactEmail: "mwebb@fuscoe.example",
              contactPhone: null,
            },
          ],
        },
        {
          roleLabel: "Soils Engineer",
          entries: [
            {
              side: "seller",
              firmName: "Leighton Consulting",
              contactName: null,
              contactEmail: "info@leighton.example",
              contactPhone: "(714) 555-0144",
            },
          ],
        },
        {
          roleLabel: "Cost to Complete Consultant",
          entries: [
            {
              side: "seller",
              firmName: "Pacific Coast Cost Management Group",
              contactName: "Alex Trinh",
              contactEmail: "atrinh@pccmg.example",
              contactPhone: "(760) 555-0187",
            },
          ],
        },
        {
          roleLabel: "PSA Attorney",
          entries: [
            {
              side: "seller",
              firmName: "Allen Matkins",
              contactName: "Priya Nandakumar",
              contactEmail: "pnandakumar@allenmatkins.example",
              contactPhone: "(949) 555-0455",
            },
            {
              side: "buyer",
              firmName: "Cox Castle & Nicholson",
              contactName: "R. Whitfield",
              contactEmail: null,
              contactPhone: "(310) 555-0166",
            },
          ],
        },
      ],
      unfilledRoleLabels: [
        "HOA Consultant",
        "Dry Utility Consultant",
        "Phase I Environmental Consultant",
        "Land Use Consultant",
        "Biologist",
        "Architect",
        "Title Consultant",
        "Escrow Consultant",
      ],
    }),
  );
  writeFileSync("c:/tmp/consultant-roster-smoke.pdf", rosterBuf);
  console.log("consultant-roster:", rosterBuf.length, "bytes");

  // Page-break stress case. Sized so section headers and subsection bands
  // land near page boundaries, which is what surfaced the stranded
  // "SOILS ENGINEER" band that the Section helper in dd-tracking.tsx now
  // prevents. Check every page: no heading may sit without a row under it.
  const stressBuf = await renderToBuffer(
    DdTrackingDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "July 31, 2026",
      purchasePrice: 24500000,
      milestones: [
        { label: "LOI Signed Date", date: "May 1, 2026", completed: true, hasHappened: true },
        { label: "PSA Effective Date", date: "May 12, 2026", completed: true, hasHappened: true },
        { label: "Receive 1st Draft Cost to Complete", date: "Jun 1, 2026", completed: false, hasHappened: false },
        { label: "Finalize Cost to Complete / Final Purchase Price", date: null, completed: false, hasHappened: false },
        { label: "Investment Committee Approval", date: null, completed: false, hasHappened: false },
        { label: "Waive Feasibility", date: null, completed: false, hasHappened: false },
        { label: "Closing Date", date: "Aug 30, 2026", completed: false, hasHappened: false },
      ],
      issues: Array.from({ length: 14 }, (_, i) => ({
        title: `Issue ${i + 1} needing resolution before the next call`,
        description:
          i % 3 === 0 ? "Longer description line that pushes the row height up a bit." : null,
        status: (["open", "in_progress", "resolved"] as const)[i % 3],
        priority: (["urgent", "high", "medium", "low"] as const)[i % 4],
        assignedName: i % 2 === 0 ? "Chris Shiota" : null,
        identifiedDate: "May 5, 2026",
      })),
      team: Array.from({ length: 9 }, (_, i) => ({
        team: (["owner", "broker", "buyer"] as const)[i % 3],
        name: `Team Member ${i + 1}`,
        roleLabel: "Role Label",
        email: `member${i + 1}@example.com`,
        phone: "(949) 555-0100",
      })),
      consultants: Array.from({ length: 8 }, (_, i) => ({
        roleLabel: [
          "Landscape Architect",
          "Civil Engineer",
          "Soils Engineer",
          "HOA Consultant",
          "Dry Utility Consultant",
          "Architect",
          "PSA Attorney",
          "Title Consultant",
        ][i],
        side: (i % 2 === 0 ? "seller" : "buyer") as "seller" | "buyer",
        firmName: `Consulting Firm ${i + 1} & Partners LLP`,
        contactName: `Contact ${i + 1}`,
        contactEmail: `c${i + 1}@firm.example`,
        contactPhone: "(949) 555-0200",
      })),
    }),
  );
  writeFileSync("c:/tmp/dd-tracking-stress-smoke.pdf", stressBuf);
  console.log("dd-tracking (page-break stress):", stressBuf.length, "bytes");
}

main().catch((e) => {
  console.log("ERR:", e instanceof Error ? e.message : e);
  if (e instanceof Error) console.log(e.stack);
  process.exit(1);
});
