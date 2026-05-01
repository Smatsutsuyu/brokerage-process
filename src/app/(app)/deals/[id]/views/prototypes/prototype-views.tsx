import { loadBuyers } from "./load-buyers";
import { OptionACards } from "./option-a-cards";
import { OptionBPane } from "./option-b-pane";
import { OptionCGrouped } from "./option-c-grouped";
import { OptionDCompact } from "./option-d-compact";

// Thin server wrappers — each loads the same buyer data and hands it to a
// client component. Identical query, four layout treatments. They live as
// sibling tabs to the production Contacts view so we can A/B them in the UI.

export async function PrototypeAView({ dealId }: { dealId: string }) {
  const { groups, leadOptions } = await loadBuyers(dealId);
  return <OptionACards dealId={dealId} groups={groups} leadOptions={leadOptions} />;
}

export async function PrototypeBView({ dealId }: { dealId: string }) {
  const { groups, leadOptions } = await loadBuyers(dealId);
  return <OptionBPane dealId={dealId} groups={groups} leadOptions={leadOptions} />;
}

export async function PrototypeCView({ dealId }: { dealId: string }) {
  const { groups, leadOptions } = await loadBuyers(dealId);
  return <OptionCGrouped dealId={dealId} groups={groups} leadOptions={leadOptions} />;
}

export async function PrototypeDView({ dealId }: { dealId: string }) {
  const { groups, leadOptions } = await loadBuyers(dealId);
  return <OptionDCompact dealId={dealId} groups={groups} leadOptions={leadOptions} />;
}
