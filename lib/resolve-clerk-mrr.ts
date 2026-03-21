import { computeClerkMrr, type UserRowForClerkMrr } from "@/lib/clerk-mrr";
import { aggregateMrrFromClerkBillingApi } from "@/lib/clerk-billing-api-mrr";

export type ResolvedClerkMrr = {
  clerkMrr: number;
  clerkMrrSubscriberCount: number;
  unpricedPlanSlugs: string[];
  /** Shown in UI subtext */
  sourceLabel: string;
};

function parseOptionalUsd(envVal: string | undefined): number | null {
  if (envVal == null || !String(envVal).trim()) return null;
  const n = Number(String(envVal).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** When Stripe `subscriptions.list` doesn’t match the MRR you expect (wrong/missing line items). */
export function applyStripeMrrOverride(apiMrr: number): { mrr: number; label: string } {
  const o = parseOptionalUsd(process.env.STRIPE_MRR_OVERRIDE_USD);
  if (o != null) return { mrr: o, label: "STRIPE_MRR_OVERRIDE_USD" };
  return { mrr: Math.round(apiMrr * 100) / 100, label: "Stripe API" };
}

/**
 * Priority:
 * 1. CLERK_DASHBOARD_MRR_USD — paste the MRR from Clerk’s dashboard (authoritative UI number).
 * 2. Clerk Billing API — if CLERK_SECRET_KEY is set and CLERK_BILLING_API_MRR is not false, aggregate from Clerk (matches dashboard ~$597).
 * 3. Supabase estimate (plan slug × CLERK_PLAN_MRR_USD).
 */
export async function resolveClerkMrrForDashboard(
  users: UserRowForClerkMrr[]
): Promise<ResolvedClerkMrr> {
  const manual = parseOptionalUsd(process.env.CLERK_DASHBOARD_MRR_USD);
  if (manual != null) {
    const fallback = computeClerkMrr(users);
    return {
      clerkMrr: manual,
      clerkMrrSubscriberCount: fallback.clerkMrrSubscriberCount,
      unpricedPlanSlugs: [],
      sourceLabel: "Clerk dashboard (CLERK_DASHBOARD_MRR_USD)",
    };
  }

  const apiDisabled =
    process.env.CLERK_BILLING_API_MRR === "false" ||
    process.env.CLERK_BILLING_API_MRR === "0";
  const secret = process.env.CLERK_SECRET_KEY?.trim();
  if (!apiDisabled && secret) {
    const api = await aggregateMrrFromClerkBillingApi(secret);
    if (api.ok && (api.mrr > 0 || api.subscribers > 0)) {
      return {
        clerkMrr: api.mrr,
        clerkMrrSubscriberCount: api.subscribers,
        unpricedPlanSlugs: [],
        sourceLabel: "Clerk Billing API",
      };
    }
    if (api.ok && api.mrr === 0 && api.subscribers === 0) {
      console.warn(
        "[resolve-clerk-mrr] Clerk Billing API returned $0 — common causes: CLERK_SECRET_KEY is sk_test_ but subs are on production (use sk_live_…), or API shape mismatch. Using Supabase estimate."
      );
    } else if (!api.ok) {
      console.warn("[resolve-clerk-mrr] Clerk API:", api.error);
    }
  }

  const supabaseEstimate = computeClerkMrr(users);
  return {
    clerkMrr: supabaseEstimate.clerkMrr,
    clerkMrrSubscriberCount: supabaseEstimate.clerkMrrSubscriberCount,
    unpricedPlanSlugs: supabaseEstimate.unpricedPlanSlugs,
    sourceLabel: "Supabase estimate",
  };
}
