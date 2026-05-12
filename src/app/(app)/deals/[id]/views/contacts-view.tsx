// Production Contacts view. Renders the cards layout (formerly
// option-a-cards in the prototype set) — Chris picked it as the canonical
// surface (2026-05-12 feedback). The other prototype components stay on
// disk in case a layout decision gets revisited but aren't reachable from
// the UI any more (the prototype tab strip was removed).

import { loadBuyers } from "./prototypes/load-buyers";
import { OptionACards } from "./prototypes/option-a-cards";

type ContactsViewProps = {
  dealId: string;
};

export async function ContactsView({ dealId }: ContactsViewProps) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);
  return (
    <OptionACards
      dealId={dealId}
      groups={groups}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}
