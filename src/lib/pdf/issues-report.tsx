import { join } from "path";

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

// Same Open Sans family the Marketing Report uses, registered idempotently
// in case both modules load.
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

// React-PDF doc for the per-deal Issues Report. Phase 4 due-diligence
// rhythm sends this ahead of each bi-weekly DD call so the deal team
// sees what's outstanding at a glance.
//
// Layout: navy banner with deal name + date, summary line (X open /
// Y in progress / Z resolved), then a table of issues grouped by
// status. Mirrors the Marketing Report's typography + Land Advisors
// footer to feel like one family of documents.

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export type IssuesReportRow = {
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignedName: string | null;
  identifiedDate: string; // pre-formatted
};

export type IssuesReportProps = {
  dealName: string;
  dateLabel: string;
  rows: IssuesReportRow[];
};

const STATUS_META: Record<
  IssueStatus,
  { label: string; color: string; order: number }
> = {
  open: { label: "Open", color: "#b91c1c", order: 0 },
  in_progress: { label: "In progress", color: "#b45309", order: 1 },
  resolved: { label: "Resolved", color: "#15803d", order: 2 },
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

const styles = StyleSheet.create({
  page: {
    fontFamily: "Open Sans",
    fontSize: 9,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: "#1f2937",
  },
  banner: {
    backgroundColor: "#0c1d3a",
    color: "#ffffff",
    padding: 16,
    marginBottom: 12,
  },
  bannerKicker: {
    fontSize: 9,
    opacity: 0.8,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 4,
  },
  bannerSubtitle: {
    fontSize: 10,
    opacity: 0.8,
    marginTop: 4,
  },
  summary: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  summaryStat: {
    flex: 1,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
  },
  summaryNum: { fontSize: 18, fontWeight: "bold" },
  summaryLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  groupHeader: {
    marginTop: 12,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e5e7eb",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#f3f4f6",
  },
  colPriority: { width: 60, paddingRight: 6 },
  colTitle: { flex: 2, paddingRight: 6 },
  colAssigned: { width: 90, paddingRight: 6 },
  colDate: { width: 70, textAlign: "right" },
  title: { fontWeight: "bold", fontSize: 10 },
  description: { color: "#4b5563", marginTop: 2 },
  priorityChip: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "bold",
  },
  small: { fontSize: 8, color: "#6b7280" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#6b7280",
  },
  footerBrand: { fontWeight: "bold", color: "#1f2937" },
  empty: {
    marginTop: 24,
    padding: 24,
    backgroundColor: "#f9fafb",
    textAlign: "center",
    color: "#6b7280",
    fontSize: 10,
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
        <View style={styles.banner}>
          <Text style={styles.bannerKicker}>Issues Tracker</Text>
          <Text style={styles.bannerTitle}>{dealName}</Text>
          <Text style={styles.bannerSubtitle}>{dateLabel}</Text>
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
              <View key={status} wrap={false}>
                <Text style={[styles.groupHeader, { color: STATUS_META[status].color }]}>
                  {STATUS_META[status].label} ({list.length})
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
          <View>
            <Text style={styles.footerBrand}>Land Advisors Organization</Text>
            <Text>100 Spectrum Center Drive Suite 1400, Irvine CA 92618</Text>
          </View>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
