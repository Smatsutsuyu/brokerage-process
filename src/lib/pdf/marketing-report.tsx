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

// Metropolis: free geometric sans (Chris Simpson, public domain) used as
// a Proxima Nova substitute. TrueType variants chosen over OpenType
// because PDFKit (under @react-pdf/renderer) doesn't reliably handle
// CFF-flavored OTFs.
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

// Disable React-PDF's automatic mid-word hyphenation when wrapping. The
// default behavior produced things like "competitive ad-vantage" in the
// comments column. Returning the word as a single segment forces wrap
// on whole-word boundaries instead.
Font.registerHyphenationCallback((word) => [word]);

// LAO logo loaded once at module-load time. Falls back to a text wordmark
// when the file isn't present so a missing-asset deploy doesn't crash the
// PDF render — it's visible in output, the team will notice and add it.
let LAO_LOGO_DATA_URI: string | null = null;
try {
  const buf = readFileSync(join(process.cwd(), "src/lib/pdf/assets/lao-logo.jpg"));
  LAO_LOGO_DATA_URI = `data:image/jpeg;base64,${buf.toString("base64")}`;
} catch {
  // File not present yet — footer renders text fallback.
}

export type MarketingReportTier = "green" | "yellow" | "red" | "not_selected";

export type MarketingReportRow = {
  builderName: string;
  tier: MarketingReportTier;
  // The free-text "interest" comments captured per builder. Empty string
  // when blank (renders as "—" so the layout doesn't collapse).
  comments: string;
};

export type MarketingReportProps = {
  dealName: string;
  // Pre-formatted date string ("March 2026"). Caller decides format.
  dateLabel: string;
  rows: MarketingReportRow[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  rowAlt: "#f3f4f6",
  green: "#22c55e",
  // Slightly darker than the Evaluating chip's bg (yellow-100, #fef9c3) —
  // that read too faint in the PDF tier bar. yellow-200 still in the soft
  // family but visibly present.
  yellow: "#fef08a",
  red: "#ef4444",
  notSelected: "#d1d5db",
};

const TIER_BAR_COLOR: Record<MarketingReportTier, string> = {
  green: COLORS.green,
  yellow: COLORS.yellow,
  red: COLORS.red,
  not_selected: COLORS.notSelected,
};

// 0.5" = 36 points (PDF user-space unit is 1/72 inch).
const MARGIN = 36;
// Tighter bottom margin than the rest (Chris's request) to keep the
// footer logo visually anchored close to the page edge.
const BOTTOM_MARGIN = 22; // ~0.3"
// Footer occupies the logo height + breathing room above the bottom
// margin. Logo is 2" wide; LAO logo aspect is roughly 3.6:1, so ~40pt
// tall — leave room for the legend if it wraps.
const FOOTER_RESERVE = 60;

const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: BOTTOM_MARGIN + FOOTER_RESERVE,
    paddingHorizontal: MARGIN,
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  // Title block — text-only header, top-left aligned. Generous bottom
  // padding before the table so MARKETING REPORT label has air around it.
  titleBlock: {
    paddingBottom: 36,
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
  // Header row mirrors the body-row structure (tier-bar spacer + paddingLeft
  // wrapper + same column widths) so BUILDER lines up with cellBuilder text
  // and COMMENTS lines up with cellComments text exactly. White background
  // so when this fixes/repeats on continuation pages it covers any body
  // content that flows underneath.
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    paddingBottom: 6,
    marginBottom: 4,
    backgroundColor: "white",
  },
  // Phantom column matching the tier bar's width so the header columns sit
  // at the same x as the body cells.
  theadSpacer: {
    width: 4,
  },
  // Mirrors rowContent's paddingLeft so the inner column starts at the same
  // x as the body's cellBuilder text.
  theadInner: {
    flex: 1,
    flexDirection: "row",
    paddingLeft: 10,
  },
  thBuilder: {
    width: "30%",
    paddingRight: 18,
    fontSize: 9,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    letterSpacing: 1,
  },
  thComments: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    letterSpacing: 1,
  },
  // Row container has NO vertical padding — that lives on rowContent — so
  // the tier bar fills the full row height and stacks edge-to-edge with
  // the next row's bar (continuous color band for same-tier groups).
  row: {
    flexDirection: "row",
    minHeight: 38,
  },
  rowAlt: {
    backgroundColor: COLORS.rowAlt,
  },
  tierBar: {
    width: 4,
    // Spans the full row height by default (flexbox stretch).
  },
  rowContent: {
    flexDirection: "row",
    flex: 1,
    paddingVertical: 8,
    paddingLeft: 10,
    // Vertically center comment text within the row (per Chris's request
    // — single-line comments were sitting at the top before).
    alignItems: "center",
  },
  cellBuilder: {
    width: "30%",
    // Generous right padding creates visual breathing room between the
    // builder name and the comments text; mirrored on the header's
    // thBuilder so the columns line up.
    paddingRight: 18,
    fontSize: 11,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  cellComments: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textPrimary,
    lineHeight: 1.4,
  },
  // Footer pinned to the bottom margin and repeated on every page.
  footer: {
    position: "absolute",
    bottom: BOTTOM_MARGIN,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  // 2" wide = 144pt. Height auto-scales by aspect ratio.
  footerLogo: {
    width: 144,
  },
  footerLogoFallback: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 12,
  },
  footerLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  legendSwatch: {
    width: 22,
    height: 6,
    marginRight: 4,
  },
});

export function MarketingReportDoc(props: MarketingReportProps) {
  const { dealName, dateLabel, rows } = props;

  // Stable tier order — green (most engaged) at top, then yellow, red,
  // not_selected (pending) at bottom.
  const tierOrder: Record<MarketingReportTier, number> = {
    green: 0,
    yellow: 1,
    red: 2,
    not_selected: 3,
  };
  const sortedRows = [...rows].sort((a, b) => {
    const t = tierOrder[a.tier] - tierOrder[b.tier];
    if (t !== 0) return t;
    return a.builderName.localeCompare(b.builderName);
  });

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Title — text-only header, top-left */}
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>MARKETING REPORT · {dateLabel}</Text>
        </View>

        {/* Builder × Comments table. Header is fixed so it repeats on
            continuation pages. The header layout mirrors the body row's
            tier-bar + paddingLeft structure so columns align exactly. */}
        <View>
          <View style={styles.thead} fixed>
            <View style={styles.theadSpacer} />
            <View style={styles.theadInner}>
              <Text style={styles.thBuilder}>BUILDER</Text>
              <Text style={styles.thComments}>COMMENTS</Text>
            </View>
          </View>
          {sortedRows.map((r, i) => {
            const isAlt = i % 2 === 1;
            return (
              <View key={`${r.builderName}-${i}`} style={[styles.row, isAlt ? styles.rowAlt : {}]}>
                <View style={[styles.tierBar, { backgroundColor: TIER_BAR_COLOR[r.tier] }]} />
                <View style={styles.rowContent}>
                  <Text style={styles.cellBuilder}>{r.builderName}</Text>
                  <Text style={styles.cellComments}>{r.comments || "—"}</Text>
                </View>
              </View>
            );
          })}
          {sortedRows.length === 0 && (
            <View style={styles.row}>
              <Text style={[styles.cellComments, { fontStyle: "italic", color: COLORS.textSecondary }]}>
                No buyers on this deal yet.
              </Text>
            </View>
          )}
        </View>

        {/* Footer — LAO logo (1.5" wide) + tier legend */}
        <View style={styles.footer} fixed>
          {LAO_LOGO_DATA_URI ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={LAO_LOGO_DATA_URI} style={styles.footerLogo} />
          ) : (
            <Text style={styles.footerLogoFallback}>Land Advisors</Text>
          )}
          <View style={styles.footerLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: COLORS.green }]} />
              <Text>Interest</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: COLORS.yellow }]} />
              <Text>Evaluating</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: COLORS.red }]} />
              <Text>Passed</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
