// One-shot smoke test: render Issues + Q&A PDFs to disk so we can eyeball
// the LAO theme without round-tripping through the dev server. Throwaway
// — left in src/scripts so it's git-tracked next to the other dev tools.

import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync } from "node:fs";

import { IssuesReportDoc } from "../lib/pdf/issues-report";
import { QaFileDoc } from "../lib/pdf/qa-file";

async function main() {
  const issuesBuf = await renderToBuffer(
    IssuesReportDoc({
      dealName: "Riverside Estates Phase 2",
      dateLabel: "May 13, 2026",
      rows: [
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
    }),
  );
  writeFileSync("c:/tmp/issues-report-smoke.pdf", issuesBuf);
  console.log("issues:", issuesBuf.length, "bytes");

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
