This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Part Scout admin dashboard

Business metrics from **Supabase**, **Stripe**, and **Clerk Billing**.

**MRR (total)** = **MRR (Stripe)** + **MRR (Clerk)**.

- **Clerk MRR** (priority order):
  1. **`CLERK_DASHBOARD_MRR_USD`** — paste the exact MRR from the Clerk dashboard (e.g. `597`).
  2. **Clerk Billing API** — if **`CLERK_SECRET_KEY`** is set and **`CLERK_BILLING_API_MRR`** is not `false`, we call `GET /v1/users` + per-user `GET /v1/users/{id}/billing/subscription` to sum active plan fees (should align with Clerk’s ~$597).
  3. **Supabase fallback** — count active paid Clerk plans × **`CLERK_PLAN_MRR_USD`** / defaults.

- **Stripe MRR** — from Stripe `subscriptions.list`, unless **`STRIPE_MRR_OVERRIDE_USD`** is set (only if the API total doesn’t match what you know you bill—e.g. wrong price or missing sub). Example: **$597** (Clerk) **+ $199** (Stripe) **≈ $796** total.

### `.env.local` (common)

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=

# Clerk (from Clerk Dashboard → API Keys) — enables Billing API MRR by default.
# Use the same instance as your paying users: sk_live_… for production subs; sk_test_… only sees test users (often $0 MRR).
CLERK_SECRET_KEY=

# Optional: disable Clerk API aggregation (use Supabase estimate only)
# CLERK_BILLING_API_MRR=false

# Optional: lock Clerk MRR to the number shown in Clerk’s UI
# CLERK_DASHBOARD_MRR_USD=597

# Optional: force Stripe MRR if subscriptions.list doesn’t match reality
# STRIPE_MRR_OVERRIDE_USD=199

# Optional: JSON map of plan slug -> monthly USD (Supabase path only)
# CLERK_PLAN_MRR_USD={"founding_member":199}

# Rare: Supabase-only Clerk MRR skips stripe_subscription_status=active users
# CLERK_MRR_EXCLUDE_STRIPE_ACTIVE=true
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

Set the same env vars in the Vercel project (including `CLERK_SECRET_KEY` if you want API-based Clerk MRR).
