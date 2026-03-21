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

function isTrue(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

function keyMode(secret: string | undefined): "live" | "test" | "unknown" | "none" {
  if (!secret) return "none";
  const s = secret.trim();
  if (s.startsWith("sk_live_")) return "live";
  if (s.startsWith("sk_test_")) return "test";
  if (s.length > 10) return "unknown";
  return "none";
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
 * 2. Clerk Billing API LIVE key (CLERK_LIVE_SECRET_KEY, else CLERK_SECRET_KEY if sk_live_).
 * 3. Optional estimate fallback (only when CLERK_MRR_ALLOW_ESTIMATE=true).
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
  const allowEstimateFallback = isTrue(process.env.CLERK_MRR_ALLOW_ESTIMATE);
  const allowTestKey = isTrue(process.env.CLERK_MRR_ALLOW_TEST_KEY);
  const liveKey = process.env.CLERK_LIVE_SECRET_KEY?.trim();
  const generalKey = process.env.CLERK_SECRET_KEY?.trim();
  const secret = liveKey || generalKey;

  const mode = keyMode(secret);
  console.log(
    `[resolve-clerk-mrr] key source=${liveKey ? "CLERK_LIVE_SECRET_KEY" : "CLERK_SECRET_KEY"}, mode=${mode}, prefix=${secret?.slice(0, 8) ?? "(none)"}…`
  );

  if (!apiDisabled && secret && (mode === "live" || mode === "unknown" || allowTestKey)) {
    const api = await aggregateMrrFromClerkBillingApi(secret);
    if (api.ok && (api.mrr > 0 || api.subscribers > 0)) {
      return {
        clerkMrr: api.mrr,
        clerkMrrSubscriberCount: api.subscribers,
        unpricedPlanSlugs: [],
        sourceLabel:
          mode === "live"
            ? "Clerk Billing API (live)"
            : mode === "test"
              ? "Clerk Billing API (test)"
              : "Clerk Billing API",
      };
    }
    if (api.ok && api.mrr === 0 && api.subscribers === 0) {
      console.warn(
        "[resolve-clerk-mrr] Clerk Billing API returned $0. Ensure the key is sk_live_ for production billing data. Falling back per config."
      );
    } else if (!api.ok) {
      console.warn("[resolve-clerk-mrr] Clerk API:", api.error);
    }
  } else if (!apiDisabled && mode === "test" && !allowTestKey) {
    console.warn(
      "[resolve-clerk-mrr] Ignoring sk_test_ Clerk key for MRR. Set CLERK_LIVE_SECRET_KEY (or CLERK_SECRET_KEY=sk_live_...)."
    );
  }

  if (allowEstimateFallback) {
    const supabaseEstimate = computeClerkMrr(users);
    return {
      clerkMrr: supabaseEstimate.clerkMrr,
      clerkMrrSubscriberCount: supabaseEstimate.clerkMrrSubscriberCount,
      unpricedPlanSlugs: supabaseEstimate.unpricedPlanSlugs,
      sourceLabel: "Supabase estimate",
    };
  }

  return {
    clerkMrr: 0,
    clerkMrrSubscriberCount: 0,
    unpricedPlanSlugs: [],
    sourceLabel: "Clerk live key required (set CLERK_LIVE_SECRET_KEY)",
  };
}
