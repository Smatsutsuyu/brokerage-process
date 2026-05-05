// Phone-number normalization. Single function used at both write time
// (server actions normalize before insert/update) and read time (display
// fallback for legacy rows that were stored before normalization existed).
//
// Idempotent: feeding "(949) 555-0103" back in returns "(949) 555-0103".
//
// US-only assumption: 10 digits → "(NPA) NXX-XXXX"; 11 digits starting
// with 1 → same with leading 1 dropped. Anything else (extensions, intl,
// alphanumeric vanity numbers) is returned as-is so we don't mangle real
// data we don't recognize.

export function formatPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pull out just the digits. If there's anything that survives that isn't
  // a normal phone-number character, treat as foreign and return verbatim.
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Unknown shape — extensions, international, etc. Leave it alone rather
  // than risk losing information.
  return trimmed;
}
