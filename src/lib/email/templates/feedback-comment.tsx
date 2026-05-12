import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./layout";

export type FeedbackCommentProps = {
  appUrl: string;
  authorEmail: string | null;
  feedbackSection: string;
  feedbackBody: string;
  feedbackPagePath: string;
  commentBody: string;
};

export function FeedbackCommentEmail(props: FeedbackCommentProps) {
  const adminUrl = `${props.appUrl}/admin/feedback`;
  const preview = `${props.authorEmail ?? "someone"} replied on ${props.feedbackSection}: ${props.commentBody.slice(0, 60)}`;

  return (
    <EmailLayout preview={preview}>
      <Heading style={h1}>New comment on feedback</Heading>
      <Text style={subtitle}>
        <strong>{props.authorEmail ?? "Someone"}</strong> replied on{" "}
        <strong>{props.feedbackSection}</strong>
      </Text>

      <Section style={originalBox}>
        <Text style={fieldLabel}>Original feedback</Text>
        <Text style={originalText}>{props.feedbackBody}</Text>
      </Section>

      <Section style={commentBox}>
        <Text style={fieldLabel}>New comment</Text>
        <Text style={commentText}>{props.commentBody}</Text>
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
  margin: "0 0 12px",
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

const commentBox: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
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
