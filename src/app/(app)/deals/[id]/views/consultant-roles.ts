import type { ConsultantRole, ConsultantSide } from "../actions";

export const CONSULTANT_ROLES: Array<{ value: ConsultantRole; label: string }> = [
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
];

export const ROLE_LABEL = Object.fromEntries(
  CONSULTANT_ROLES.map((r) => [r.value, r.label]),
) as Record<ConsultantRole, string>;

export const SIDE_META: Record<ConsultantSide, { label: string; chip: string }> = {
  buyer: { label: "Buyer", chip: "bg-blue-100 text-blue-700" },
  seller: { label: "Seller", chip: "bg-emerald-100 text-emerald-700" },
};

export const SIDE_LABEL: Record<ConsultantSide, string> = {
  buyer: "Buyer-side",
  seller: "Seller-side",
};
