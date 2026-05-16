import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./layout";

export type FeedbackStatusChangeProps = {
  appUrl: string;
  actorEmail: string | null;
  feedbackSection: string;
  feedbackBody: string;
  feedbackPagePath: string;
  fromStatus: "new" | "reviewed" | "actioned" | "complete" | "wontfix";
  toStatus: "new" | "reviewed" | "actioned" | "complete" | "wontfix";
};

const STATUS_LABEL: Record<FeedbackStatusChangeProps["toStatus"], string> = {
  new: "New",
  reviewed: "Reviewed",
  actioned: "Actioned",
  complete: "Complete",
  wontfix: "Won't fix",
};

export function FeedbackStatusChangeEmail(props: FeedbackStatusChangeProps) {
  const adminUrl = `${props.appUrl}/admin/feedback`;
  const fromLabel = STATUS_LABEL[props.fromStatus];
  const toLabel = STATUS_LABEL[props.toStatus];
  const preview = `${props.actorEmail ?? "Someone"} moved ${props.feedbackSection} from ${fromLabel} to ${toLabel}`;

  return (
    <EmailLayout preview={preview}>
      <Heading style={h1}>Status updated on your feedback</Heading>
      <Text style={subtitle}>
        <strong>{props.actorEmail ?? "Someone"}</strong> moved{" "}
        <strong>{props.feedbackSection}</strong> from <strong>{fromLabel}</strong> to{" "}
        <strong>{toLabel}</strong>
      </Text>

      <Section style={originalBox}>
        <Text style={fieldLabel}>Your feedback</Text>
        <Text style={originalText}>{props.feedbackBody}</Text>
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
  margin: "0 0 8px",
};

const subtitle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 14,
  margin: "0 0 20px",
};

const fieldLabel: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.05em",
  margin: "0 0 4px",
  textTransform: "uppercase",
};

const originalBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "10px 14px",
};

const originalText: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 13,
  fontStyle: "italic",
  lineHeight: "18px",
  margin: 0,
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
