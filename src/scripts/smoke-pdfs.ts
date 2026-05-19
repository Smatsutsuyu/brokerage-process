// One-shot smoke test: render Due Diligence Tracking + Q&A PDFs to
// disk so we can eyeball the LAO theme without round-tripping through
// the dev server. Throwaway, left in src/scripts so it's git-tracked
// next to the other dev tools.

import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync } from "node:fs";

import { DdTrackingDoc } from "../lib/pdf/dd-tracking";
import { QaFileDoc } from "../lib/pdf/qa-file";

async function main() {
  const ddBuf = await renderToBuffer(
    DdTrackingDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "May 13, 2026",
      milestones: [
        { label: "LOI Signed Date", date: "May 1, 2026", completed: true },
        { label: "PSA Effective Date", date: "May 12, 2026", completed: true },
        { label: "Receive 1st Draft Cost to Complete", date: "Jun 1, 2026", completed: false },
        { label: "Finalize Cost to Complete / Final Purchase Price", date: null, completed: false },
        { label: "Investment Committee Approval", date: null, completed: false },
        { label: "Waive Feasibility", date: null, completed: false },
        { label: "Closing Date", date: "Aug 30, 2026", completed: false },
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
}

main().catch((e) => {
  console.log("ERR:", e instanceof Error ? e.message : e);
  if (e instanceof Error) console.log(e.stack);
  process.exit(1);
});
