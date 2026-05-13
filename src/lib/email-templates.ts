// Email subject + body templates used by the in-app email composer.
// Templates use {{var}} placeholders resolved by `interpolate()` below.
//
// Source for the OM-blast template: Chris's Marketing Process Checklist
// xlsx (Phase 2 row, "Send out OM Blast"). Other templates from the same
// sheet will land here as their corresponding Send buttons get wired up.
//
// Substitution is intentionally dumb (single regex) — no helpers, no
// formatters. If a placeholder is missing from `vars`, it's left in the
// output verbatim so the user notices in the preview rather than silently
// shipping with "Hi {{firstName}}".

export type EmailTemplate = {
  subject: string;
  body: string;
};

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = vars[key];
    return value !== undefined && value !== "" ? value : match;
  });
}

// Sender name + signature are appended at render time, not embedded in
// the template body, so a user named Sean signing for Chris doesn't have
// to manually swap the closing line.
export const OM_BLAST_TEMPLATE: EmailTemplate = {
  subject: "Offering Memorandum — {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `Please find offering memorandum for {{dealName}} in {{city}}. The Project includes {{units}} {{type}}.

Let's schedule a time to connect in the next week.

Thanks,
{{senderName}}`,
};
