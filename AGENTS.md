# AGENTS.md

## Cursor Cloud specific instructions

### Overview

PartScout Admin Dashboard — a Next.js 14 (App Router) internal dashboard for auto parts profitability analysis. Single Next.js app (no monorepo, no Docker, no local database). All data lives in hosted Supabase; no local DB setup needed.

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Production start | `npm run start` |

### Environment variables

A `.env.local` file is required at the project root. At minimum:

```
NEXT_PUBLIC_SUPABASE_URL=https://wykhqhclzyygkslpbgmh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<real key needed for data>
```

Without a real `SUPABASE_SERVICE_ROLE_KEY`, the app still starts and renders all pages, but API calls return empty/error states. Additional optional keys: `STRIPE_SECRET_KEY`, `CLERK_SECRET_KEY`, `CLERK_LIVE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `INSTAGRAM_APP_ID/SECRET`. See `README.md` for full list.

### Gotchas

- The build and dev server work without valid Supabase credentials — pages render with empty data. No hard crash on missing secrets.
- There are no automated tests (unit/integration) in this repo. Validation is lint + build + manual page verification.
- The `local-gateway/server.mjs` fleet gateway (port 3850) requires Tailscale connectivity to Mac mini scrapers; it is not needed for dashboard development.
- `playwright` is a dependency used by the video-research price-matching feature (server-side scraping), not for testing. Do not attempt to run `npx playwright test`.
- ESLint is configured with `next/core-web-vitals` + `next/typescript`. The `@typescript-eslint/no-explicit-any` rule is turned off. Existing warnings (img elements, hook deps) are pre-existing and accepted.
