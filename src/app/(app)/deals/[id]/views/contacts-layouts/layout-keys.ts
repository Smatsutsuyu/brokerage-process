// Single source of truth for the Contacts tab layout options.
// Add or reorder here and both the picker and the view switcher see it.
export type ContactsLayoutKey = "a" | "b" | "c" | "d";

export const CONTACTS_LAYOUTS: ReadonlyArray<{
  key: ContactsLayoutKey;
  label: string;
}> = [
  { key: "a", label: "Cards" },
  { key: "b", label: "Pane" },
  { key: "c", label: "Grouped" },
  { key: "d", label: "Compact" },
];

const KEYS = new Set<string>(CONTACTS_LAYOUTS.map((l) => l.key));

// Coerces a raw URL param into a valid layout key, defaulting to "a"
// (Cards — the canonical layout). Used by the page loader.
export function parseLayoutParam(raw: string | undefined | null): ContactsLayoutKey {
  return raw && KEYS.has(raw) ? (raw as ContactsLayoutKey) : "a";
}
