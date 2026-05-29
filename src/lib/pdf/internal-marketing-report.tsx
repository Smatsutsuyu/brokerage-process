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

// Sister of marketing-report.tsx — denser, internal-only view of the
// Contacts tab. Same chrome (Metropolis font, LAO footer) so both feel
// like the same family of deliverables.
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
  // Missing asset → text fallback in the footer.
}

export type InternalMarketingTier = "green" | "yellow" | "red" | "not_selected";
export type InternalMarketingClassification = "private" | "public" | "developer";

export type InternalMarketingContact = {
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  // When false, the contact is opted out of email blasts on this deal.
  // Surfaces as a small "(opted out)" note next to their row.
  receivesCommunication: boolean;
};

export type InternalMarketingBuilder = {
  builderName: string;
  classification: InternalMarketingClassification;
  tier: InternalMarketingTier;
  leadName: string | null;
  called: boolean;
  confiSigned: boolean;
  omSent: boolean;
  offerReceived: boolean;
  comments: string;
  contacts: InternalMarketingContact[];
};

export type InternalMarketingReportProps = {
  dealName: string;
  dateLabel: string;
  builders: InternalMarketingBuilder[];
  // Contacts on the deal with no builder. Rendered in a final
  // "UNAFFILIATED" section below the builder blocks.
  unaffiliatedContacts: InternalMarketingContact[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  divider: "#e5e7eb",
  green: "#22c55e",
  yellow: "#fef08a",
  red: "#ef4444",
  notSelected: "#d1d5db",
  pillCheckedBg: "#dcfce7", // green-100
  pillCheckedFg: "#15803d", // green-700
  pillUncheckedBg: "#f3f4f6", // gray-100
  pillUncheckedFg: "#9ca3af", // gray-400
  classificationBg: "#f3f4f6",
};

const TIER_BAR_COLOR: Record<InternalMarketingTier, string> = {
  green: COLORS.green,
  yellow: COLORS.yellow,
  red: COLORS.red,
  not_selected: COLORS.notSelected,
};

const TIER_ORDER: Record<InternalMarketingTier, number> = {
  green: 0,
  yellow: 1,
  red: 2,
  not_selected: 3,
};

const MARGIN = 36;
const BOTTOM_MARGIN = 22;
const FOOTER_RESERVE = 50;
const HEADER_ZONE_H = 60;
const HEADER_BODY_GAP = 8;

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN + HEADER_ZONE_H + HEADER_BODY_GAP,
    paddingBottom: BOTTOM_MARGIN + FOOTER_RESERVE,
    paddingHorizontal: MARGIN,
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  titleBlock: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ink,
  },
  dealTitle: {
    fontSize: 22,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    marginBottom: 3,
  },
  reportLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontFamily: "Metropolis",
    letterSpacing: 1,
  },

  // Builder block — one per builder card. wrap={false} on the View
  // keeps the header + comments + contacts together on one page when
  // possible; a long contact list still flows naturally.
  builderBlock: {
    marginBottom: 12,
    flexDirection: "row",
  },
  tierBar: {
    width: 3,
    alignSelf: "stretch",
  },
  builderBody: {
    flex: 1,
    paddingLeft: 8,
  },
  builderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 16,
  },
  builderName: {
    fontSize: 12,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  builderClassification: {
    fontSize: 8,
    fontFamily: "Metropolis",
    fontWeight: "normal",
    color: COLORS.textSecondary,
    letterSpacing: 1,
  },
  headerRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leadLine: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  leadName: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  pillRow: {
    flexDirection: "row",
    gap: 3,
  },
  pill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
    fontSize: 8,
  },
  pillChecked: {
    backgroundColor: COLORS.pillCheckedBg,
    color: COLORS.pillCheckedFg,
  },
  pillUnchecked: {
    backgroundColor: COLORS.pillUncheckedBg,
    color: COLORS.pillUncheckedFg,
  },
  comments: {
    // The bundled Metropolis variants are Regular + Bold only — no italic
    // file is registered, so fontStyle: "italic" would crash the render.
    // Quote marks in the rendered text already signal that this is the
    // builder's comment block.
    marginTop: 3,
    fontSize: 9,
    color: COLORS.textSecondary,
    lineHeight: 1.35,
  },
  contactList: {
    marginTop: 4,
  },
  contactLine: {
    fontSize: 9,
    color: COLORS.textPrimary,
    lineHeight: 1.4,
  },
  contactMuted: {
    color: COLORS.textMuted,
  },

  // Unaffiliated section — gray bar + no per-builder header.
  unaffiliatedBlock: {
    marginTop: 6,
    flexDirection: "row",
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 4,
  },

  emptyMessage: {
    fontSize: 10,
    color: COLORS.textSecondary,
    paddingVertical: 12,
  },

  footer: {
    position: "absolute",
    bottom: BOTTOM_MARGIN,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLogo: {
    width: 120,
  },
  footerLogoFallback: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 11,
  },
  footerLabel: {
    fontSize: 8,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
});

function StatusPill({ label, checked }: { label: string; checked: boolean }) {
  return (
    <Text style={[styles.pill, checked ? styles.pillChecked : styles.pillUnchecked]}>
      {label}
    </Text>
  );
}

function ContactLine({ c }: { c: InternalMarketingContact }) {
  // Dot-separated chunks. Drop empty fields so a contact missing a
  // phone doesn't show " · · " gaps. Title sits inline (per Chris:
  // putting it on its own line is the space waste he flagged).
  const parts: string[] = [c.fullName];
  if (c.title) parts.push(c.title);
  if (c.email) parts.push(c.email);
  if (c.phone) parts.push(c.phone);
  return (
    <Text style={styles.contactLine}>
      {parts.join(" · ")}
      {!c.receivesCommunication && (
        <Text style={styles.contactMuted}> · (opted out)</Text>
      )}
    </Text>
  );
}

function BuilderBlock({ b }: { b: InternalMarketingBuilder }) {
  return (
    <View style={styles.builderBlock} wrap={false}>
      <View style={[styles.tierBar, { backgroundColor: TIER_BAR_COLOR[b.tier] }]} />
      <View style={styles.builderBody}>
        <View style={styles.builderHeaderRow}>
          <Text>
            <Text style={styles.builderName}>{b.builderName}</Text>
            <Text style={styles.builderClassification}>
              {"  "}
              {b.classification.toUpperCase()}
            </Text>
          </Text>
          <View style={styles.headerRight}>
            <Text style={styles.leadLine}>
              Lead:{" "}
              <Text style={styles.leadName}>{b.leadName ?? "Unassigned"}</Text>
            </Text>
            <View style={styles.pillRow}>
              <StatusPill label="Called" checked={b.called} />
              <StatusPill label="Confi" checked={b.confiSigned} />
              <StatusPill label="OM" checked={b.omSent} />
              <StatusPill label="Offer" checked={b.offerReceived} />
            </View>
          </View>
        </View>
        {b.comments && <Text style={styles.comments}>&ldquo;{b.comments}&rdquo;</Text>}
        {b.contacts.length > 0 && (
          <View style={styles.contactList}>
            {b.contacts.map((c, i) => (
              <ContactLine key={i} c={c} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function InternalMarketingReportDoc(props: InternalMarketingReportProps) {
  const { dealName, dateLabel, builders, unaffiliatedContacts } = props;

  const sortedBuilders = [...builders].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (t !== 0) return t;
    return a.builderName.localeCompare(b.builderName);
  });

  const isEmpty = sortedBuilders.length === 0 && unaffiliatedContacts.length === 0;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Fixed header — repeats on every page. */}
        <View
          fixed
          style={{
            position: "absolute",
            top: MARGIN,
            left: MARGIN,
            right: MARGIN,
          }}
        >
          <View style={styles.titleBlock}>
            <Text style={styles.dealTitle}>{dealName}</Text>
            <Text style={styles.reportLabel}>
              INTERNAL MARKETING REPORT · {dateLabel}
            </Text>
          </View>
        </View>

        {/* Body. */}
        <View>
          {isEmpty && (
            <Text style={styles.emptyMessage}>No buyers on this deal yet.</Text>
          )}
          {sortedBuilders.map((b, i) => (
            <BuilderBlock key={`${b.builderName}-${i}`} b={b} />
          ))}
          {unaffiliatedContacts.length > 0 && (
            <View style={styles.unaffiliatedBlock} wrap={false}>
              <View
                style={[styles.tierBar, { backgroundColor: COLORS.notSelected }]}
              />
              <View style={styles.builderBody}>
                <Text style={styles.sectionTitle}>UNAFFILIATED</Text>
                <View style={styles.contactList}>
                  {unaffiliatedContacts.map((c, i) => (
                    <ContactLine key={i} c={c} />
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Fixed footer. */}
        <View style={styles.footer} fixed>
          {LAO_LOGO_DATA_URI ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={LAO_LOGO_DATA_URI} style={styles.footerLogo} />
          ) : (
            <Text style={styles.footerLogoFallback}>Land Advisors</Text>
          )}
          <Text style={styles.footerLabel}>INTERNAL USE ONLY</Text>
        </View>
      </Page>
    </Document>
  );
}
