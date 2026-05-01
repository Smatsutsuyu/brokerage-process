import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { consultants } from "@/db/schema";

import { ConsultantsList, type ConsultantRow } from "./consultants-list";

type ConsultantsViewProps = {
  dealId: string;
};

export async function ConsultantsView({ dealId }: ConsultantsViewProps) {
  const rows = await db
    .select({
      id: consultants.id,
      role: consultants.role,
      side: consultants.side,
      firmName: consultants.firmName,
      contactName: consultants.contactName,
      contactEmail: consultants.contactEmail,
      contactPhone: consultants.contactPhone,
      notes: consultants.notes,
    })
    .from(consultants)
    .where(eq(consultants.dealId, dealId))
    .orderBy(asc(consultants.role), asc(consultants.side), asc(consultants.firmName));

  const items: ConsultantRow[] = rows.map((r) => ({
    id: r.id,
    role: r.role,
    side: r.side,
    firmName: r.firmName,
    contactName: r.contactName,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    notes: r.notes,
  }));

  return <ConsultantsList dealId={dealId} items={items} />;
}
