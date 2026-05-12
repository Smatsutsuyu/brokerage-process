import { type BuyerGroup, loadBuyers } from "./load-buyers";
import { OptionACards } from "./option-a-cards";
import { OptionBPane } from "./option-b-pane";
import { OptionCGrouped } from "./option-c-grouped";
import { OptionDCompact } from "./option-d-compact";

// Thin server wrappers — each loads the same buyer data and hands it to a
// client component. The card layout (option-a) became the production view
// and was promoted out of these wrappers; b/c/d remain as design-comparison
// references but aren't reachable from the UI anymore (the prototype tab
// strip was removed). Kept on disk in case a layout decision gets revisited.
//
// b/c/d only know how to render BUILDER groups — they were written before
// the deal_contacts model added the Unaffiliated bucket. Pre-filter the
// groups so they keep compiling without a rewrite they don't deserve.

type BuilderGroup = Extract<BuyerGroup, { kind: "builder" }>;
function builderGroupsOnly(groups: BuyerGroup[]): BuilderGroup[] {
  return groups.filter((g): g is BuilderGroup => g.kind === "builder");
}

export async function PrototypeAView({ dealId }: { dealId: string }) {
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

export async function PrototypeBView({ dealId }: { dealId: string }) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);
  return (
    <OptionBPane
      dealId={dealId}
      groups={builderGroupsOnly(groups)}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}

export async function PrototypeCView({ dealId }: { dealId: string }) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);
  return (
    <OptionCGrouped
      dealId={dealId}
      groups={builderGroupsOnly(groups)}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}

export async function PrototypeDView({ dealId }: { dealId: string }) {
  const { groups, leadOptions, orgContacts } = await loadBuyers(dealId);
  return (
    <OptionDCompact
      dealId={dealId}
      groups={builderGroupsOnly(groups)}
      leadOptions={leadOptions}
      orgContacts={orgContacts}
    />
  );
}
