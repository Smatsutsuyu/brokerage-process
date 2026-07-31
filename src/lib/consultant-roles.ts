// Canonical consultant-role list: the 13 roles from CLAUDE.md note 16,
// in the same order they're declared in the `consultant_role` Postgres
// enum (src/db/schema/enums.ts). Order matters — it drives the
// Consultants tab layout, the Consultant Roster PDF's section order, and
// the consultant block in the DD Tracking PDF. All three should agree.
//
// Lives in src/lib rather than the deal-views folder so server-only PDF
// code can import it without reaching into a route's component tree.
// The views module re-exports these (and keeps the Tailwind-flavored
// SIDE_META next to the components that use it).

export type ConsultantRoleValue =
  | "landscape_architect"
  | "civil_engineer"
  | "soils_engineer"
  | "cost_to_complete"
  | "hoa"
  | "dry_utility"
  | "phase_1_environmental"
  | "land_use"
  | "biologist"
  | "architect"
  | "psa_attorney"
  | "title"
  | "escrow";

export type ConsultantSideValue = "buyer" | "seller";

export const CONSULTANT_ROLES: Array<{ value: ConsultantRoleValue; label: string }> = [
  { value: "landscape_architect", label: "Landscape Architect" },
  { value: "civil_engineer", label: "Civil Engineer" },
  { value: "soils_engineer", label: "Soils Engineer" },
  { value: "cost_to_complete", label: "Cost to Complete Consultant" },
  { value: "hoa", label: "HOA Consultant" },
  { value: "dry_utility", label: "Dry Utility Consultant" },
  { value: "phase_1_environmental", label: "Phase I Environmental Consultant" },
  { value: "land_use", label: "Land Use Consultant" },
  { value: "biologist", label: "Biologist" },
  { value: "architect", label: "Architect" },
  { value: "psa_attorney", label: "PSA Attorney" },
  { value: "title", label: "Title Consultant" },
  { value: "escrow", label: "Escrow Consultant" },
];

export const ROLE_LABEL = Object.fromEntries(
  CONSULTANT_ROLES.map((r) => [r.value, r.label]),
) as Record<ConsultantRoleValue, string>;

export const SIDE_LABEL: Record<ConsultantSideValue, string> = {
  buyer: "Buyer-side",
  seller: "Seller-side",
};
