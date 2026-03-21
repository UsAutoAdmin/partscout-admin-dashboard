/**
 * Clerk Billing MRR from Supabase user rows. Excludes users with active Stripe subs
 * so they are not double-counted with Stripe API MRR.
 *
 * Optional: CLERK_PLAN_MRR_USD='{"founding_member":199}' merges over defaults.
 */

import { PLAN_SLUGS } from "@/lib/clerk-plan-constants";

export type UserRowForClerkMrr = {
  clerk_subscription_status: string | null;
  clerk_plan_slug: string | null;
  stripe_subscription_status: string | null;
};

const FREE_SLUGS = new Set<string>(["free_user", "free", PLAN_SLUGS.FREE]);

const DEFAULT_PLAN_MRR_USD: Record<string, number> = {
  [PLAN_SLUGS.PRO]: 199,
};

export function getClerkPlanMrrMap(): Record<string, number> {
  const merged = { ...DEFAULT_PLAN_MRR_USD };
  const raw = process.env.CLERK_PLAN_MRR_USD?.trim();
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [slug, val] of Object.entries(parsed)) {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n) && n >= 0) merged[slug] = n;
    }
  } catch {
    console.warn("[clerk-mrr] CLERK_PLAN_MRR_USD is not valid JSON; using defaults only");
  }
  return merged;
}

function monthlyForSlug(slug: string, map: Record<string, number>): number | null {
  if (map[slug] != null && map[slug] > 0) return map[slug];
  return null;
}

export type ClerkMrrResult = {
  clerkMrr: number;
  clerkMrrSubscriberCount: number;
  unpricedPlanSlugs: string[];
};

export function computeClerkMrr(users: UserRowForClerkMrr[]): ClerkMrrResult {
  const map = getClerkPlanMrrMap();
  let clerkMrr = 0;
  let clerkMrrSubscriberCount = 0;
  const missingSlugs = new Set<string>();

  for (const u of users) {
    if (u.stripe_subscription_status === "active") continue;
    if (u.clerk_subscription_status !== "active") continue;
    const slug = u.clerk_plan_slug;
    if (!slug || FREE_SLUGS.has(slug)) continue;

    const monthly = monthlyForSlug(slug, map);
    if (monthly == null) {
      missingSlugs.add(slug);
      continue;
    }
    clerkMrr += monthly;
    clerkMrrSubscriberCount += 1;
  }

  return {
    clerkMrr: Math.round(clerkMrr * 100) / 100,
    clerkMrrSubscriberCount,
    unpricedPlanSlugs: Array.from(missingSlugs).sort(),
  };
}
