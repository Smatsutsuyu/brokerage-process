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

import { Section } from "./section";

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
  // True when this milestone has happened — either the user checked the
  // item complete, or the tracked date is on/before today. Prefixes a
  // "✓ " on the label when true so Chris can see at a glance which
  // milestones are past. Computed in the route, not here, so today's-
  // date logic stays out of the PDF template.
  hasHappened: boolean;
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
  // Whole-dollar amount stored on the deal. Rendered as a "PURCHASE
  // PRICE $X,XXX,XXX" line under the title when set; skipped when null
  // so early-phase reports don't render an unset $0.
  purchasePrice: number | null;
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
  bandBg: "#f1f3f5",
  buyer: "#1d4ed8",
  seller: "#047857",
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
// Horizontal inset shared by the subsection bands and every data row, so
// band text lines up with the first column beneath it.
const ROW_INSET = 7;

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
    paddingHorizontal: ROW_INSET,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  // Label side wraps the optional check + text in a flex row so the
  // check stays inline. Prev: Text alone with flex:1 owned this slot;
  // moving flex up to the wrap so the check + label share it.
  milestoneLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  milestoneCheck: {
    marginRight: 5,
  },
  milestoneLabel: {
    fontFamily: "Metropolis",
    fontSize: 10,
    color: COLORS.textPrimary,
  },
  milestoneLabelDone: {
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
  // Subsection band, shared by the issue status groups, the deal-team
  // subteams, and the consultant roles. Previously these were bold text
  // over a hair rule, which weighed the same as the bold issue title /
  // contact name directly beneath and read as just another row. A filled
  // band separates "subsection" from "entry" without a new font weight.
  band: {
    marginTop: 10,
    backgroundColor: COLORS.bandBg,
    paddingVertical: 4,
    paddingHorizontal: ROW_INSET,
  },
  bandText: {
    fontSize: 8.5,
    fontFamily: "Metropolis",
    fontWeight: "bold",
    letterSpacing: 1.2,
    color: COLORS.ink,
  },
  issueRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: ROW_INSET,
    borderBottomWidth: 0.5,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.border,
  },
  // Dividers separate rows WITHIN a group, so the last row in each group
  // drops its rule — otherwise it draws a line against the next band or
  // section header and reads as a divider for nothing.
  rowLast: {
    borderBottomWidth: 0,
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
  contactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: ROW_INSET,
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
  // Consultant firm cell. The side used to render as an inline chip
  // nested in the firm-name Text, which wrapped mid-name once the column
  // narrowed ("Hunsaker & Associates-" / "SELLER"). Stacking it under the
  // name matches the Consultant Roster PDF and can't break the name.
  firmCell: {
    width: 140,
    paddingRight: 6,
  },
  // Same look as contactName, minus the fixed width — firmCell owns the
  // column geometry here, so the inner Text must not re-declare it.
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

function MilestoneRowView({ m, isLast }: { m: MilestoneRow; isLast: boolean }) {
  return (
    <View
      style={isLast ? [styles.milestoneRow, styles.rowLast] : styles.milestoneRow}
      wrap={false}
    >
      <View style={styles.milestoneLabelWrap}>
        {m.hasHappened && (
          <Svg width={10} height={10} viewBox="0 0 24 24" style={styles.milestoneCheck}>
            <Path
              d="M4 12 L10 18 L20 6"
              stroke="#059669"
              strokeWidth={3.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        )}
        <Text style={m.completed ? styles.milestoneLabelDone : styles.milestoneLabel}>
          {m.label}
        </Text>
      </View>
      <Text style={m.date ? styles.milestoneDate : styles.milestoneDateMissing}>
        {m.date ?? "not scheduled"}
      </Text>
    </View>
  );
}

function IssueRowView({ r, isLast }: { r: IssueRow; isLast: boolean }) {
  const p = PRIORITY_META[r.priority];
  return (
    <View
      style={isLast ? [styles.issueRow, styles.rowLast] : styles.issueRow}
      wrap={false}
    >
      <View style={styles.colPriority}>
        <Text style={[styles.priorityChip, { backgroundColor: p.bg, color: p.fg }]}>
          {p.label}
        </Text>
      </View>
      <View style={styles.colTitle}>
        <Text style={styles.title}>{r.title}</Text>
        {r.description ? <Text style={styles.description}>{r.description}</Text> : null}
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
}

function ConsultantRowView({ c, isLast }: { c: ConsultantRow; isLast: boolean }) {
  return (
    <View
      style={isLast ? [styles.contactRow, styles.rowLast] : styles.contactRow}
      wrap={false}
    >
      <View style={styles.firmCell}>
        <Text style={styles.firmName}>{c.firmName}</Text>
        <Text
          style={[
            styles.sideLine,
            { color: c.side === "buyer" ? COLORS.buyer : COLORS.seller },
          ]}
        >
          {c.side === "buyer" ? "Buyer-side" : "Seller-side"}
        </Text>
      </View>
      <Text style={styles.contactRole}>{c.contactName ?? ""}</Text>
      <Text style={styles.contactEmail}>{c.contactEmail ?? ""}</Text>
      <Text style={styles.contactPhone}>{c.contactPhone ?? ""}</Text>
    </View>
  );
}

export function DdTrackingDoc({
  dealName,
  dateLabel,
  purchasePrice,
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
          {purchasePrice != null && (
            <Text style={styles.purchasePrice}>
              <Text style={styles.purchasePriceLabel}>PURCHASE PRICE  </Text>
              {formatCurrency(purchasePrice)}
            </Text>
          )}
        </View>

        {/* Section 1: Key Dates */}
        <Section
          header="KEY DATES"
          headerStyle={styles.sectionHeader}
          emptyNote="No milestone dates on this deal yet."
          emptyNoteStyle={styles.emptyNote}
          groups={[
            {
              key: "milestones",
              band: null,
              rows: milestones.map((m, i) => (
                <MilestoneRowView
                  key={`m-${i}`}
                  m={m}
                  isLast={i === milestones.length - 1}
                />
              )),
            },
          ]}
        />

        {/* Section 2: Issues */}
        <Section
          header="ISSUES"
          headerStyle={styles.sectionHeader}
          emptyNote="No issues tracked on this deal yet."
          emptyNoteStyle={styles.emptyNote}
          groups={issueGroupOrder.map((status) => ({
            key: status,
            band: (
              <View style={styles.band}>
                <Text style={[styles.bandText, { color: STATUS_META[status].color }]}>
                  {STATUS_META[status].label.toUpperCase()} ({groupedIssues[status].length})
                </Text>
              </View>
            ),
            rows: groupedIssues[status].map((r, i) => (
              <IssueRowView
                key={`${status}-${i}`}
                r={r}
                isLast={i === groupedIssues[status].length - 1}
              />
            )),
          }))}
        />

        {/* Section 3: Deal Team */}
        <Section
          header="DEAL TEAM"
          headerStyle={styles.sectionHeader}
          emptyNote="No deal team members recorded yet."
          emptyNoteStyle={styles.emptyNote}
          groups={TEAM_ORDER.map((t) => ({
            key: t,
            band: (
              <View style={styles.band}>
                <Text style={styles.bandText}>{TEAM_LABEL[t].toUpperCase()}</Text>
              </View>
            ),
            rows: teamByGroup[t].map((m, i) => (
              <View
                key={`${t}-${i}`}
                style={
                  i === teamByGroup[t].length - 1
                    ? [styles.contactRow, styles.rowLast]
                    : styles.contactRow
                }
                wrap={false}
              >
                <Text style={styles.contactName}>{m.name || "—"}</Text>
                <Text style={styles.contactRole}>{m.roleLabel || ""}</Text>
                <Text style={styles.contactEmail}>{m.email ?? ""}</Text>
                <Text style={styles.contactPhone}>{m.phone ?? ""}</Text>
              </View>
            )),
          }))}
        />

        {/* Section 4: Consultants */}
        <Section
          header="CONSULTANTS"
          headerStyle={styles.sectionHeader}
          emptyNote="No consultants recorded yet."
          emptyNoteStyle={styles.emptyNote}
          groups={Array.from(consultantsByRole.entries()).map(([roleLabel, firms]) => ({
            key: roleLabel,
            band: (
              <View style={styles.band}>
                <Text style={styles.bandText}>{roleLabel.toUpperCase()}</Text>
              </View>
            ),
            rows: firms.map((c, i) => (
              <ConsultantRowView
                key={`${roleLabel}-${i}`}
                c={c}
                isLast={i === firms.length - 1}
              />
            )),
          }))}
        />

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
