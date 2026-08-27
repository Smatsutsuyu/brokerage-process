// Audit helpers shared across "use server" action modules.
//
// A "use server" file may only export async functions, so a constant or a
// plain helper cannot live next to the actions that use it and still be
// imported by a sibling action module. Anything two action files have to
// agree on lives here instead.

// Cap on how many affected row ids/names ride along in one audit entry's
// metadata. audit_log only ever grows and a single jsonb value has no natural
// bound: an Excel import can carry hundreds of contact rows, and deleting the
// builder those rows landed under detaches every one of them at once. Past
// this many the counts still tell the story, so the lists give way to a
// truncation marker.
//
// One number, not one per caller. The import writes the ids, the builder
// delete writes them back out, and the deal page's bulk actions write the same
// contacts a third time, so a reader comparing two entries would be misled by
// two different thresholds. Every bulk entry in the app cuts its lists here.
export const MAX_LOGGED_AUDIT_IDS = 200;

// builders.name is uncapped text and the audit viewer renders metadata.label
// inline in a column of its own, so the label is capped the way qaLabel caps a
// question. Shared because "builder.created" is written from both the
// /builders form and the contact/import path, and one action string reading
// two different label lengths is the inconsistency this exists to avoid.
export function builderLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "(unnamed builder)";
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}
