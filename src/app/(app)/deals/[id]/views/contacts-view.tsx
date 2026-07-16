// Production Contacts view. Loads buyer data once on the server and
// hands it to the client-side layout switcher. Layout switching is a
// client-only concern from here on — no server roundtrip when a user
// changes the layout picker, since the switcher already has all the
// data in memory and updates the URL via history.replaceState.
//
// Four layouts ship: Cards (default, canonical daily-driver), Pane,
// Grouped, Compact. B/C/D were written before deal_contacts added the
// Unaffiliated bucket; the switcher pre-filters their input to builder
// groups only. If any of them ever becomes a daily driver it'll need
// a rewrite to consume BuyerGroup (kind: "builder" | "unaffiliated")
// directly.

import { ContactsLayoutSwitcher } from "./contacts-layouts/contacts-layout-switcher";
import type { ContactsLayoutKey } from "./contacts-layouts/layout-keys";
import { loadBuyers } from "./contacts-layouts/load-buyers";

type ContactsViewProps = {
  dealId: string;
  layout: ContactsLayoutKey;
};

export async function ContactsView({ dealId, layout }: ContactsViewProps) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);

  return (
    <ContactsLayoutSwitcher
      dealId={dealId}
      initialLayout={layout}
      groups={groups}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}
