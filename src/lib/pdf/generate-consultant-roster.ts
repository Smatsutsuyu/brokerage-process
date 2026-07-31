import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { consultants, deals } from "@/db/schema";
import { CONSULTANT_ROLES } from "@/lib/consultant-roles";
import { formatPhone } from "@/lib/phone";

import {
  ConsultantRosterDoc,
  type RosterEntry,
  type RosterRoleGroup,
} from "./consultant-roster";

// Single source of truth for rendering the per-deal Consultant Roster PDF
// to bytes. Called from two places:
//   1. /api/deals/[id]/consultant-roster.pdf — streams inline for the
//      browser preview (Send Consultant Roster modal's step 1, plus the
//      standalone "Consultant Roster" button).
//   2. src/lib/email/generators.ts — attached as real bytes when the
//      roster goes out via kind: "generated".
//
// Org-scoped lookup so a forged dealId from a sibling org returns null.

export type ConsultantRosterPdf = {
  filename: string;
  content: Buffer;
};

function formatLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function generateConsultantRosterPdf(input: {
  dealId: string;
  orgId: string;
}): Promise<ConsultantRosterPdf | null> {
  const [deal] = await db
    .select({
      id: deals.id,
      name: deals.name,
      units: deals.units,
      city: deals.city,
      state: deals.state,
      type: deals.type,
    })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, input.orgId)))
    .limit(1);
  if (!deal) return null;

  const rows = await db
    .select({
      role: consultants.role,
      side: consultants.side,
      firmName: consultants.firmName,
      contactName: consultants.contactName,
      contactEmail: consultants.contactEmail,
      contactPhone: consultants.contactPhone,
    })
    .from(consultants)
    .where(and(eq(consultants.dealId, deal.id), eq(consultants.orgId, input.orgId)))
    // Sort inside each role only — section order comes from
    // CONSULTANT_ROLES below, not from the enum's collation.
    .orderBy(asc(consultants.side), asc(consultants.firmName));

  const byRole = new Map<string, RosterEntry[]>();
  for (const r of rows) {
    const list = byRole.get(r.role) ?? [];
    list.push({
      side: r.side,
      firmName: r.firmName,
      contactName: r.contactName?.trim() || null,
      contactEmail: r.contactEmail?.trim() || null,
      contactPhone: formatPhone(r.contactPhone),
    });
    byRole.set(r.role, list);
  }

  // Walk the canonical role list once: filled roles become detail
  // sections, the rest collapse into the trailing "not yet engaged" line.
  const groups: RosterRoleGroup[] = [];
  const unfilledRoleLabels: string[] = [];
  for (const role of CONSULTANT_ROLES) {
    const entries = byRole.get(role.value);
    if (entries && entries.length > 0) {
      groups.push({ roleLabel: role.label, entries });
    } else {
      unfilledRoleLabels.push(role.label);
    }
  }

  const subtitleBits: string[] = [];
  if (deal.units != null) subtitleBits.push(`${deal.units.toLocaleString()} units`);
  if (deal.type) subtitleBits.push(deal.type);
  const location = [deal.city, deal.state].filter(Boolean).join(", ");
  if (location) subtitleBits.push(location);

  const content = await renderToBuffer(
    ConsultantRosterDoc({
      dealName: deal.name,
      dateLabel: formatLong(new Date()),
      dealSubtitle: subtitleBits.length > 0 ? subtitleBits.join(" · ") : null,
      groups,
      unfilledRoleLabels,
      filledCount: groups.length,
      totalRoles: CONSULTANT_ROLES.length,
    }),
  );

  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName
    ? `${safeName} - Consultant Roster.pdf`
    : "Consultant Roster.pdf";

  return { filename, content };
}
