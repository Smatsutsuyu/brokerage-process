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

// Same Metropolis family the Marketing Report uses, registered
// idempotently in case both modules load.
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

// Per-deal Issues Report. Phase 4 due-diligence rhythm sends this ahead
// of each bi-weekly DD call so the deal team sees what's outstanding at
// a glance. Mirrors the Marketing Report's title block + footer logo
// treatment so the docs read as one Land Advisors family.

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export type IssuesReportRow = {
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignedName: string | null;
  identifiedDate: string;
};

export type IssuesReportProps = {
  dealName: string;
  dateLabel: string;
  rows: IssuesReportRow[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  rowAlt: "#f3f4f6",
  open: "#b91c1c",
  inProgress: "#b45309",
  resolved: "#15803d",
};

const STATUS_META: Record<
  IssueStatus,
  { label: string; color: string; order: number }
> = {
  open: { label: "Open", color: COLORS.open, order: 0 },
  in_progress: { label: "In progress", color: COLORS.inProgress, order: 1 },
  resolved: { label: "Resolved", color: COLORS.resolved, order: 2 },
};

const PRIORITY_META: Record<
  IssuePriority,
  { label: string; bg: string; fg: string }
> = {
  urgent: { label: "Urgent", bg: "#fee2e2", fg: "#991b1b" },
  high: { label: "High", bg: "#fef3c7", fg: "#92400e" },
  medium: { label: "Medium", bg: "#e0e7ff", fg: "#3730a3" },
  low: { label: "Low", bg: "#f3f4f6", fg: "#4b5563" },
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
  summary: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  summaryStat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
  },
  summaryNum: {
    fontSize: 20,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  summaryLabel: {
    fontSize: 8,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 2,
  },
  groupHeader: {
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    fontSize: 10,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  colPriority: { width: 60, paddingRight: 6 },
  colTitle: { flex: 2, paddingRight: 6 },
  colAssigned: { width: 110, paddingRight: 6 },
  colDate: { width: 70, textAlign: "right" },
  title: {
    fontFamily: "Metropolis",
    fontWeight: "bold",
    fontSize: 10,
    color: COLORS.ink,
  },
  description: {
    color: COLORS.textPrimary,
    fontSize: 9,
    marginTop: 2,
    lineHeight: 1.4,
  },
  priorityChip: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: "Metropolis",
    fontWeight: "bold",
  },
  small: { fontSize: 9, color: COLORS.textSecondary },
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

export function IssuesReportDoc({
  dealName,
  dateLabel,
  rows,
}: IssuesReportProps) {
  const totals = {
    open: rows.filter((r) => r.status === "open").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    resolved: rows.filter((r) => r.status === "resolved").length,
  };

  const grouped: Record<IssueStatus, IssuesReportRow[]> = {
    open: [],
    in_progress: [],
    resolved: [],
  };
  for (const r of rows) grouped[r.status].push(r);
  const groupOrder = (Object.keys(grouped) as IssueStatus[]).sort(
    (a, b) => STATUS_META[a].order - STATUS_META[b].order,
  );

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>ISSUES REPORT · {dateLabel}</Text>
        </View>

        <View style={styles.summary}>
          <View style={[styles.summaryStat, { borderLeftColor: STATUS_META.open.color }]}>
            <Text style={styles.summaryNum}>{totals.open}</Text>
            <Text style={styles.summaryLabel}>Open</Text>
          </View>
          <View
            style={[styles.summaryStat, { borderLeftColor: STATUS_META.in_progress.color }]}
          >
            <Text style={styles.summaryNum}>{totals.in_progress}</Text>
            <Text style={styles.summaryLabel}>In progress</Text>
          </View>
          <View
            style={[styles.summaryStat, { borderLeftColor: STATUS_META.resolved.color }]}
          >
            <Text style={styles.summaryNum}>{totals.resolved}</Text>
            <Text style={styles.summaryLabel}>Resolved</Text>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text>No issues tracked on this deal yet.</Text>
          </View>
        ) : (
          groupOrder.map((status) => {
            const list = grouped[status];
            if (list.length === 0) return null;
            return (
              <View key={status}>
                <Text style={[styles.groupHeader, { color: STATUS_META[status].color }]}>
                  {STATUS_META[status].label.toUpperCase()} ({list.length})
                </Text>
                {list.map((r, i) => {
                  const p = PRIORITY_META[r.priority];
                  return (
                    <View key={`${status}-${i}`} style={styles.row} wrap={false}>
                      <View style={styles.colPriority}>
                        <Text
                          style={[
                            styles.priorityChip,
                            { backgroundColor: p.bg, color: p.fg },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </View>
                      <View style={styles.colTitle}>
                        <Text style={styles.title}>{r.title}</Text>
                        {r.description ? (
                          <Text style={styles.description}>{r.description}</Text>
                        ) : null}
                      </View>
                      <View style={styles.colAssigned}>
                        <Text style={styles.small}>
                          {r.assignedName ? `Assigned: ${r.assignedName}` : "Unassigned"}
                        </Text>
                      </View>
                      <View style={styles.colDate}>
                        <Text style={styles.small}>{r.identifiedDate}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
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
