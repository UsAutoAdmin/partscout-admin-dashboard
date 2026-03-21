/**
 * Clerk Billing MRR from Supabase user rows (active paid Clerk plan × configured price).
 *
 * We intentionally do **not** skip rows where `stripe_subscription_status === "active"`.
 * Clerk Billing often does not create subscriptions visible to *your* Stripe API key, while
 * legacy/native Stripe checkouts do — so Stripe `subscriptions.list` MRR can be $199 while
 * several Clerk-paid users still have a Stripe column set from webhooks or old flows.
 * Skipping those users zeroed out Clerk MRR. Legacy “Stripe-only” users rarely also have an
 * active paid Clerk plan; if someone does, they could be double-counted — override via env if needed.
 *
 * Optional: CLERK_PLAN_MRR_USD='{"founding_member":199}' merges over defaults.
 * Optional: CLERK_MRR_EXCLUDE_STRIPE_ACTIVE=true — restore old “skip stripe active” behavior.
 */

import { PLAN_SLUGS } from "@/lib/clerk-plan-constants";

export type UserRowForClerkMrr = {
  clerk_subscription_status: string | null;
  clerk_plan_slug: string | null;
  stripe_subscription_status: string | null;
};

const FREE_SLUGS = new Set<string>(
  ["free_user", "free", PLAN_SLUGS.FREE].map((s) => s.toLowerCase())
);

const DEFAULT_PLAN_MRR_USD: Record<string, number> = {
  [PLAN_SLUGS.PRO.toLowerCase()]: 199,
};

export function getClerkPlanMrrMap(): Record<string, number> {
  const merged = { ...DEFAULT_PLAN_MRR_USD };
  const raw = process.env.CLERK_PLAN_MRR_USD?.trim();
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [slug, val] of Object.entries(parsed)) {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n) && n >= 0) merged[slug.trim().toLowerCase()] = n;
    }
  } catch {
    console.warn("[clerk-mrr] CLERK_PLAN_MRR_USD is not valid JSON; using defaults only");
  }
  return merged;
}

function monthlyForSlug(slug: string, map: Record<string, number>): number | null {
  const key = slug.trim().toLowerCase();
  if (map[key] != null && map[key] > 0) return map[key];
  return null;
}

export type ClerkMrrResult = {
  clerkMrr: number;
  clerkMrrSubscriberCount: number;
  unpricedPlanSlugs: string[];
};

function isClerkSubscriptionActive(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "active";
}

export function computeClerkMrr(users: UserRowForClerkMrr[]): ClerkMrrResult {
  const map = getClerkPlanMrrMap();
  let clerkMrr = 0;
  let clerkMrrSubscriberCount = 0;
  const missingSlugs = new Set<string>();
  const excludeStripeActive =
    process.env.CLERK_MRR_EXCLUDE_STRIPE_ACTIVE === "true" ||
    process.env.CLERK_MRR_EXCLUDE_STRIPE_ACTIVE === "1";

  for (const u of users) {
    if (excludeStripeActive && (u.stripe_subscription_status ?? "").toLowerCase() === "active") {
      continue;
    }
    if (!isClerkSubscriptionActive(u.clerk_subscription_status)) continue;
    const slug = u.clerk_plan_slug?.trim();
    if (!slug || FREE_SLUGS.has(slug.toLowerCase())) continue;

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
