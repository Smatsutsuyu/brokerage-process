// Resolve a Deal Team member row to a display name using the polymorphic
// identity chain (user > contact > free-text). Mirrors listDealTeam in
// src/app/(app)/deals/[id]/actions.ts — keep them in sync if either changes.
//
// The Deal Team model supports three identity sources per row: an org user
// (userId FK), an external contact (contactId FK), or a free-text
// name/email/phone snapshot when neither FK is set. This helper takes the
// row shape produced by joining through both FKs and returns the string
// that should be shown to the user.
//
// Consumed by: issues-view.tsx (assignee picker options + assigneeName),
// dd-tracking.pdf/route.ts (PDF assignee column).

export type DealTeamNameRow = {
  userId: string | null;
  contactId: string | null;
  freeName: string | null;
  userName: string | null;
  userEmail: string | null;
  contactFirst: string | null;
  contactLast: string | null;
};

export function resolveDealTeamMemberName(row: DealTeamNameRow): string {
  // 1. Live user FK: prefer auth_user.name, fall back to email.
  if (row.userId && row.userName !== null && row.userEmail !== null) {
    return row.userName || row.userEmail;
  }
  // 2. Live contact FK: build "First Last".
  if (row.contactId && (row.contactFirst !== null || row.contactLast !== null)) {
    const full = `${row.contactFirst ?? ""} ${row.contactLast ?? ""}`.trim();
    return full || "(unnamed contact)";
  }
  // 3. Free-text or stale FK.
  return row.freeName || "(unknown)";
}
