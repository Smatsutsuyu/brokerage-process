import type { ComponentProps, ReactNode } from "react";

import { Text, View } from "@react-pdf/renderer";

// Orphan-proof report section, shared by the DD Tracking and Deal Status
// PDFs.
//
// The problem it solves: a section header (or a subsection band) that
// lands at the very bottom of a page with all of its rows pushed to the
// next one. Chris hit this as a "SOILS ENGINEER" heading sitting alone
// at a page break with nothing under it.
//
// react-pdf's declarative `minPresenceAhead` was tried first and proved
// unreliable — the stranded heading still reproduced under the page-break
// stress fixture in src/scripts/smoke-pdfs.ts. This is the deterministic
// version: the section header is glued to the first band and that band's
// first row, and each subsequent band is glued to its own first row, all
// via `wrap={false}`. Only whole rows can break across pages, so a
// heading is never left behind.
//
// Callers pass their own header / empty-note styles because each document
// owns its type scale; the layout guarantee is what's shared.

// Derived from View, not Text: Text's props are a union with the SVG
// text element, so its `style` widens to include SVG presentation
// attributes and stops being assignable back to a plain Text.
type PdfStyle = ComponentProps<typeof View>["style"];

export type SectionGroup = {
  key: string;
  // Subsection band, or null for a section that's a single unlabeled run
  // of rows (Deal Status has no subsection level; DD Tracking's Key Dates
  // doesn't either).
  band: ReactNode | null;
  rows: ReactNode[];
};

export function Section({
  header,
  headerStyle,
  groups,
  emptyNote,
  emptyNoteStyle,
}: {
  header: string;
  headerStyle: PdfStyle;
  groups: SectionGroup[];
  emptyNote: string;
  emptyNoteStyle: PdfStyle;
}) {
  const populated = groups.filter((g) => g.rows.length > 0);

  // Nothing to show: header and note travel together so the note can't
  // orphan either.
  if (populated.length === 0) {
    return (
      <View wrap={false}>
        <Text style={headerStyle}>{header}</Text>
        <Text style={emptyNoteStyle}>{emptyNote}</Text>
      </View>
    );
  }

  const [first, ...rest] = populated;
  return (
    <>
      <View wrap={false}>
        <Text style={headerStyle}>{header}</Text>
        {first.band}
        {first.rows[0]}
      </View>
      {first.rows.slice(1)}
      {rest.map((g) => (
        <View key={g.key}>
          <View wrap={false}>
            {g.band}
            {g.rows[0]}
          </View>
          {g.rows.slice(1)}
        </View>
      ))}
    </>
  );
}
