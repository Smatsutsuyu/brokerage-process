// Whole-dollar USD formatter used wherever a purchase price is
// displayed. Consumed by the deal header chip + the DD Tracking PDF
// header. Whole-dollar rounding is fine at land-deal magnitudes; the
// underlying numeric(14,2) column can carry cents if we ever need
// them.

const FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(n: number): string {
  return FORMATTER.format(n);
}
