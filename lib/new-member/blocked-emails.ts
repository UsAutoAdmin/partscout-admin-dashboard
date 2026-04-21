/**
 * Hard stops for new-member automation (Zap, queue, webhook). Merged with
 * NEW_MEMBER_BLOCK_EMAILS (comma- or space-separated) in Vercel env.
 */
const DEFAULT_LOWERCASE: readonly string[] = ["kellyroehlk@gmail.com"];

const defaultSet = new Set(DEFAULT_LOWERCASE);

export function isNewMemberEmailBlocked(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  if (!e) return false;
  if (defaultSet.has(e)) return true;
  const raw = process.env.NEW_MEMBER_BLOCK_EMAILS?.trim();
  if (!raw) return false;
  for (const part of raw.split(/[,;]+/)) {
    if (part.trim().toLowerCase() === e) return true;
  }
  return false;
}
