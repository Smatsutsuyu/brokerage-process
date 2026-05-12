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

// Open Sans matches the example PDF's typography (clean humanist sans-
// serif). Bundled as TTF in src/lib/pdf/fonts/ rather than fetched from a
// CDN at render time — deterministic across builds, no network call per
// PDF, no risk of a Google Fonts URL change breaking generation.
//
// Register at module load. process.cwd() is the Vercel function root; in
// dev it's the project root. Either way src/lib/pdf/fonts is reachable.
Font.register({
  family: "Open Sans",
  fonts: [
    { src: join(process.cwd(), "src/lib/pdf/fonts/OpenSans-Regular.ttf") },
    {
      src: join(process.cwd(), "src/lib/pdf/fonts/OpenSans-Bold.ttf"),
      fontWeight: "bold",
    },
  ],
});

// React-PDF template for the per-deal Marketing Report. Mirrors the
// Catana example Chris provided: hero banner up top, two-column
// builder/comments table grouped/colored by tier, Land Advisors
// footer with the tier legend.
//
// Banner is passed as a base64 data URI (the route handler streams the
// blob and encodes it before render). When no banner is set, falls back
// to a navy-band header with the deal name in white.

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
  // Pre-encoded data URI ("data:image/jpeg;base64,...") OR null. React-PDF
  // can also accept URLs but base64 sidesteps the private-blob proxy
  // round-trip from inside the rendering pass.
  bannerDataUri: string | null;
  rows: MarketingReportRow[];
};

const COLORS = {
  navy: "#1f2937",
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  rowAlt: "#f3f4f6",
  border: "#e5e7eb",
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  notSelected: "#d1d5db",
};

const TIER_BAR_COLOR: Record<MarketingReportTier, string> = {
  green: COLORS.green,
  yellow: COLORS.yellow,
  red: COLORS.red,
  not_selected: COLORS.notSelected,
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 60,
    paddingHorizontal: 0,
    fontFamily: "Open Sans",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  // Hero banner — full-width image OR a navy fallback band.
  banner: {
    width: "100%",
    height: 220,
    objectFit: "cover",
  },
  bannerFallback: {
    width: "100%",
    height: 220,
    backgroundColor: COLORS.navy,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerFallbackText: {
    color: "white",
    fontSize: 28,
    fontFamily: "Open Sans",
    fontWeight: "bold",
    letterSpacing: 2,
  },
  // Title block beneath the banner.
  titleBlock: {
    paddingHorizontal: 40,
    paddingTop: 18,
    paddingBottom: 14,
  },
  dealTitle: {
    fontSize: 22,
    fontFamily: "Open Sans",
    fontWeight: "bold",
    color: COLORS.ink,
    marginBottom: 2,
  },
  reportLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: "Open Sans",
    letterSpacing: 1,
  },
  // Table — split into header strip + row container so backgrounds + tier
  // bars can run edge-to-edge without per-row vertical padding gaps.
  tableWrap: {
    paddingHorizontal: 40,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    paddingBottom: 6,
    marginBottom: 4,
  },
  thBuilder: {
    width: "30%",
    fontSize: 9,
    fontFamily: "Open Sans",
    fontWeight: "bold",
    color: COLORS.ink,
    letterSpacing: 1,
    paddingLeft: 14, // Aligns with row content (after the tier-color bar).
  },
  thComments: {
    flex: 1,
    fontSize: 9,
    fontFamily: "Open Sans",
    fontWeight: "bold",
    color: COLORS.ink,
    letterSpacing: 1,
  },
  // Row container has NO vertical padding — that lives on rowContent — so
  // the tier bar fills the full row height and stacks edge-to-edge with
  // the next row's bar (matches the example PDF, which has continuous
  // colored bars across consecutive rows).
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
  // The actual text cells get the vertical padding the row used to.
  rowContent: {
    flexDirection: "row",
    flex: 1,
    paddingVertical: 8,
    paddingLeft: 10, // Was the bar's marginRight in the previous layout.
  },
  cellBuilder: {
    width: "30%",
    paddingRight: 10,
    fontSize: 11,
    fontFamily: "Open Sans",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  cellComments: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textPrimary,
    lineHeight: 1.4,
  },
  // Footer — fixed bottom, repeats on every page.
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLogo: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  footerLogoBold: {
    fontFamily: "Open Sans",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 11,
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
  const { dealName, dateLabel, bannerDataUri, rows } = props;

  // Stable tier order — green (most engaged) at top, then yellow, red,
  // not_selected (pending) at bottom. Matches Chris's example layout.
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
        {/* Hero banner */}
        {bannerDataUri ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={bannerDataUri} style={styles.banner} />
        ) : (
          <View style={styles.bannerFallback}>
            <Text style={styles.bannerFallbackText}>{dealName.toUpperCase()}</Text>
          </View>
        )}

        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>MARKETING REPORT · {dateLabel}</Text>
        </View>

        {/* Builder × Comments table */}
        <View style={styles.tableWrap}>
          <View style={styles.thead}>
            <Text style={styles.thBuilder}>BUILDER</Text>
            <Text style={styles.thComments}>COMMENTS</Text>
          </View>
          {sortedRows.map((r, i) => {
            const isAlt = i % 2 === 1;
            return (
              <View key={`${r.builderName}-${i}`} style={[styles.row, isAlt ? styles.rowAlt : {}]}>
                {/* Bar fills full row height (no row padding above/below).
                    Consecutive same-tier rows produce one continuous color
                    band — matches the example PDF's grouping cue. */}
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

        {/* Footer — Land Advisors brand + tier legend */}
        <View style={styles.footer} fixed>
          <View>
            <Text style={styles.footerLogoBold}>Land Advisors Organization</Text>
            <Text style={styles.footerLogo}>
              100 Spectrum Center Drive, Suite 1400, Irvine CA 92618
            </Text>
          </View>
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
