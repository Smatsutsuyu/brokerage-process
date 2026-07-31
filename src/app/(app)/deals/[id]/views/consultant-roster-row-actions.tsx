"use client";

import { ConsultantRosterPdfButton } from "./consultant-roster-pdf-button";
import { SendConsultantRosterButton } from "./send-consultant-roster-button";

type ConsultantRosterRowActionsProps = {
  dealId: string;
};

// Pair of actions on the Phase 4 "Create Consultant Roster & Send Out"
// row. The tab-link to the Consultants tab is already rendered via the
// linksTo lookup on the row; this component adds:
//   1. Generate PDF -> opens the Consultant Roster PDF (13 roles, firms
//      grouped by role with buyer/seller side and contact details).
//   2. Send to Deal Team -> two-step modal: preview that same PDF, then
//      compose the email with it attached.
//
// Mirrors DdTrackingRowActions on the sibling Phase 4 row.
export function ConsultantRosterRowActions({
  dealId,
}: ConsultantRosterRowActionsProps) {
  return (
    <>
      <ConsultantRosterPdfButton dealId={dealId} variant="compact" />
      <SendConsultantRosterButton dealId={dealId} />
    </>
  );
}
