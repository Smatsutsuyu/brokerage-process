import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

// Shared shell for all platform emails. Land Advisors-branded footer, neutral
// header (the From: address tells recipients who it's from). Single-column,
// 600px max — the standard for broad client compatibility.
export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section>{children}</Section>
          <Hr style={hr} />
          <Section>
            <Text style={footer}>
              Lakebridge Capital · Land Advisors Organization
              <br />
              100 Spectrum Center Drive, Suite 1400, Irvine CA 92618
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f5f5f5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: 8,
  margin: "0 auto",
  maxWidth: 600,
  padding: "32px 28px",
};

const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "32px 0 16px",
};

const footer: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 11,
  lineHeight: "16px",
  margin: 0,
  textAlign: "center",
};
