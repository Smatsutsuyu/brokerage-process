"use client";

import { Send } from "lucide-react";

import { SHARE_DD_MATERIAL_TEMPLATE } from "@/lib/email-templates";

import { DealTeamSendButton } from "./deal-team-send-button";

type ShareDdMaterialRowActionsProps = {
  dealId: string;
};

// Phase 4 "Share Due Diligence Material / Set Meeting" row. Matches
// Excel: emails the DD folder link + index to the Deal Team.
//
// The DD folder link itself is captured via the universal Link
// affordance on the same row (Dropbox URL Chris pastes there). At real
// send time we'd inject that into the body's {{ddFolderUrl}} var; for
// now the placeholder lands in the preview and the user can paste the
// URL before mock-sending. Same goes for an attached index file.
export function ShareDdMaterialRowActions({
  dealId,
}: ShareDdMaterialRowActionsProps) {
  return (
    <DealTeamSendButton
      dealId={dealId}
      label="Send to Deal Team"
      title="Email the DD folder link + meeting prompt to the Deal Team"
      icon={Send}
      modalTitle="Share DD Material"
      template={SHARE_DD_MATERIAL_TEMPLATE}
      teams={["owner", "broker", "buyer"]}
      attachments={[]}
    />
  );
}
