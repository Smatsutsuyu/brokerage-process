// Canonical parser for user-supplied email addresses. Called from every
// server action that stores an email in the database (contacts, deal team
// members, consultants). Repairs the common paste-mistakes we've seen in
// the wild without silently accepting garbage:
//
//   - Trims surrounding whitespace.
//   - "Name <email@example.com>"  →  "email@example.com"  (Outlook copy).
//   - "<email@example.com>"       →  "email@example.com".
//   - "email@example.com>"        →  "email@example.com"  (this is the
//                                    exact bug that broke a real send in
//                                    July 2026 — Resend rejects with 422
//                                    "Invalid `to` field").
//   - "<email@example.com"        →  "email@example.com".
//
// Rejects anything that doesn't then match a conservative email shape
// (no whitespace, no < or > in the local or domain part, one @, one dot).
// Throws on invalid non-empty input so the server action bubbles a clear
// error to the client. Returns null for empty/whitespace/null input since
// email is optional on most surfaces.
//
// Not RFC 5321 perfect (rejects quoted local parts, IP-literal domains,
// internationalized addresses). That's deliberate — those are effectively
// zero at Lakebridge's scale, and permissive email regex has bitten this
// codebase once already.

const EMAIL_REGEX = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export function parseEmailAddress(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;

  // "Display Name <email@example.com>" — extract the address in brackets.
  // The .+ before < guards against matching bare "<email>" which the next
  // branch handles cleanly.
  const nameAngle = s.match(/^.+<([^<>]+)>$/);
  if (nameAngle) {
    s = nameAngle[1].trim();
  } else {
    // Bare "<email@example.com>" — strip the pair together.
    if (s.startsWith("<") && s.endsWith(">")) {
      s = s.slice(1, -1).trim();
    }
    // Stray single leading < or trailing > (the actual observed bug).
    if (s.startsWith("<")) s = s.slice(1);
    if (s.endsWith(">")) s = s.slice(0, -1);
    s = s.trim();
  }

  if (!EMAIL_REGEX.test(s)) {
    throw new Error(`Invalid email address: "${raw}"`);
  }
  return s;
}
