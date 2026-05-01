import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { authUser, builders, contacts, dealBuyers, users } from "@/db/schema";
import { getCurrentOrg } from "@/lib/auth/get-current-org";

import type { LeadOption } from "../lead-picker";

export type Tier = "green" | "yellow" | "red" | "not_selected";
export type Classification = "private" | "public";

export type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type BuyerGroup = {
  dealBuyerId: string;
  builderId: string;
  builderName: string;
  classification: Classification;
  tier: Tier;
  leadUserId: string | null;
  leadName: string | null;
  called: boolean;
  omSent: boolean;
  comments: string | null;
  contacts: ContactRow[];
};

export type BuyerData = {
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
};

// Shared loader so each prototype view doesn't re-implement the JOIN.
// Returns one BuyerGroup per builder-on-deal with its contacts nested.
export async function loadBuyers(dealId: string): Promise<BuyerData> {
  const org = await getCurrentOrg();

  const rows = await db
    .select({
      dealBuyerId: dealBuyers.id,
      tier: dealBuyers.tier,
      omSentAt: dealBuyers.omSentAt,
      calledAt: dealBuyers.calledAt,
      comments: dealBuyers.comments,
      builderId: builders.id,
      builderName: builders.name,
      classification: builders.classification,
      contactId: contacts.id,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactTitle: contacts.title,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      contactNotes: contacts.notes,
      leadUserId: dealBuyers.leadUserId,
      leadName: authUser.name,
    })
    .from(dealBuyers)
    .innerJoin(builders, eq(dealBuyers.builderId, builders.id))
    .leftJoin(contacts, eq(contacts.builderId, builders.id))
    .leftJoin(users, eq(users.id, dealBuyers.leadUserId))
    .leftJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(dealBuyers.dealId, dealId))
    .orderBy(builders.name, contacts.lastName);

  const map = new Map<string, BuyerGroup>();
  for (const r of rows) {
    let g = map.get(r.dealBuyerId);
    if (!g) {
      g = {
        dealBuyerId: r.dealBuyerId,
        builderId: r.builderId,
        builderName: r.builderName,
        classification: r.classification,
        tier: r.tier,
        leadUserId: r.leadUserId,
        leadName: r.leadName,
        called: r.calledAt !== null,
        omSent: r.omSentAt !== null,
        comments: r.comments,
        contacts: [],
      };
      map.set(r.dealBuyerId, g);
    }
    if (r.contactId) {
      g.contacts.push({
        id: r.contactId,
        firstName: r.contactFirstName ?? "",
        lastName: r.contactLastName ?? "",
        fullName: `${r.contactFirstName ?? ""} ${r.contactLastName ?? ""}`.trim(),
        title: r.contactTitle,
        email: r.contactEmail,
        phone: r.contactPhone,
        notes: r.contactNotes,
      });
    }
  }

  const orgUsers = org
    ? await db
        .select({
          id: users.id,
          name: authUser.name,
          email: authUser.email,
        })
        .from(users)
        .innerJoin(authUser, eq(authUser.id, users.authUserId))
        .where(eq(users.orgId, org.id))
        .orderBy(asc(authUser.name))
    : [];

  const leadOptions: LeadOption[] = orgUsers.map((u) => ({
    id: u.id,
    name: u.name || u.email,
  }));

  return { groups: Array.from(map.values()), leadOptions };
}
