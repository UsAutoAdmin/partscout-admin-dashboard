/**
 * Aggregates MRR from Clerk's Backend API (same source as the Clerk dashboard Billing MRR).
 * GET /v1/users (paginated) then GET /v1/users/{id}/billing/subscription per user.
 *
 * Enable with CLERK_BILLING_API_MRR=true and CLERK_SECRET_KEY in .env.local.
 */

const CLERK_API_V1 = "https://api.clerk.com/v1";

type Money = { amount?: number } | null | undefined;

/**
 * Clerk/Stripe-style money: often `amount` is in cents (19900), but some payloads use whole USD (199).
 */
function moneyToUsd(m: Money): number {
  if (!m || typeof m.amount !== "number" || !Number.isFinite(m.amount)) return 0;
  const a = m.amount;
  const asCents = a / 100;
  // Whole-dollar payloads (e.g. 199) would wrongly become $1.99 if we only divide by 100.
  if (asCents > 0 && asCents < 5 && a >= 10) return a;
  return asCents;
}

function get(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

/** Monthly USD from one subscription item + plan (handles snake_case + camelCase JSON). */
function monthlyUsdForItem(item: Record<string, unknown>): number {
  const plan = get(item, "plan") as Record<string, unknown> | undefined;
  if (!plan || typeof plan !== "object") return 0;

  const periodRaw = String(
    get(item, "plan_period", "planPeriod") ?? ""
  ).toLowerCase();
  const isAnnual =
    periodRaw === "annual" || periodRaw === "year" || periodRaw === "yearly";

  const fee = get(plan, "fee") as Money;
  const annualFee = get(plan, "annual_fee", "annualFee") as Money;
  const annualMonthly = get(plan, "annual_monthly_fee", "annualMonthlyFee") as Money;

  if (isAnnual) {
    const am = moneyToUsd(annualMonthly);
    if (am > 0) return am;
    const af = moneyToUsd(annualFee);
    if (af > 0) return af / 12;
  }
  return moneyToUsd(fee);
}

function subscriptionItems(sub: Record<string, unknown>): Record<string, unknown>[] {
  const raw = get(sub, "subscription_items", "subscriptionItems");
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Record<string, unknown> => x && typeof x === "object");
}

export type ClerkBillingApiMrrResult =
  | { ok: true; mrr: number; subscribers: number }
  | { ok: false; error: string };

/**
 * Sum active Clerk Billing subscription amounts across all users (matches Clerk dashboard MRR when API fields align).
 */
export async function aggregateMrrFromClerkBillingApi(
  secretKey: string
): Promise<ClerkBillingApiMrrResult> {
  let totalMrr = 0;
  let subscribers = 0;
  let offset = 0;
  const limit = 100;

  try {
    while (true) {
      const listRes = await fetch(
        `${CLERK_API_V1}/users?limit=${limit}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          cache: "no-store",
        }
      );
      if (!listRes.ok) {
        const text = await listRes.text();
        return {
          ok: false,
          error: `Clerk users list ${listRes.status}: ${text.slice(0, 200)}`,
        };
      }
      const listJson = (await listRes.json()) as { data?: { id: string }[] };
      const batch = listJson.data ?? [];
      if (batch.length === 0) break;

      for (const u of batch) {
        const uid = u.id;
        if (!uid) continue;

        const subRes = await fetch(
          `${CLERK_API_V1}/users/${encodeURIComponent(uid)}/billing/subscription`,
          {
            headers: { Authorization: `Bearer ${secretKey}` },
            cache: "no-store",
          }
        );
        if (subRes.status === 404) continue;
        if (!subRes.ok) continue;

        const sub = (await subRes.json()) as Record<string, unknown>;
        const subStatus = String(get(sub, "status") ?? "").toLowerCase();
        if (
          subStatus === "abandoned" ||
          subStatus === "canceled" ||
          subStatus === "ended"
        ) {
          continue;
        }

        let userMonthly = 0;
        const items = subscriptionItems(sub);
        for (const item of items) {
          const st = String(get(item, "status") ?? "").toLowerCase();
          if (st && st !== "active") continue;
          const trial = get(item, "is_free_trial", "isFreeTrial");
          if (trial === true) continue;
          userMonthly += monthlyUsdForItem(item);
        }

        // Some responses expose next_payment on subscription or item only
        if (userMonthly <= 0) {
          const np = get(sub, "next_payment", "nextPayment") as Record<string, unknown> | undefined;
          const npAmt = np && (get(np, "amount") as Money | undefined);
          userMonthly += moneyToUsd(npAmt as Money);
        }

        if (userMonthly > 0) {
          totalMrr += userMonthly;
          subscribers += 1;
        }
      }

      offset += batch.length;
      if (batch.length < limit) break;
    }

    return {
      ok: true,
      mrr: Math.round(totalMrr * 100) / 100,
      subscribers,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
