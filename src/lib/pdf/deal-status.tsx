import { readFileSync } from "fs";
import { join } from "path";

import {
  Document,
  Font,
  Image,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";

import { formatCurrency } from "@/lib/currency";

// Same Metropolis family registered here as in dd-tracking.tsx;
// @react-pdf's Font.register is idempotent so both modules can register
// the same family without conflict.
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

// Deal Status report. Snapshot of where a deal stands: header identity,
// overall + phase progress, recently completed items with attribution,
// upcoming milestones, open issues, and the Owner Team roster. Sent from
// the "Email Status" flow on the deal header; also viewable inline via
// the /api/deals/[id]/status.pdf route.

export type Phase = "phase_1" | "phase_2" | "phase_3" | "phase_4";
export type IssueStatus = "open" | "in_progress" | "resolved";
export type IssuePriority = "low" | "medium" | "high" | "urgent";
export type DealTeam = "owner" | "broker" | "buyer";

export type PhaseProgressRow = {
  phase: Phase;
  label: string;
  done: number;
  total: number;
};

export type RecentlyCompletedRow = {
  itemName: string;
  categoryName: string;
  phaseLabel: string;
  completedAt: string;
  completedByName: string | null;
};

export type UpcomingMilestoneRow = {
  label: string;
  date: string | null;
  // True when the tracked date is on/before today but the item is not
  // marked complete. Renders in red with an "Overdue" tag so the status
  // report exposes slipping milestones rather than dropping them.
  overdue: boolean;
};

export type StatusIssueRow = {
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignedName: string | null;
};

export type StatusTeamMemberRow = {
  name: string;
  roleLabel: string;
  email: string | null;
};

export type DealStatusProps = {
  dealName: string;
  dateLabel: string;
  purchasePrice: number | null;
  currentPhaseLabel: string;
  overall: { done: number; total: number; pct: number };
  phaseProgress: PhaseProgressRow[];
  recentlyCompleted: RecentlyCompletedRow[];
  upcomingMilestones: UpcomingMilestoneRow[];
  openIssues: StatusIssueRow[];
  ownerTeam: StatusTeamMemberRow[];
};

const COLORS = {
  ink: "#111827",
  textPrimary: "#1f2937",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  border: "#e5e7eb",
  rowAlt: "#f9fafb",
  progressBg: "#e5e7eb",
  progressFill: "#059669",
  open: "#b91c1c",
  inProgress: "#b45309",
  resolved: "#15803d",
  emerald: "#059669",
};

const PRIORITY_META: Record<IssuePriority, { label: string; bg: string; fg: string }> = {
  urgent: { label: "Urgent", bg: "#fee2e2", fg: "#991b1b" },
  high: { label: "High", bg: "#fef3c7", fg: "#92400e" },
  medium: { label: "Medium", bg: "#e0e7ff", fg: "#3730a3" },
  low: { label: "Low", bg: "#f3f4f6", fg: "#4b5563" },
};

const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  open: { label: "Open", color: COLORS.open },
  in_progress: { label: "In progress", color: COLORS.inProgress },
  resolved: { label: "Resolved", color: COLORS.resolved },
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
  titleBlock: { paddingBottom: 18 },
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
  purchasePrice: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  purchasePriceLabel: {
    color: COLORS.textSecondary,
    fontWeight: "normal",
    fontSize: 10,
    letterSpacing: 1,
  },
  currentPhase: {
    marginTop: 6,
    fontSize: 10,
    color: COLORS.emerald,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 0.5,
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
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 10,
  },
  progressLabel: {
    width: 140,
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  progressBarOuter: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.progressBg,
    borderRadius: 3,
  },
  progressBarFill: {
    height: 6,
    backgroundColor: COLORS.progressFill,
    borderRadius: 3,
  },
  progressCount: {
    width: 60,
    textAlign: "right",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  overallProgress: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 10,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: COLORS.border,
    marginTop: 4,
    paddingTop: 8,
  },
  overallLabel: {
    width: 140,
    fontSize: 10,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  overallCount: {
    width: 60,
    textAlign: "right",
    fontSize: 10,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    color: COLORS.ink,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  completedCheck: { marginRight: 2 },
  completedName: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  completedPhase: {
    width: 80,
    fontSize: 9,
    color: COLORS.textMuted,
    textAlign: "right",
  },
  completedBy: {
    width: 140,
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: "right",
  },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  // Label side wraps the optional Overdue chip and the label text in a
  // flex row so the chip's padding + spacing render reliably (nested
  // <Text><Text/>text</Text> layouts don't respect trailing whitespace
  // or margins the way View-wrapped chips do).
  milestoneLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  milestoneLabel: { fontSize: 10, color: COLORS.textPrimary },
  milestoneDate: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    color: COLORS.ink,
  },
  milestoneDateMissing: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  milestoneDateOverdue: {
    width: 120,
    textAlign: "right",
    fontSize: 10,
    color: COLORS.open,
    fontFamily: "Metropolis",
    fontWeight: "bold",
  },
  milestoneOverdueTag: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    marginRight: 8,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  issueStatusBar: {
    width: 4,
    height: 14,
    borderRadius: 2,
  },
  issueTitle: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  issueAssignee: {
    width: 140,
    fontSize: 9,
    color: COLORS.textSecondary,
    textAlign: "right",
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
    width: 50,
  },
  teamRow: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  teamName: {
    width: 160,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    fontSize: 10,
    color: COLORS.ink,
    paddingRight: 6,
  },
  teamRole: {
    width: 160,
    fontSize: 9,
    color: COLORS.textSecondary,
    paddingRight: 6,
  },
  teamEmail: {
    flex: 1,
    fontSize: 9,
    color: COLORS.textPrimary,
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

function CheckIcon() {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" style={styles.completedCheck}>
      <Path
        d="M4 12 L10 18 L20 6"
        stroke={COLORS.emerald}
        strokeWidth={3.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function DealStatusDoc({
  dealName,
  dateLabel,
  purchasePrice,
  currentPhaseLabel,
  overall,
  phaseProgress,
  recentlyCompleted,
  upcomingMilestones,
  openIssues,
  ownerTeam,
}: DealStatusProps) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={styles.titleBlock}>
          <Text style={styles.dealTitle}>{dealName}</Text>
          <Text style={styles.reportLabel}>STATUS REPORT · {dateLabel}</Text>
          {purchasePrice != null && (
            <Text style={styles.purchasePrice}>
              <Text style={styles.purchasePriceLabel}>PURCHASE PRICE  </Text>
              {formatCurrency(purchasePrice)}
            </Text>
          )}
          <Text style={styles.currentPhase}>Currently: {currentPhaseLabel}</Text>
        </View>

        {/* Progress */}
        <Text style={styles.sectionHeader}>PROGRESS</Text>
        {phaseProgress.map((p) => {
          const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <View key={p.phase} style={styles.progressRow} wrap={false}>
              <Text style={styles.progressLabel}>{p.label}</Text>
              <View style={styles.progressBarOuter}>
                <View style={{ ...styles.progressBarFill, width: `${pct}%` }} />
              </View>
              <Text style={styles.progressCount}>
                {p.done}/{p.total}
              </Text>
            </View>
          );
        })}
        <View style={styles.overallProgress} wrap={false}>
          <Text style={styles.overallLabel}>Overall</Text>
          <View style={styles.progressBarOuter}>
            <View style={{ ...styles.progressBarFill, width: `${overall.pct}%` }} />
          </View>
          <Text style={styles.overallCount}>
            {overall.done}/{overall.total}
          </Text>
        </View>

        {/* Recently completed */}
        <Text style={styles.sectionHeader}>RECENTLY COMPLETED</Text>
        {recentlyCompleted.length === 0 ? (
          <Text style={styles.emptyNote}>No items completed yet.</Text>
        ) : (
          recentlyCompleted.map((r, i) => (
            <View key={`rc-${i}`} style={styles.completedRow} wrap={false}>
              <CheckIcon />
              <Text style={styles.completedName}>{r.itemName}</Text>
              <Text style={styles.completedPhase}>{r.phaseLabel}</Text>
              <Text style={styles.completedBy}>
                {r.completedByName ?? "Unknown"}
                {" · "}
                {r.completedAt}
              </Text>
            </View>
          ))
        )}

        {/* Upcoming milestones */}
        <Text style={styles.sectionHeader}>UPCOMING MILESTONES</Text>
        {upcomingMilestones.length === 0 ? (
          <Text style={styles.emptyNote}>All milestones have happened.</Text>
        ) : (
          upcomingMilestones.map((m, i) => (
            <View key={`um-${i}`} style={styles.milestoneRow} wrap={false}>
              <View style={styles.milestoneLabelWrap}>
                {m.overdue && (
                  <View style={styles.milestoneOverdueTag}>
                    <Text>Overdue</Text>
                  </View>
                )}
                <Text style={styles.milestoneLabel}>{m.label}</Text>
              </View>
              <Text
                style={
                  m.overdue
                    ? styles.milestoneDateOverdue
                    : m.date
                      ? styles.milestoneDate
                      : styles.milestoneDateMissing
                }
              >
                {m.date ?? "not scheduled"}
              </Text>
            </View>
          ))
        )}

        {/* Open issues */}
        <Text style={styles.sectionHeader}>OPEN ISSUES</Text>
        {openIssues.length === 0 ? (
          <Text style={styles.emptyNote}>No open issues.</Text>
        ) : (
          openIssues.map((r, i) => {
            const p = PRIORITY_META[r.priority];
            const s = STATUS_META[r.status];
            return (
              <View key={`iss-${i}`} style={styles.issueRow} wrap={false}>
                <View style={{ ...styles.issueStatusBar, backgroundColor: s.color }} />
                <View
                  style={{ ...styles.priorityChip, backgroundColor: p.bg, color: p.fg }}
                >
                  <Text>{p.label}</Text>
                </View>
                <Text style={styles.issueTitle}>{r.title}</Text>
                <Text style={styles.issueAssignee}>
                  {r.assignedName ? `Assigned: ${r.assignedName}` : "Unassigned"}
                </Text>
              </View>
            );
          })
        )}

        {/* Owner Team */}
        <Text style={styles.sectionHeader}>OWNER TEAM</Text>
        {ownerTeam.length === 0 ? (
          <Text style={styles.emptyNote}>No Owner Team members configured.</Text>
        ) : (
          ownerTeam.map((r, i) => (
            <View key={`ot-${i}`} style={styles.teamRow} wrap={false}>
              <Text style={styles.teamName}>{r.name}</Text>
              <Text style={styles.teamRole}>{r.roleLabel}</Text>
              <Text style={styles.teamEmail}>{r.email ?? "(no email)"}</Text>
            </View>
          ))
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          {LAO_LOGO_DATA_URI ? (
            <Image src={LAO_LOGO_DATA_URI} style={styles.footerLogo} />
          ) : (
            <Text style={styles.footerLogoFallback}>Land Advisors</Text>
          )}
          <Text style={styles.footerMeta}>
            100 Spectrum Center Drive Suite 1400, Irvine CA 92618
          </Text>
        </View>
      </Page>
    </Document>
  );
}
