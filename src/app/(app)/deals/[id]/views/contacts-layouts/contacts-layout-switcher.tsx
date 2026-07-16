"use client";

import { useMemo, useState } from "react";

import { ContactsLayoutPicker } from "./contacts-layout-picker";
import { CONTACTS_LAYOUTS, type ContactsLayoutKey } from "./layout-keys";
import type { BuyerGroup } from "./load-buyers";
import { OptionACards } from "./option-a-cards";
import { OptionBPane } from "./option-b-pane";
import { OptionCGrouped } from "./option-c-grouped";
import { OptionDCompact } from "./option-d-compact";
import type { LeadOption } from "../lead-picker";
import type { ExistingContactOption } from "../pick-existing-contact-modal";

type ContactsLayoutSwitcherProps = {
  dealId: string;
  initialLayout: ContactsLayoutKey;
  groups: BuyerGroup[];
  leadOptions: LeadOption[];
  orgContacts: ExistingContactOption[];
};

type BuilderGroup = Extract<BuyerGroup, { kind: "builder" }>;

// Client-side layout switcher. The server component (ContactsView) loads
// buyer data once and hands it in via props; switching layouts is a pure
// client state change plus a history.replaceState URL sync, so no RSC
// roundtrip or DB re-query on click.
//
// URL is still authoritative on initial load — server parses ?layout=
// and passes it as initialLayout, so a bookmarked or shared URL renders
// the right layout at SSR time. Subsequent switches use replaceState so
// the URL stays in sync for further sharing without triggering a nav.
export function ContactsLayoutSwitcher({
  dealId,
  initialLayout,
  groups,
  leadOptions,
  orgContacts,
}: ContactsLayoutSwitcherProps) {
  const [layout, setLayout] = useState<ContactsLayoutKey>(initialLayout);

  // B/C/D were written before deal_contacts added the Unaffiliated
  // bucket and only know how to render builder groups. Memoize so the
  // filter isn't re-run on every layout switch.
  const builderGroups = useMemo<BuilderGroup[]>(
    () => groups.filter((g): g is BuilderGroup => g.kind === "builder"),
    [groups],
  );

  function handleLayoutChange(next: ContactsLayoutKey) {
    setLayout(next);
    // Native history API — updates the URL without triggering a Next.js
    // navigation (router.replace would re-fetch the RSC payload and
    // re-run loadBuyers server-side).
    const params = new URLSearchParams(window.location.search);
    if (next === "a") params.delete("layout");
    else params.set("layout", next);
    const qs = params.toString();
    const nextUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }

  // Sanity: if a bad key somehow gets in state, fall back to "a" for
  // render (shouldn't happen — layout-keys.ts parseLayoutParam gates
  // the URL side and the picker enforces the union on the click side).
  const activeKey: ContactsLayoutKey = CONTACTS_LAYOUTS.some((l) => l.key === layout)
    ? layout
    : "a";

  return (
    <div>
      <ContactsLayoutPicker active={activeKey} onChange={handleLayoutChange} />
      {activeKey === "a" && (
        <OptionACards
          dealId={dealId}
          groups={groups}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {activeKey === "b" && (
        <OptionBPane
          dealId={dealId}
          groups={builderGroups}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {activeKey === "c" && (
        <OptionCGrouped
          dealId={dealId}
          groups={builderGroups}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
      {activeKey === "d" && (
        <OptionDCompact
          dealId={dealId}
          groups={builderGroups}
          leadOptions={leadOptions}
          orgContacts={orgContacts}
        />
      )}
    </div>
  );
}
