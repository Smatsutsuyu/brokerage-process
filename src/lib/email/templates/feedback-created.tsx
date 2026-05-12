import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./layout";

export type FeedbackCreatedProps = {
  appUrl: string;
  submitterEmail: string | null;
  section: string;
  pagePath: string;
  severity: "nit" | "suggestion" | "bug" | "blocker";
  body: string;
  commitSha: string | null;
};

const SEVERITY_COLOR: Record<FeedbackCreatedProps["severity"], string> = {
  blocker: "#b91c1c",
  bug: "#c2410c",
  suggestion: "#1d4ed8",
  nit: "#6b7280",
};

export function FeedbackCreatedEmail(props: FeedbackCreatedProps) {
  const adminUrl = `${props.appUrl}/admin/feedback`;
  const sevColor = SEVERITY_COLOR[props.severity];
  const preview = `[${props.severity.toUpperCase()}] ${props.section} — ${props.body.slice(0, 80)}`;

  return (
    <EmailLayout preview={preview}>
      <Heading style={h1}>New feedback</Heading>
      <Section style={metaRow}>
        <Text style={{ ...metaPill, backgroundColor: sevColor }}>
          {props.severity.toUpperCase()}
        </Text>
        <Text style={metaText}>
          <strong>{props.section}</strong>
        </Text>
      </Section>
      <Section style={fieldGroup}>
        <Text style={fieldLabel}>From</Text>
        <Text style={fieldValue}>{props.submitterEmail ?? "(unknown)"}</Text>
      </Section>
      <Section style={fieldGroup}>
        <Text style={fieldLabel}>Page</Text>
        <Text style={fieldValueMono}>{props.pagePath}</Text>
      </Section>
      {props.commitSha && (
        <Section style={fieldGroup}>
          <Text style={fieldLabel}>Build</Text>
          <Text style={fieldValueMono}>{props.commitSha.slice(0, 7)}</Text>
        </Section>
      )}
      <Section style={commentBox}>
        <Text style={fieldLabel}>Comment</Text>
        <Text style={commentText}>{props.body}</Text>
      </Section>
      <Section style={{ textAlign: "center", marginTop: 24 }}>
        <Button style={ctaButton} href={adminUrl}>
          Open in admin
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
  margin: "0 0 16px",
};

const metaRow: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 8,
  margin: "0 0 20px",
};

const metaPill: React.CSSProperties = {
  borderRadius: 999,
  color: "#ffffff",
  display: "inline-block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  margin: 0,
  padding: "3px 8px",
};

const metaText: React.CSSProperties = {
  color: "#374151",
  fontSize: 14,
  margin: 0,
};

const fieldGroup: React.CSSProperties = {
  margin: "0 0 12px",
};

const fieldLabel: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  margin: "0 0 2px",
  textTransform: "uppercase",
};

const fieldValue: React.CSSProperties = {
  color: "#374151",
  fontSize: 13,
  margin: 0,
};

const fieldValueMono: React.CSSProperties = {
  color: "#374151",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 12,
  margin: 0,
};

const commentBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  margin: "16px 0 0",
  padding: "12px 14px",
};

const commentText: React.CSSProperties = {
  color: "#1f2937",
  fontSize: 14,
  lineHeight: "20px",
  margin: "4px 0 0",
  whiteSpace: "pre-wrap",
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
