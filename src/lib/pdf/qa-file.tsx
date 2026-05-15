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

// Same Metropolis family the Marketing + Issues Reports use.
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

// Per-deal Q&A File. Layout per CLAUDE.md branding: bold question,
// regular-weight answer underneath, numbered for easy reference on
// follow-up calls. Only approved items render — pending items belong
// internally, not in the buyer-facing distribution.

export type QaFileRow = {
  question: string;
  answer: string | null;
};

export type QaFileProps = {
  dealName: string;
  dateLabel: string;
  rows: QaFileRow[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
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
    paddingBottom: 24,
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
  qaItem: {
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  qaRow: {
    flexDirection: "row",
  },
  qNumber: {
    width: 26,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 11,
  },
  qText: {
    flex: 1,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    fontSize: 11,
    lineHeight: 1.4,
  },
  aText: {
    color: COLORS.textPrimary,
    fontSize: 10,
    lineHeight: 1.5,
    marginTop: 4,
    marginLeft: 26,
  },
  aPending: {
    color: COLORS.textSecondary,
    fontSize: 10,
    marginTop: 4,
    marginLeft: 26,
  },
  empty: {
    marginTop: 24,
    padding: 24,
    backgroundColor: "#f9fafb",
    textAlign: "center",
    color: COLORS.textSecondary,
    fontSize: 10,
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

export function QaFileDoc({ dealName, dateLabel, rows }: QaFileProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>QUESTIONS &amp; ANSWERS · {dateLabel}</Text>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text>No approved Q&amp;A items on this deal yet.</Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View key={i} style={styles.qaItem} wrap={false}>
              <View style={styles.qaRow}>
                <Text style={styles.qNumber}>{i + 1}.</Text>
                <Text style={styles.qText}>{r.question}</Text>
              </View>
              {r.answer && r.answer.trim().length > 0 ? (
                <Text style={styles.aText}>{r.answer}</Text>
              ) : (
                <Text style={styles.aPending}>Pending response.</Text>
              )}
            </View>
          ))
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
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
