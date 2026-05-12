import { Button, Heading, Hr, Section, Text } from "@react-email/components";

import { EmailLayout } from "./layout";

export type FeedbackSummaryItem = {
  id: string;
  severity: "nit" | "suggestion" | "bug" | "blocker";
  status: "new" | "reviewed" | "actioned" | "complete" | "wontfix";
  section: string;
  pagePath: string;
  body: string;
  submitterEmail: string | null;
  createdAt: string;
  commentCount: number;
};

export type FeedbackSummaryProps = {
  appUrl: string;
  items: FeedbackSummaryItem[];
};

const SEVERITY_COLOR: Record<FeedbackSummaryItem["severity"], string> = {
  blocker: "#b91c1c",
  bug: "#c2410c",
  suggestion: "#1d4ed8",
  nit: "#6b7280",
};

const STATUS_LABEL: Record<FeedbackSummaryItem["status"], string> = {
  new: "New",
  reviewed: "Reviewed",
  actioned: "Actioned",
  complete: "Complete",
  wontfix: "Won't fix",
};

const STATUS_ORDER: FeedbackSummaryItem["status"][] = [
  "new",
  "reviewed",
  "actioned",
  "complete",
  "wontfix",
];

export function FeedbackSummaryEmail(props: FeedbackSummaryProps) {
  const adminUrl = `${props.appUrl}/admin/feedback`;
  const total = props.items.length;
  const preview = total === 0 ? "No open feedback" : `${total} open feedback items`;

  // Group items by status, then within each group sort by severity then date.
  const grouped: Record<FeedbackSummaryItem["status"], FeedbackSummaryItem[]> = {
    new: [],
    reviewed: [],
    actioned: [],
    complete: [],
    wontfix: [],
  };
  for (const it of props.items) grouped[it.status].push(it);
  // Only include statuses that actually have items, in the canonical order.
  const sections = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <EmailLayout preview={preview}>
      <Heading style={h1}>Feedback summary</Heading>
      <Text style={subtitle}>
        {total === 0
          ? "No open feedback items right now — nice."
          : `${total} item${total === 1 ? "" : "s"} across ${sections.length} status${sections.length === 1 ? "" : "es"}.`}
      </Text>

      {sections.map((status, sectionIdx) => (
        <Section key={status}>
          {sectionIdx > 0 && <Hr style={sectionDivider} />}
          <Text style={sectionHeading}>
            {STATUS_LABEL[status]} ({grouped[status].length})
          </Text>
          {grouped[status].map((item) => (
            <Section key={item.id} style={itemRow}>
              <Text style={itemHeader}>
                <span
                  style={{
                    ...severityPill,
                    backgroundColor: SEVERITY_COLOR[item.severity],
                  }}
                >
                  {item.severity.toUpperCase()}
                </span>
                &nbsp;
                <strong style={{ color: "#374151" }}>{item.section}</strong>
                {item.commentCount > 0 && (
                  <span style={commentCountText}>
                    &nbsp;· {item.commentCount} {item.commentCount === 1 ? "reply" : "replies"}
                  </span>
                )}
              </Text>
              <Text style={itemBody}>{item.body}</Text>
              <Text style={itemMeta}>
                {item.submitterEmail ?? "(unknown)"} · {item.pagePath} ·{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </Section>
          ))}
        </Section>
      ))}

      <Section style={{ textAlign: "center", marginTop: 24 }}>
        <Button style={ctaButton} href={adminUrl}>
          Open admin feedback page
        </Button>
      </Section>
    </EmailLayout>
  );
}

const h1: React.CSSProperties = {
  color: "#111827",
  fontSize: 22,
  fontWeight: 700,
  lineHeight: "28px",
  margin: "0 0 8px",
};

const subtitle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
  margin: "0 0 24px",
};

const sectionDivider: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};

const sectionHeading: React.CSSProperties = {
  color: "#111827",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.05em",
  margin: "0 0 10px",
  textTransform: "uppercase",
};

const itemRow: React.CSSProperties = {
  borderTop: "1px solid #f3f4f6",
  padding: "10px 0",
};

const itemHeader: React.CSSProperties = {
  fontSize: 13,
  margin: "0 0 4px",
};

const severityPill: React.CSSProperties = {
  borderRadius: 999,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.04em",
  padding: "1px 6px",
  verticalAlign: "middle",
};

const commentCountText: React.CSSProperties = {
  color: "#2563eb",
  fontSize: 11,
};

const itemBody: React.CSSProperties = {
  color: "#374151",
  fontSize: 13,
  lineHeight: "18px",
  margin: "0 0 4px",
};

const itemMeta: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 11,
  margin: 0,
};

const ctaButton: React.CSSProperties = {
  backgroundColor: "#1f2937",
  borderRadius: 6,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 20px",
  textDecoration: "none",
};
