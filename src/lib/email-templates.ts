// Email subject + body templates used by the in-app email composer.
// Templates use {{var}} placeholders resolved by `interpolate()` below.
//
// Source: Chris's Marketing Process Checklist xlsx. Each template's
// origin is noted inline. Templates with no Excel source (e.g. send
// consultant roster) carry a sensible default that Chris can edit
// in-place at the preview step.
//
// Substitution is intentionally dumb (single regex), no helpers, no
// formatters. If a placeholder is missing from `vars`, it's left in
// the output verbatim so the user notices in the preview rather than
// silently shipping with "Hi {{firstName}}".

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

// Common deal vars used across templates. Sender's first name is
// resolved at compose time from the picked sender option, not baked
// into vars at the call site, so a swap re-renders the signature.
//
// dealName, units, type, city: from the deal row.
// senderName: first name of the picked sender.
// dueDate: formatted date for offers-due reminders. Caller supplies.

// Phase 2 - Confidentiality Agreement distribution. Sent before the OM
// blast to lay groundwork. Body lifted from the existing planned-action
// description Chris wrote earlier; tier audience picked at send time
// since CA is the broadest first-touch.
export const CA_DISTRIBUTION_TEMPLATE: EmailTemplate = {
  subject: "Confidentiality Agreement, {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `We'd like to share some information on a proposed {{units}} {{type}} deal in {{city}}. We'd like to keep information confidential and are sharing the proposed confidentiality agreement.

Please review and let us know if this form works and we will send it out for signatures.

Thanks,
{{senderName}}`,
};

// Phase 2 - Send out OM Blast.
//
// Two variants:
//   - OM_BLAST_TEMPLATE includes the offers-due line and is used when
//     the deal's Offering Date milestone row is set. {{dueDate}} is
//     sourced from that row via getOmBlastTemplateContext.
//   - OM_BLAST_TEMPLATE_NO_DATE drops the offers-due line entirely. The
//     OmBlastButton swaps to this variant when the user confirms they
//     want to send without an Offering Date set (the OM often goes out
//     before the deadline is finalized).
export const OM_BLAST_TEMPLATE: EmailTemplate = {
  subject: "Offering Memorandum, {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `Please find offering memorandum for {{dealName}} in {{city}}. The Project includes {{units}} {{type}}.

Offers on this Project are due on {{dueDate}}.

Let's schedule a time to connect in the next week.

Thanks,
{{senderName}}`,
};

export const OM_BLAST_TEMPLATE_NO_DATE: EmailTemplate = {
  subject: "Offering Memorandum, {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `Please find offering memorandum for {{dealName}} in {{city}}. The Project includes {{units}} {{type}}.

Let's schedule a time to connect in the next week.

Thanks,
{{senderName}}`,
};

// Phase 2 - Request In-Person Meeting (priority/Green buyers).
export const IN_PERSON_MEETING_TEMPLATE: EmailTemplate = {
  subject: "In-person meeting, {{dealName}} ({{city}})",
  body: `Please find offering memorandum for {{dealName}} in {{city}}. The Project includes {{units}} {{type}}.

Is there a time we can come by your office (or ours) to discuss the Project and catch up?

Thanks,
{{senderName}}`,
};

// Phase 2 - Q&A File distribution.
export const QA_FILE_TEMPLATE: EmailTemplate = {
  subject: "Q&A File, {{dealName}}",
  body: `Please find attached Q&A File that we hope will be helpful in analyzing the Project. Please reach out if you have any questions.

Thanks,
{{senderName}}`,
};

// Phase 2 - Send Marketing Report to Owner Team (with co-brokers + any
// always-CC users picked at compose time). The freshly-generated PDF is
// attached server-side at send time.
export const MARKETING_REPORT_DISTRIBUTION_TEMPLATE: EmailTemplate = {
  subject: "Marketing Report, {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `Please find attached the current Marketing Report for {{dealName}}. It reflects the latest buyer interest and where each builder stands.

Let me know if you want to walk through anything on a call.

Thanks,
{{senderName}}`,
};

// Phase 2 - Share Market Study.
export const MARKET_STUDY_TEMPLATE: EmailTemplate = {
  subject: "Market Study, {{dealName}}",
  body: `Please find attached market study that was prepared for the Project. We hope this is helpful in determining pricing, absorption, and segmentation against communities.

Thanks,
{{senderName}}`,
};

// Phase 1 - Distribute Cost to Complete (CTC) report to buyers. Mirrors
// the Market Study flow: uploaded PDF attached from the checklist row,
// green/yellow default audience, file pre-flight gate.
export const CTC_DISTRIBUTION_TEMPLATE: EmailTemplate = {
  subject: "Cost to Complete, {{dealName}}",
  body: `Please find attached the Cost to Complete report for {{dealName}}. Let us know if you have questions on the assumptions or need any of the supporting backup.

Thanks,
{{senderName}}`,
};

// Phase 2 - Share Marketing Due Diligence Folder. Usually carries a
// Dropbox / SharePoint folder URL (added to the checklist row's Link
// affordance) and optionally an index file. The send button validates
// file-or-link presence before opening the composer; when the user has
// added a link, the URL is appended to the body at send time by the
// blast pipeline's link-inlining behavior.
export const SHARE_MARKETING_DD_TEMPLATE: EmailTemplate = {
  subject: "Marketing Due Diligence folder, {{dealName}}",
  body: `Please find the marketing due diligence folder for {{dealName}} in {{city}}.

Let us know if you have any questions or need access to anything in particular.

Thanks,
{{senderName}}`,
};

// Phase 2 - Email Notification of Offer Due Date (5 days before).
export const OFFERS_DUE_NOTICE_TEMPLATE: EmailTemplate = {
  subject: "Offers due {{dueDate}}, {{dealName}}",
  body: `Offers are due in a week on {{dueDate}}. Please let us know if you have any concerns hitting this deadline.

Let us know if you have any questions.

Thanks,
{{senderName}}`,
};

// Phase 2 - Day-of Reminder.
export const OFFERS_DUE_DAY_OF_TEMPLATE: EmailTemplate = {
  subject: "Reminder, offers due today, {{dealName}}",
  body: `As a reminder, offers are due later today. Please let us know if you have any questions.

Please fill out the attached underwriting sheet and send back with your offer.

Thanks,
{{senderName}}`,
};

// Phase 2 - Follow-up to non-responders. Excel template was incomplete
// ("Custom Email: 5 pm day of offers …") so this is our default fill.
export const OFFERS_FOLLOWUP_TEMPLATE: EmailTemplate = {
  subject: "Following up, {{dealName}} offers",
  body: `Following up on the offer for {{dealName}}. We haven't received an offer yet and wanted to check in before we wrap up the offer window.

Let us know if you're still planning to submit, or if you've decided to pass.

Thanks,
{{senderName}}`,
};

// Phase 3 - Send out Best & Final invitation. Skeleton: structure is
// fixed but `{{bnfDueDate}}` is unsubstituted at compose time (the date
// source is being followed up on; for now the placeholder is left
// visible so the user notices and fills it in before sending). Two
// section bodies (Close of Escrow, Closing Conditions) are deliberately
// blank pending Chris's final language.
export const BEST_AND_FINAL_INVITATION_TEMPLATE: EmailTemplate = {
  subject: "Best & Final invitation, {{dealName}}",
  body: `Thank you for submitting your offer for the {{units}} lots at {{dealName}}. We are pleased to inform you that your firm is invited to participate in the Best and Final round. Best and Final offers must be submitted by 12:00 p.m. on {{bnfDueDate}}. The following represents the minimum terms under which the Seller is willing to negotiate a formal Purchase and Sale Agreement.

Purchase Price:
- Submit Best & Final

Due Diligence Period:
- The due diligence period shall continue for a period of 60 days following mutual execution of the Letter of Intent ("LOI").

Close of Escrow:

Deposits:
- The total non-refundable deposit at the end of feasibility shall be no less than TEN PERCENT (10%) of the Purchase Price of the property.

Closing Conditions:

Thanks,
{{senderName}}`,
};

// Phase 3 - Schedule Summary of Offer Review (to Owner Team, CC
// Broker Team).
export const SCHEDULE_SOO_REVIEW_TEMPLATE: EmailTemplate = {
  subject: "Offer review for {{dealName}}",
  body: `In anticipation of offers coming in on {{offersDueDate}}, we'd like to schedule a time to review on {{reviewDate}}. In the meantime, we will forward over offers as we receive them.

Thanks,
{{senderName}}`,
};

// Phase 4 - Share Due Diligence Material / Set Meeting.
export const SHARE_DD_MATERIAL_TEMPLATE: EmailTemplate = {
  subject: "Due Diligence package, {{dealName}}",
  body: `Please find attached due diligence folder: {{ddFolderUrl}}.

What time works for everyone to do a due diligence kickoff call over the next week?

Thanks,
{{senderName}}`,
};

// Phase 4 - Send Consultant Roster (no Excel template; sensible default).
export const CONSULTANT_ROSTER_TEMPLATE: EmailTemplate = {
  subject: "Consultant roster, {{dealName}}",
  body: `Attached is the consultant roster for {{dealName}}. Let us know if you'd like introductions to anyone on the list.

Thanks,
{{senderName}}`,
};

// Deal Status - templated status update to the Owner Team. Cross-phase
// (any time during the deal); attached PDF summarizes checklist progress,
// recently completed items, upcoming milestones, open issues, and the
// Owner Team roster.
export const DEAL_STATUS_TEMPLATE: EmailTemplate = {
  subject: "Status update, {{dealName}} ({{units}} {{type}}, {{city}})",
  body: `Attached is the current status report for {{dealName}}, covering progress by phase, recently completed items, upcoming milestones, and open issues.

Let me know if you'd like to walk through anything.

Thanks,
{{senderName}}`,
};

// Phase 4 - Send the combined Due Diligence Tracking PDF (key dates +
// issues + deal team + consultants) before bi-weekly DD calls.
export const DD_TRACKING_TEMPLATE: EmailTemplate = {
  subject: "Due diligence tracker, {{dealName}}",
  body: `Attached is the current Due Diligence Tracking report for {{dealName}}, covering key milestone dates, open issues, the deal team, and consultants ahead of our next call.

Let us know if anything's missing or if any open items need to move ahead of schedule.

Thanks,
{{senderName}}`,
};
