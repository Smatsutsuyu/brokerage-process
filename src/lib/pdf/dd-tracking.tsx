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

// Combined "Due Diligence Tracking" report sent ahead of each bi-weekly
// DD call. Sections in order: 7 milestone dates, open/in-progress/
// resolved issues, deal team (owner/broker/buyer), consultants.
//
// Built off the old Issues Report shell. Land Advisors branding,
// Metropolis font, footer logo + page numbers.

export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export type IssueRow = {
  title: string;
  description: string | null;
  status: IssueStatus;
  priority: IssuePriority;
  assignedName: string | null;
  identifiedDate: string;
};

export type MilestoneRow = {
  label: string;
  date: string | null;
  completed: boolean;
};

export type DealTeam = "owner" | "broker" | "buyer";

export type TeamMemberRow = {
  team: DealTeam;
  name: string;
  roleLabel: string;
  email: string | null;
  phone: string | null;
};

export type ConsultantRow = {
  roleLabel: string;
  side: "buyer" | "seller";
  firmName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type DdTrackingProps = {
  dealName: string;
  dateLabel: string;
  milestones: MilestoneRow[];
  issues: IssueRow[];
  team: TeamMemberRow[];
  consultants: ConsultantRow[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  rowAlt: "#f9fafb",
  open: "#b91c1c",
  inProgress: "#b45309",
  resolved: "#15803d",
};

const STATUS_META: Record<IssueStatus, { label: string; color: string; order: number }> = {
  open: { label: "Open", color: COLORS.open, order: 0 },
  in_progress: { label: "In progress", color: COLORS.inProgress, order: 1 },
  resolved: { label: "Resolved", color: COLORS.resolved, order: 2 },
};

const PRIORITY_META: Record<IssuePriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "Urgent", bg: "#fee2e2", fg: "#991b1b" },
  high: { label: "High", bg: "#fef3c7", fg: "#92400e" },
  medium: { label: "Medium", bg: "#e0e7ff", fg: "#3730a3" },
  low: { label: "Low", bg: "#f3f4f6", fg: "#4b5563" },
};

const TEAM_LABEL: Record<DealTeam, string> = {
  owner: "Owner Team",
  broker: "Broker Team",
  buyer: "Buyer Team",
};

const TEAM_ORDER: DealTeam[] = ["owner", "broker", "buyer"];

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
    paddingBottom: 18,
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
  sectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.ink,
    fontSize: 11,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
    color: COLORS.ink,
  },
  // Milestone rows: 2-column grid (label / date).
  milestoneRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  milestoneLabel: {
    flex: 1,
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  milestoneLabelDone: {
    flex: 1,
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textSecondary,
    textDecoration: "line-through",
  },
  milestoneDate: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Metropolis",
    color: COLORS.ink,
  },
  milestoneDateMissing: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  // Issues styles
  groupHeader: {
    marginTop: 12,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.ink,
    fontSize: 9,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1,
  },
  issueRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  colPriority: { width: 56, paddingRight: 6 },
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
  // Team / Consultant entries
  subHeader: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 10,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  contactRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  contactName: {
    width: 140,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    fontSize: 10,
    color: COLORS.ink,
    paddingRight: 6,
  },
  contactRole: {
    width: 160,
    fontSize: 9,
    color: COLORS.textSecondary,
    paddingRight: 6,
  },
  contactEmail: {
    flex: 1,
    fontSize: 9,
    color: COLORS.textPrimary,
    paddingRight: 6,
  },
  contactPhone: {
    width: 100,
    fontSize: 9,
    color: COLORS.textPrimary,
    textAlign: "right",
  },
  sideTag: {
    fontSize: 7,
    paddingHorizontal: 4,
    paddingVertical: 1,
    backgroundColor: COLORS.rowAlt,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyNote: {
    paddingVertical: 8,
    color: COLORS.textSecondary,
    fontSize: 9,
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

export function DdTrackingDoc({
  dealName,
  dateLabel,
  milestones,
  issues,
  team,
  consultants,
}: DdTrackingProps) {
  const groupedIssues: Record<IssueStatus, IssueRow[]> = {
    open: [],
    in_progress: [],
    resolved: [],
  };
  for (const r of issues) groupedIssues[r.status].push(r);
  const issueGroupOrder = (Object.keys(groupedIssues) as IssueStatus[]).sort(
    (a, b) => STATUS_META[a].order - STATUS_META[b].order,
  );

  const teamByGroup: Record<DealTeam, TeamMemberRow[]> = { owner: [], broker: [], buyer: [] };
  for (const r of team) teamByGroup[r.team].push(r);

  // Consultants grouped by role label (the label is already display-ready).
  const consultantsByRole = new Map<string, ConsultantRow[]>();
  for (const c of consultants) {
    const arr = consultantsByRole.get(c.roleLabel) ?? [];
    arr.push(c);
    consultantsByRole.set(c.roleLabel, arr);
  }

  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>DUE DILIGENCE TRACKING · {dateLabel}</Text>
        </View>

        {/* Section 1: Key Dates */}
        <Text style={styles.sectionHeader}>KEY DATES</Text>
        {milestones.map((m, i) => (
          <View key={`m-${i}`} style={styles.milestoneRow} wrap={false}>
            <Text style={m.completed ? styles.milestoneLabelDone : styles.milestoneLabel}>
              {m.label}
            </Text>
            <Text style={m.date ? styles.milestoneDate : styles.milestoneDateMissing}>
              {m.date ?? "not scheduled"}
            </Text>
          </View>
        ))}

        {/* Section 2: Issues */}
        <Text style={styles.sectionHeader}>ISSUES</Text>
        {issues.length === 0 ? (
          <Text style={styles.emptyNote}>No issues tracked on this deal yet.</Text>
        ) : (
          issueGroupOrder.map((status) => {
            const list = groupedIssues[status];
            if (list.length === 0) return null;
            return (
              <View key={status}>
                <Text style={[styles.groupHeader, { color: STATUS_META[status].color }]}>
                  {STATUS_META[status].label.toUpperCase()} ({list.length})
                </Text>
                {list.map((r, i) => {
                  const p = PRIORITY_META[r.priority];
                  return (
                    <View key={`${status}-${i}`} style={styles.issueRow} wrap={false}>
                      <View style={styles.colPriority}>
                        <Text
                          style={[styles.priorityChip, { backgroundColor: p.bg, color: p.fg }]}
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

        {/* Section 3: Deal Team */}
        <Text style={styles.sectionHeader}>DEAL TEAM</Text>
        {team.length === 0 ? (
          <Text style={styles.emptyNote}>No deal team members recorded yet.</Text>
        ) : (
          TEAM_ORDER.map((t) => {
            const members = teamByGroup[t];
            if (members.length === 0) return null;
            return (
              <View key={t}>
                <Text style={styles.subHeader}>{TEAM_LABEL[t]}</Text>
                {members.map((m, i) => (
                  <View key={`${t}-${i}`} style={styles.contactRow} wrap={false}>
                    <Text style={styles.contactName}>{m.name || "—"}</Text>
                    <Text style={styles.contactRole}>{m.roleLabel || ""}</Text>
                    <Text style={styles.contactEmail}>{m.email ?? ""}</Text>
                    <Text style={styles.contactPhone}>{m.phone ?? ""}</Text>
                  </View>
                ))}
              </View>
            );
          })
        )}

        {/* Section 4: Consultants */}
        <Text style={styles.sectionHeader}>CONSULTANTS</Text>
        {consultants.length === 0 ? (
          <Text style={styles.emptyNote}>No consultants recorded yet.</Text>
        ) : (
          Array.from(consultantsByRole.entries()).map(([roleLabel, firms]) => (
            <View key={roleLabel}>
              <Text style={styles.subHeader}>{roleLabel}</Text>
              {firms.map((c, i) => (
                <View key={`${roleLabel}-${i}`} style={styles.contactRow} wrap={false}>
                  <Text style={styles.contactName}>
                    {c.firmName}
                    {"  "}
                    <Text style={styles.sideTag}>{c.side}</Text>
                  </Text>
                  <Text style={styles.contactRole}>{c.contactName ?? ""}</Text>
                  <Text style={styles.contactEmail}>{c.contactEmail ?? ""}</Text>
                  <Text style={styles.contactPhone}>{c.contactPhone ?? ""}</Text>
                </View>
              ))}
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
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
