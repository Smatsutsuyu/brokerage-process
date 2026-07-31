"use client";

import { Send } from "lucide-react";

import { SHARE_DD_MATERIAL_TEMPLATE } from "@/lib/email-templates";

import { DealTeamSendButton } from "./deal-team-send-button";

type ShareDdMaterialRowActionsProps = {
  dealId: string;
  // The checklist row this renders on. Passed to the ddFolderUrl lookup
  // so a link pasted on this row takes priority over the canonical
  // Phase 1 DD Dropbox Folder row.
  itemId: string;
};

// Phase 4 "Share Due Diligence Material / Set Meeting" row. Matches
// Excel: emails the DD folder link + meeting prompt to the Deal Team.
// Only this row — "Create Index of Due Diligence Material" is a
// do-the-work step, not a send surface.
//
// {{ddFolderUrl}} resolves server-side on click from two sources, in
// order: a link on this row, else a link on the Phase 1 "Create Full Due
// Diligence Dropbox Folder" row. If neither has one the composer refuses
// to open and the button surfaces an inline rejection — better than
// shipping a literal "{{ddFolderUrl}}" to the client, which is what
// happened before this gate existed.
export function ShareDdMaterialRowActions({
  dealId,
  itemId,
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
      requireVars={["ddFolderUrl"]}
      sourceItemId={itemId}
    />
  );
}
