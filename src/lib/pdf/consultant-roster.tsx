import { readFileSync } from "fs";
import { join } from "path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// Same Metropolis family the other reports register; @react-pdf's
// Font.register is idempotent so every PDF module can register it.
Font.register({
  family: "Metropolis",
  fonts: [
    { src: join(process.cwd(), "src/lib/pdf/fonts/Metropolis-Regular.ttf") },
    {
      src: join(process.cwd(), "src/lib/pdf/fonts/Metropolis-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

let LAO_LOGO_DATA_URI: string | null = null;
try {
  const buf = readFileSync(join(process.cwd(), "src/lib/pdf/assets/lao-logo.jpg"));
  LAO_LOGO_DATA_URI = `data:image/jpeg;base64,${buf.toString("base64")}`;
} catch {
  // Text fallback in the footer if the file isn't present.
}

// Consultant Roster. Standalone, Land Advisors-branded contact sheet for
// the Phase 4 "Create Consultant Roster & Send Out" row and the
// Consultants tab. Sections are the 13 canonical roles in template
// order; roles with nobody engaged collapse into a single trailing list
// so the detail block stays dense.
//
// Deliberately omits the per-consultant `notes` field: this document goes
// to the Buyer Team as well as the Owner/Broker teams, and notes are
// internal commentary.

export type RosterEntry = {
  side: "buyer" | "seller";
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  // Pre-formatted by the generator (formatPhone) so the template stays
  // presentation-only.
  contactPhone: string | null;
};

export type RosterRoleGroup = {
  roleLabel: string;
  entries: RosterEntry[];
};

export type ConsultantRosterProps = {
  dealName: string;
  dateLabel: string;
  // "120 units · Single Family · Irvine, CA" — null when the deal has
  // none of those fields set.
  dealSubtitle: string | null;
  // Roles with at least one firm, in canonical order.
  groups: RosterRoleGroup[];
  // Labels of the roles nobody's been engaged for yet.
  unfilledRoleLabels: string[];
  filledCount: number;
  totalRoles: number;
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  buyer: "#1d4ed8",
  seller: "#047857",
};

const MARGIN = 36;
const FOOTER_RESERVE = 70;

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: MARGIN + FOOTER_RESERVE,
    paddingHorizontal: MARGIN,
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  titleBlock: {
    paddingBottom: 14,
  },
  dealTitle: {
    fontSize: 24,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    marginBottom: 4,
  },
  reportLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: "Metropolis",
    letterSpacing: 1,
  },
  dealSubtitle: {
    marginTop: 6,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  coverage: {
    marginTop: 8,
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  coverageCount: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  // Column header strip, repeated on every page so a roster that wraps
  // keeps its labels.
  columnHeader: {
    flexDirection: "row",
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.ink,
  },
  columnHeaderText: {
    fontSize: 7.5,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  roleHeader: {
    marginTop: 12,
    marginBottom: 3,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    fontSize: 9.5,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
    color: COLORS.ink,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  // Wider gutter than the other columns: firm names are the longest
  // free-text field on the sheet and butt straight into CONTACT.
  colFirm: { flex: 1, paddingRight: 14 },
  colContact: { width: 118, paddingRight: 8 },
  colEmail: { width: 150, paddingRight: 8 },
  colPhone: { width: 82, textAlign: "right" },
  firmName: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    fontSize: 10,
    color: COLORS.ink,
  },
  sideLine: {
    marginTop: 1,
    fontSize: 7,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Metropolis",
    fontWeight: "bold",
  },
  cellText: {
    fontSize: 9,
    color: COLORS.textPrimary,
  },
  cellMuted: {
    fontSize: 9,
    color: COLORS.textMuted,
  },
  unfilledHeader: {
    marginTop: 18,
    marginBottom: 5,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    fontSize: 9,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
    color: COLORS.textSecondary,
  },
  unfilledList: {
    fontSize: 9,
    lineHeight: 1.5,
    color: COLORS.textMuted,
  },
  emptyNote: {
    paddingVertical: 10,
    color: COLORS.textSecondary,
    fontSize: 9.5,
  },
  footer: {
    position: "absolute",
    bottom: MARGIN,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLogo: { width: 108 },
  footerLogoFallback: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 12,
  },
  footerMeta: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
});

export function ConsultantRosterDoc({
  dealName,
  dateLabel,
  dealSubtitle,
  groups,
  unfilledRoleLabels,
  filledCount,
  totalRoles,
}: ConsultantRosterProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>CONSULTANT ROSTER · {dateLabel}</Text>
          {dealSubtitle && <Text style={styles.dealSubtitle}>{dealSubtitle}</Text>}
          <Text style={styles.coverage}>
            <Text style={styles.coverageCount}>
              {filledCount} of {totalRoles}
            </Text>
            {" roles engaged"}
          </Text>
        </View>

        {groups.length === 0 ? (
          <Text style={styles.emptyNote}>
            No consultants have been added to this deal yet.
          </Text>
        ) : (
          <>
            {/* fixed → repeats at the top of every page the roster spills
                onto, so column meaning survives a page break. */}
            <View style={styles.columnHeader} fixed>
              <Text style={[styles.columnHeaderText, styles.colFirm]}>FIRM</Text>
              <Text style={[styles.columnHeaderText, styles.colContact]}>CONTACT</Text>
              <Text style={[styles.columnHeaderText, styles.colEmail]}>EMAIL</Text>
              <Text style={[styles.columnHeaderText, styles.colPhone]}>PHONE</Text>
            </View>

            {groups.map((group) => (
              <View key={group.roleLabel}>
                {/* The role header stays with at least its first entry so
                    a break never orphans a heading at the page bottom. */}
                <View wrap={false}>
                  <Text style={styles.roleHeader}>
                    {group.roleLabel.toUpperCase()}
                  </Text>
                  {group.entries[0] && <EntryRow entry={group.entries[0]} />}
                </View>
                {group.entries.slice(1).map((entry, i) => (
                  <EntryRow key={`${group.roleLabel}-${i + 1}`} entry={entry} />
                ))}
              </View>
            ))}
          </>
        )}

        {unfilledRoleLabels.length > 0 && (
          <View wrap={false}>
            <Text style={styles.unfilledHeader}>NOT YET ENGAGED</Text>
            <Text style={styles.unfilledList}>{unfilledRoleLabels.join(" · ")}</Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          {LAO_LOGO_DATA_URI ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={LAO_LOGO_DATA_URI} style={styles.footerLogo} />
          ) : (
            <Text style={styles.footerLogoFallback}>Land Advisors</Text>
          )}
          <Text
            style={styles.footerMeta}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

function EntryRow({ entry }: { entry: RosterEntry }) {
  return (
    <View style={styles.entryRow} wrap={false}>
      <View style={styles.colFirm}>
        <Text style={styles.firmName}>{entry.firmName}</Text>
        <Text
          style={[
            styles.sideLine,
            { color: entry.side === "buyer" ? COLORS.buyer : COLORS.seller },
          ]}
        >
          {entry.side === "buyer" ? "Buyer-side" : "Seller-side"}
        </Text>
      </View>
      <Text style={[entry.contactName ? styles.cellText : styles.cellMuted, styles.colContact]}>
        {entry.contactName ?? "—"}
      </Text>
      <Text style={[entry.contactEmail ? styles.cellText : styles.cellMuted, styles.colEmail]}>
        {entry.contactEmail ?? "—"}
      </Text>
      <Text style={[entry.contactPhone ? styles.cellText : styles.cellMuted, styles.colPhone]}>
        {entry.contactPhone ?? "—"}
      </Text>
    </View>
  );
}
