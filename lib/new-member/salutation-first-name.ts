/**
 * "Given name" for email/SMS (Hey, {name}) when the payload may be:
 * - `first` + `last` (legacy): use first field after removing leading honorifics; keep full first
 *   (e.g. "John Paul" + "Smith" → "John Paul").
 * - `first` only with full name (Facebook, etc.): strip Mr./Dr./etc., strip Jr./Sr., then
 *   take the first token ("Terry Warford Jr." → "Terry").
 */

// Longer tokens first (e.g. "mrs" before "mr" so "Mrs. X" is not read as "Mr" + "s. X").
const LEADING_HONORIFIC =
  /^(?:(?:mrs|miss|ms|mx|dr|mr|professor|prof|rev|reverend|hon|fr|sister|brother|madam|sir))\.?(?:\s+|$)/i;

/**
 * Strips "Jr.", "Sr." (incl. optional comma), and Roman/ordinal-style suffixes from the
 * end. Only used when `firstName` is the full name (no separate lastName).
 */
function stripTrailingSuffixes(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s*,?\s*((j|s)r)\.?$/i, "").trim();
  }
  t = t.replace(/\s+((?:ii|iii|iv|v)(?:\s*\.?)?|esq\.?)$/i, "").trim();
  return t;
}

function stripLeadingHonorifics(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 4; i++) {
    const next = t.replace(LEADING_HONORIFIC, "");
    if (next === t) break;
    t = next.trim();
  }
  return t;
}

/**
 * Greeting name for pick-sheet copy when `firstName` / `lastName` come from the webhook/CSV.
 */
export function pickSheetEmailSalutationFirstName(
  firstName: string,
  lastName: string | null | undefined,
): string {
  const f = (firstName || "").trim();
  const l = (lastName || "").trim();

  if (l) {
    const t = stripLeadingHonorifics(f);
    return (t || f).trim() || "there";
  }

  if (!f) return "there";

  let t = stripLeadingHonorifics(f);
  t = stripTrailingSuffixes(t);
  const firstWord = t.split(/\s+/).filter(Boolean)[0] ?? "";
  if (firstWord) return firstWord;
  return f || "there";
}
