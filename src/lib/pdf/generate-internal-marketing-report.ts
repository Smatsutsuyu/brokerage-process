import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  authUser,
  builders,
  contacts,
  dealBuyers,
  dealContacts,
  deals,
  users,
} from "@/db/schema";

import {
  InternalMarketingReportDoc,
  type InternalMarketingBuilder,
  type InternalMarketingContact,
  type InternalMarketingTier,
} from "./internal-marketing-report";

// Loader + renderer for the Internal Marketing Report PDF. Pulls the
// same data the Contacts tab cards show — builder + tier + lead +
// called/confi/OM/offer flags + comments + per-contact details — and
// hands it to InternalMarketingReportDoc for rendering.
//
// Org-scoped, mirrors generate-marketing-report.ts so handoff readers
// see the same shape of helper for both PDFs.

export type InternalMarketingReportPdf = {
  filename: string;
  content: Buffer;
};

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export async function generateInternalMarketingReportPdf(input: {
  dealId: string;
  orgId: string;
}): Promise<InternalMarketingReportPdf | null> {
  const [deal] = await db
    .select({ id: deals.id, name: deals.name })
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.orgId, input.orgId)))
    .limit(1);
  if (!deal) return null;

  // Pull every contact on the deal joined to its (optional) builder and
  // (optional) deal_buyers row. Standalone contacts have null builder
  // and dealBuyer columns. Order so contacts cluster under their
  // builder and contacts within a builder are stable.
  const rows = await db
    .select({
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      receivesCommunication: contacts.receivesCommunication,
      builderId: builders.id,
      builderName: builders.name,
      classification: builders.classification,
      dealBuyerId: dealBuyers.id,
      tier: dealBuyers.tier,
      omSentAt: dealBuyers.omSentAt,
      ddSentAt: dealBuyers.ddSentAt,
      offerReceivedAt: dealBuyers.offerReceivedAt,
      calledAt: dealBuyers.calledAt,
      confiSignedAt: dealBuyers.confiSignedAt,
      comments: dealBuyers.comments,
      leadName: authUser.name,
    })
    .from(dealContacts)
    .innerJoin(contacts, eq(contacts.id, dealContacts.contactId))
    .leftJoin(builders, eq(builders.id, contacts.builderId))
    .leftJoin(
      dealBuyers,
      and(
        eq(dealBuyers.builderId, contacts.builderId),
        eq(dealBuyers.dealId, input.dealId),
      ),
    )
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(
      and(eq(dealContacts.dealId, input.dealId), eq(contacts.orgId, input.orgId)),
    )
    .orderBy(asc(builders.name), asc(contacts.lastName), asc(contacts.firstName));

  // Bucket into builders (when dealBuyer is present) vs unaffiliated.
  const builderMap = new Map<string, InternalMarketingBuilder>();
  const unaffiliated: InternalMarketingContact[] = [];

  for (const r of rows) {
    const contact: InternalMarketingContact = {
      fullName: `${r.contactFirstName} ${r.contactLastName}`.trim(),
      title: r.contactTitle,
      email: r.contactEmail,
      phone: r.contactPhone,
      receivesCommunication: r.receivesCommunication,
    };

    if (r.builderId && r.dealBuyerId && r.builderName && r.classification && r.tier) {
      let b = builderMap.get(r.dealBuyerId);
      if (!b) {
        b = {
          builderName: r.builderName,
          classification: r.classification,
          tier: r.tier as InternalMarketingTier,
          leadName: r.leadName,
          called: r.calledAt !== null,
          confiSigned: r.confiSignedAt !== null,
          omSent: r.omSentAt !== null,
          ddSent: r.ddSentAt !== null,
          offerReceived: r.offerReceivedAt !== null,
          comments: r.comments?.trim() ?? "",
          contacts: [],
        };
        builderMap.set(r.dealBuyerId, b);
      }
      b.contacts.push(contact);
    } else {
      unaffiliated.push(contact);
    }
  }

  const buildersOut = Array.from(builderMap.values());

  const content = await renderToBuffer(
    InternalMarketingReportDoc({
      dealName: deal.name,
      dateLabel: formatDateLabel(new Date()),
      builders: buildersOut,
      unaffiliatedContacts: unaffiliated,
    }),
  );

  const safeName = deal.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
  const filename = safeName
    ? `${safeName} - Internal Marketing Report.pdf`
    : "Internal Marketing Report.pdf";

  return { filename, content };
}
