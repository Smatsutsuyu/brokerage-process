"use client";

import { cn } from "@/lib/utils";

import { CONTACTS_LAYOUTS, type ContactsLayoutKey } from "./layout-keys";

type ContactsLayoutPickerProps = {
  active: ContactsLayoutKey;
  onChange: (next: ContactsLayoutKey) => void;
};

// Controlled segmented control. The switcher above owns layout state
// (see contacts-layout-switcher.tsx) so a click doesn't trigger a full
// RSC roundtrip via router.replace — URL sync is handled there via
// history.replaceState instead.
export function ContactsLayoutPicker({ active, onChange }: ContactsLayoutPickerProps) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        Layout
      </span>
      <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
        {CONTACTS_LAYOUTS.map((layout) => {
          const isActive = layout.key === active;
          return (
            <button
              key={layout.key}
              type="button"
              onClick={() => {
                if (layout.key !== active) onChange(layout.key);
              }}
              className={cn(
                "rounded px-3 py-1 text-[12px] font-medium transition-colors",
                isActive
                  ? "bg-white text-brand-blue shadow-sm"
                  : "text-gray-600 hover:text-gray-900",
              )}
            >
              {layout.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
