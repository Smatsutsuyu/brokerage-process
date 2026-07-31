import type { ConsultantSide } from "../actions";

// Role list + labels are shared with the server-side PDF generators, so
// they live in src/lib/consultant-roles.ts. Re-exported here so the
// existing component imports keep working (and so there's exactly one
// place to add a role).
export {
  CONSULTANT_ROLES,
  ROLE_LABEL,
  SIDE_LABEL,
} from "@/lib/consultant-roles";

// UI-only: Tailwind chip classes for the buyer/seller badge. Stays next
// to the components that render it rather than in the shared lib.
export const SIDE_META: Record<ConsultantSide, { label: string; chip: string }> = {
  buyer: { label: "Buyer", chip: "bg-blue-100 text-blue-700" },
  seller: { label: "Seller", chip: "bg-emerald-100 text-emerald-700" },
};
