"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { CONTACTS_LAYOUTS, type ContactsLayoutKey } from "./layout-keys";

type ContactsLayoutPickerProps = {
  active: ContactsLayoutKey;
};

export function ContactsLayoutPicker({ active }: ContactsLayoutPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setLayout(next: ContactsLayoutKey) {
    if (next === active) return;
    const params = new URLSearchParams(searchParams.toString());
    // Default layout ("a") stays param-free so bookmarks and the canonical
    // Contacts URL don't grow a redundant ?layout=a suffix.
    if (next === "a") params.delete("layout");
    else params.set("layout", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

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
              onClick={() => setLayout(layout.key)}
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
