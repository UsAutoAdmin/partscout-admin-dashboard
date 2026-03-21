This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Part Scout admin dashboard

Business metrics from **Supabase**, **Stripe**, and **Clerk Billing**.

**MRR (total)** = **MRR (Stripe)** + **MRR (Clerk)**.

- **Clerk MRR** (priority order):
  1. **`CLERK_DASHBOARD_MRR_USD`** — paste the exact MRR from the Clerk dashboard (e.g. `597`).
  2. **Clerk Billing API (live key)** — uses **`CLERK_LIVE_SECRET_KEY`** first, then **`CLERK_SECRET_KEY`** if it is `sk_live_...`; calls `GET /v1/users` + per-user `GET /v1/users/{id}/billing/subscription`.
  3. **Optional Supabase fallback** — only if **`CLERK_MRR_ALLOW_ESTIMATE=true`**.

- **Stripe MRR** — from Stripe `subscriptions.list`, unless **`STRIPE_MRR_OVERRIDE_USD`** is set (only if the API total doesn’t match what you know you bill—e.g. wrong price or missing sub). Example: **$597** (Clerk) **+ $199** (Stripe) **≈ $796** total.

### `.env.local` (common)

```bash
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=

# Clerk live key for production Billing API MRR (recommended)
CLERK_LIVE_SECRET_KEY=

# General Clerk key (used only if sk_live_... and CLERK_LIVE_SECRET_KEY not set)
CLERK_SECRET_KEY=

# Optional: disable Clerk API aggregation (use Supabase estimate only)
# CLERK_BILLING_API_MRR=false

# Optional: allow Supabase estimate fallback when live Clerk API is unavailable
# CLERK_MRR_ALLOW_ESTIMATE=true

# Optional: allow sk_test_ key for Clerk MRR (not recommended for production totals)
# CLERK_MRR_ALLOW_TEST_KEY=true

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
