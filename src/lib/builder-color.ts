// Deterministic chip color for a builder. Same builderId → same color across
// the page, so a user can visually group rows that share a company at a glance.
//
// Palette is a curated set of soft Tailwind tints — distinct enough to tell
// apart, gentle enough that a stack of chips doesn't shout. 12 colors covers
// realistic builder counts per deal (CLAUDE.md sizing: 20–50) without
// frequent collisions.
//
// All class strings are literal so Tailwind v4's JIT scanner picks them up.
// Don't construct via concatenation — it'll silently strip the styles.

const PALETTE = [
  "bg-amber-100 text-amber-800",
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-indigo-100 text-indigo-800",
  "bg-lime-100 text-lime-800",
  "bg-orange-100 text-orange-800",
  "bg-pink-100 text-pink-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
  "bg-teal-100 text-teal-800",
  "bg-violet-100 text-violet-800",
] as const;

export function builderChipClass(builderId: string | null | undefined): string {
  if (!builderId) return "bg-gray-100 text-gray-700";
  // djb2-style hash. Stable across page loads since builderId is a UUID
  // that doesn't change once assigned.
  let hash = 0;
  for (let i = 0; i < builderId.length; i++) {
    hash = (hash * 31 + builderId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
