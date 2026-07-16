// Production Contacts view. Loads buyer data once and hands it to whichever
// layout the ?layout= URL param selects. Four layouts ship: Cards (default,
// what Chris uses day-to-day), Pane, Grouped, and Compact. All four are
// production surfaces — the layout picker at the top lets any team member
// switch on the fly.
//
// Historical note: b/c/d were built before deal_contacts added the
// Unaffiliated bucket and only know how to render builder groups. The
// pre-filter below keeps them compiling; if a layout ever needs to become
// the canonical daily-driver, it'll need a rewrite to consume BuyerGroup
// (kind: "builder" | "unaffiliated") directly.

import type { BuyerGroup } from "./contacts-layouts/load-buyers";
import { loadBuyers } from "./contacts-layouts/load-buyers";
import { ContactsLayoutPicker } from "./contacts-layouts/contacts-layout-picker";
import type { ContactsLayoutKey } from "./contacts-layouts/layout-keys";
import { OptionACards } from "./contacts-layouts/option-a-cards";
import { OptionBPane } from "./contacts-layouts/option-b-pane";
import { OptionCGrouped } from "./contacts-layouts/option-c-grouped";
import { OptionDCompact } from "./contacts-layouts/option-d-compact";

type BuilderGroup = Extract<BuyerGroup, { kind: "builder" }>;
function builderGroupsOnly(groups: BuyerGroup[]): BuilderGroup[] {
  return groups.filter((g): g is BuilderGroup => g.kind === "builder");
}

type ContactsViewProps = {
  dealId: string;
  layout: ContactsLayoutKey;
};

export async function ContactsView({ dealId, layout }: ContactsViewProps) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);

  return (
    <div>
      <ContactsLayoutPicker active={layout} />
      {layout === "a" && (
        <OptionACards
          dealId={dealId}
          groups={groups}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {layout === "b" && (
        <OptionBPane
          dealId={dealId}
          groups={builderGroupsOnly(groups)}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {layout === "c" && (
        <OptionCGrouped
          dealId={dealId}
          groups={builderGroupsOnly(groups)}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {layout === "d" && (
        <OptionDCompact
          dealId={dealId}
          groups={builderGroupsOnly(groups)}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
    </div>
  );
}
