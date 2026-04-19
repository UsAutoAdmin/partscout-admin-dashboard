# Automated Pick Sheet Generator + Email Sender

> **Source repo:** [`UsAutoAdmin/Part-Scout-Production`](https://github.com/UsAutoAdmin/Part-Scout-Production)
> All code paths in this document are relative to that repo unless noted.
>
> This document describes two adjacent systems:
> 1. **Pick Sheet Generator** — paste a junkyard inventory URL, extract vehicles, match against the parts catalog, save/share a pick sheet.
> 2. **Email Automation ("automated sales motion")** — upload a CSV of members, find each member's nearest verified yard, generate a personalised pick sheet for each, and send a templated email with the share link.
>
> The email automation reuses the pick sheet generator's extraction + matching pipeline behind the scenes, so the systems share a backend and Supabase tables.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Pick Sheet Generator](#2-pick-sheet-generator)
   - [User flow](#21-user-flow)
   - [Next.js API routes](#22-nextjs-api-routes)
   - [Railway extractor service](#23-railway-extractor-service-libpick-sheet-extractor)
   - [Multi-location chain registry](#24-multi-location-chain-registry)
   - [Outputs (CSV / Print / Save / Share)](#25-outputs)
3. [Email Automation](#3-email-automation)
   - [Five-step UI flow](#31-five-step-ui-flow)
   - [API routes](#32-api-routes)
   - [How "find closest yard" is computed](#33-how-find-closest-yard-is-computed)
   - [Email generation and delivery](#34-email-generation-and-delivery)
   - [CRM tracking](#35-crm-tracking)
4. [Supabase tables](#4-supabase-tables)
5. [Environment variables](#5-environment-variables)
6. [Operational notes](#6-operational-notes)
7. [File reference](#7-file-reference)

---

## 1. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Next.js 14 (App Router)                              │
│                                                                               │
│  /generate-pick-sheet            /admin/email-automation                     │
│  (single-yard tool)              (5-step bulk outreach flow)                 │
│        │                                  │                                  │
│        │ POST /api/pick-sheet/extract     │ POST /api/admin/email-           │
│        │ POST /api/pick-sheet/match       │      automation/find-yards       │
│        │ POST /api/pick-sheet/save        │ POST /api/admin/email-           │
│        │ POST /api/admin/pick-sheet/share │      automation/process-member   │
│        ▼                                  │ POST /api/admin/email-           │
│  lib/railway-client.ts ──┐               │      automation/send-email       │
│                           │               │                                  │
│                           ▼               ▼                                  │
└─────────────────────  ┌──────────────────────────┐  ─────────────────────────┘
                        │   Railway: Python svc     │
                        │   lib/pick-sheet-         │
                        │   extractor (FastAPI)     │
                        │                           │
                        │   POST /v2/extract        │
                        │   GET  /health            │
                        └──────────────────────────┘
                                    │
                                    ▼
                  Junkyard websites (chain-specific extractors)
```

**Key shared building blocks:**

| Concern | Module |
|---|---|
| Railway HTTP client | `lib/railway-client.ts` |
| Vehicle ↔ part matching | `lib/pick-sheet-matching.ts` |
| Multi-location chain registry (TS) | `lib/multi-location-chains.ts` |
| Location picker modal | `components/chain-location-picker.tsx` |
| Gmail send | `lib/gmail.ts` |
| CRM open/click tracking | `lib/crm/prepare-tracked-send.ts` |
| Supabase service-role client | `lib/supabase/server.ts` |

---

## 2. Pick Sheet Generator

**UI:** `app/generate-pick-sheet/page.tsx`

### 2.1 User flow

1. **Paste an inventory URL** (and optional filters: minimum sell-through %, minimum price, minimum arrival date).
2. **Multi-location chains** — on **Extract**, if `needsLocationPicker(url)` returns a chain, a modal opens (see [§2.4](#24-multi-location-chain-registry)). User picks a yard → final URL is built via `chain.buildUrl(slug)` → extraction proceeds.
3. **Extract** — client calls `POST /api/pick-sheet/extract`, which proxies to the Railway `POST /v2/extract` endpoint. Progress UI is client-side simulated.
4. **Auto-match** — on success, the page automatically calls `POST /api/pick-sheet/match` with the vehicles + min-filters.
5. **Results** — sortable on-screen tables for vehicles and matched parts. Admin can edit/remove parts, add a vehicle manually, upload a CSV of vehicles, etc.
6. **Persist / share** — **Save** → `POST /api/pick-sheet/save`; admin **Share** → `POST /api/admin/pick-sheet/share` (mints a `share_token`, returns `/pick-sheet/shared/{token}`).
7. **Optional** — open the **Monitor yard** dialog (`/api/monitored-yards`) to schedule recurring extractions.

### 2.2 Next.js API routes

| Route | File | Purpose |
|---|---|---|
| `POST /api/pick-sheet/extract` | `app/api/pick-sheet/extract/route.ts` | Calls `railwayExtract(url, force_refresh=true)`. Returns the raw Railway `ExtractResponse` (`vehicles`, `strategy`, `metadata`, …). |
| `POST /api/pick-sheet/match` | `app/api/pick-sheet/match/route.ts` | Runs `matchVehiclesToParts` against the admin parts catalog. |
| `POST /api/pick-sheet/save` | `app/api/pick-sheet/save/route.ts` | Inserts a row into `saved_pick_sheets`. |
| `POST /api/admin/pick-sheet/share` | `app/api/admin/pick-sheet/share/route.ts` | Admin-only; sets `share_token` on a saved sheet. |
| `GET  /api/pick-sheet/shared/[token]` | `app/api/pick-sheet/shared/[token]/route.ts` | Public read-only fetch by token. |
| `POST /api/pick-sheet/claim/[token]` | `app/api/pick-sheet/claim/[token]/route.ts` | Lets a user claim a shared sheet into their account. |

### 2.3 Railway extractor service (`lib/pick-sheet-extractor`)

A Python FastAPI service deployed to Railway from the branch
`cursor/reliable-vehicle-inventory-extraction-system-e9bb` (root directory
`lib/pick-sheet-extractor`, builder Dockerfile).

| File / Folder | Role |
|---|---|
| `api.py` | FastAPI app. Endpoints: `POST /extract` (legacy single-extractor), `POST /v2/extract` (uses `GuaranteedExtractor` + cache + `force_refresh`), `GET /health`, plus cache/chain helpers. |
| `chain_registry.py` | URL → `ChainProfile` lookup. Auto-discovers profiles from extractor modules and merges with `_STUB_PROFILES` (chains we recognise but don't extract yet — LKQ, Crazy Ray's, Row52, Barry's U Pull It, Ace Pick A Part, Budget U Pull, U-Pull-It). |
| `chain_extractors/` | One module per implemented chain. Each declares a `PROFILE = ChainProfile(...)` next to its extraction logic. The package's `__init__.py` discovers modules via `pkgutil.iter_modules` so adding a chain is a single-file change. |
| `guaranteed_extractor.py` | The v2 fallback ladder: hardcoded chain extractor → JSON API → table HTML → Vision LLM. |
| `site_profile.py` | Maps a chain profile to an execution profile (HTTP vs Playwright vs OCR). |

**Currently implemented chain extractors** (`chain_extractors/<slug>.py`):

`pick_n_pull`, `wrench_a_part`, `pull_a_part`, `uapi`, `pick_your_part`,
`chesterfield_auto`, `fenix_u_pull`, `u_pull_it_nebraska`, `harrys_u_pull_it`,
`u_pull_r_parts`, `ipull`, `ipull_u_pull`, `bevells_piy`, `foss_u_pull_it`,
`kenny_u_pull`, `colorado_auto`, plus a few un-profiled extractors
(`us_auto_supply`, `ryans_pick_a_part`, `dis_n_dat`, `budget_u_pull_it`).

**Client (`lib/railway-client.ts`):**

```ts
railwayExtract(url, forceRefresh?)
  // Reads PICK_SHEET_SERVICE_URL (default http://localhost:8000)
  // POST {origin}/v2/extract  body: { url, force_refresh }
  // Returns: { ok, status, raw }
```

> **Note:** `app/api/pick-sheet/extract/route.ts` always passes
> `force_refresh: true` and ignores any `dryRun` field in the request body.
> Operators expecting cached runs should call the Railway endpoint directly.

### 2.4 Multi-location chain registry

**File:** `lib/multi-location-chains.ts`

Single source of truth for chains that have multiple yards behind one URL.
Each entry implements:

```ts
interface MultiLocationChain {
  id: string;             // matches the Python CHAIN_TYPE
  displayName: string;
  hostMatchers: RegExp[];
  locations: { slug: string; label: string }[];
  detectExistingLocation: (url: string) => string | null;
  buildUrl: (baseUrl: string, locationSlug: string) => string;
  modalDescription: string;
}
```

**Registered chains today:**

| `id` | `displayName` | Hosts | Locations |
|---|---|---|---|
| `foss_u_pull_it` | Foss U-Pull-It | `fossupullit.com` | La Grange, Jacksonville, Chesapeake, Havelock, Wilson, Winston-Salem (NC/VA) |
| `ipull_u_pull` | iPull-uPull | `ipullupull.com`, `ipullupullcanada.ca` | Fresno, Pomona, Sacramento, Stockton (CA) |
| `kenny_u_pull` | Kenny U-Pull | `kennyupull.com` | 27 Canadian branches (numeric branch IDs as slugs) |

**Helpers:**

- `detectMultiLocationChain(url)` — returns the chain whose host matches.
- `needsLocationPicker(url)` — returns the chain only if no location is already encoded in the URL (e.g. no `?location=` or `?branch[]=`). The picker modal opens if and only if this is non-null.

**Picker component:** `components/chain-location-picker.tsx` — generic modal that supports Escape / overlay-click dismissal, used by both the pick-sheet page and any future surface that needs location selection.

### 2.5 Outputs

- **API JSON** — raw Railway `ExtractResponse` returned via `NextResponse.json(result.raw)`.
- **CSV download** — client-side: `pick-sheet-YYYY-MM-DD.csv` (vehicles) and `matched-parts-YYYY-MM-DD.csv` (matched parts).
- **Print** — `window.print()`.
- **Save** — row in `saved_pick_sheets`.
- **Share** — public URL `/pick-sheet/shared/{token}`.

---

## 3. Email Automation

**UI:** `app/admin/email-automation/page.tsx`
**API base:** `/api/admin/email-automation/*`

### 3.1 Five-step UI flow

| Step | Label | What the user does | State produced |
|---|---|---|---|
| **1** | Upload CSV | Drag/drop or browse a `.csv`. Column aliases supported (e.g. zip: `zipcode`, `zip`, `postal`). | `Member[]` — `{ id, firstName, lastName, email, zipCode, selected: true }`. Auto-advances on success. |
| **2** | Assign Yards | Click **Find Closest Yard** for each row (or all). Toggle row selection. **Generate Pick Sheets →** advances. | `yard`, `distance`, `geoCity`, `yardError`, `yardTooFar` (true if distance > **30 miles**). |
| **3** | Generate | **Start Generation** runs `process-member` sequentially per selected member. | `processStatus` (`idle` → `extracting` → `done` / `skipped` / `error`), `vehicles`, `matchedParts`, `pickSheetId`, `shareToken`, `shareUrl` (`/pick-sheet/shared/{token}`). Skips any row flagged `yardTooFar`. Re-running preserves rows already `done`. |
| **4** | Preview & Edit | Open per-row modal to remove parts; **Open** the share link in a new tab. | `editedParts` overrides `matchedParts` for the eventual send. |
| **5** | Send Emails | Choose provider (Gmail / Resend / SMTP); customise sender name + body copy; toggle CRM tracking; either **Send all now** or **Automatic send** (random 0–5 min gap between sends). Optional minimum-parts filter. | `emailStatus`, `emailError` per row. |

**Key constants:**

- `YARD_TOO_FAR_MILES = 30` (`find-yards/route.ts`)
- Default body copy + sender name (`page.tsx`)
- `NEXT_PUBLIC_APP_URL` used to build absolute "Open" links

### 3.2 API routes

#### `POST /api/admin/email-automation/find-yards`

```ts
// Request
{ members: { id: string; zipCode: string }[] }

// Response
{
  results: Record<string, {
    yard: { id, name, city, state, url, chainType } | null;
    distance: number | null;   // miles
    geoCity: string | null;
    error: string | null;
    tooFarForDrive: boolean;   // distance > 30
  }>
}
```

Errors: `400` (missing/empty `members`), `500`.

#### `POST /api/admin/email-automation/process-member`

```ts
// Request
{
  yardUrl: string;
  yardName: string;       // chain + city, used for display
  yardCity?: string;      // junkyard city for the saved sheet
  memberName: string;
  memberId: string;       // echoed back
}

// Response
{
  success: true;
  memberId: string;
  vehicles: any[];
  matchedParts: MatchedPart[];
  pickSheetId: string;
  shareToken: string;
  shareUrl: string;       // path: /pick-sheet/shared/{uuid}
}
```

Errors: `400` (no `yardUrl`), `422` (no vehicles or no matches), `500` (no admin user with parts), `502` (Railway extract failed), `500` (other).

Internally:
1. Calls `railwayExtract(yardUrl, true)`.
2. Resolves the admin `user_id` from the first row of `6_user_database_parts`.
3. Calls `matchVehiclesToParts(vehicles, userId)`.
4. Inserts a row into `saved_pick_sheets`, then updates with a freshly generated `share_token`.

#### `POST /api/admin/email-automation/send-email`

```ts
// Request (core fields)
{
  to: string;
  firstName: string;
  lastName?: string;
  shareUrl: string;          // path or absolute; normalized to path for CRM
  yardName: string;
  yardCity: string;
  yardState: string;
  partCount: number;
  totalValue: number;        // dollars (not cents) — for display only
  vehicleCount: number;
  senderName: string;
  customMessage?: string;

  deliveryMethod?: "gmail" | "resend" | "smtp";

  // SMTP overrides (fall back to env)
  smtpHost?: string; smtpPort?: number; smtpUser?: string;
  smtpPass?: string; smtpFrom?: string;

  crmTracking?: boolean;     // default true
  phone?: string; zip?: string;
}

// Response (one of)
{ success: true; method: "gmail";  messageId: string; crmTracked: boolean; crmMessageId?: string }
{ success: true; method: "resend"; crmTracked: boolean; crmMessageId?: string }
{ success: true; method: "smtp";   crmTracked: boolean; crmMessageId?: string }
```

Errors: `400`, `500`, `502`. On Gmail/Resend/SMTP failure *after* the CRM row was prepared, the route deletes the orphan `crm_messages` row (rollback).

### 3.3 How "find closest yard" is computed

1. **Zip → coordinates** — local `zipcodes` npm package handles US 5-digit ZIPs and Canadian FSAs. Falls back to remote APIs when needed:
   - `https://api.zippopotam.us/us/{zip}`
   - `https://nominatim.openstreetmap.org/...` (≥ 1 req/sec, custom User-Agent)
2. **Yards** — every row in `junkyard_directory` where `verification_verified = true` and `latitude` / `longitude` are not null.
3. **Distance** — Haversine miles between the member point and each yard. **Closest yard wins.**
4. **Flag `tooFarForDrive`** when distance > **30 miles** — these members are skipped during generation.

> "Find yards" is **pure geography** — it does NOT consider part availability, inventory size, or whether the chain has an extractor implemented.

### 3.4 Email generation and delivery

- **Templated, not AI-generated.** HTML and plain-text bodies are built in `send-email/route.ts` by `buildEmailHtml` / `buildPlainText`:
  - Greeting with `firstName`
  - Dynamic part count + `totalValue` formatted as USD via `formatDollars`
  - Optional `customMessage` paragraphs
  - Share link line
  - Sender signature
- **Subject:** `Your Custom Pick Sheet for ${yardName}`
- **Provider routing:**
  - `gmail` → `sendGmailHtmlEmail` (`lib/gmail.ts` — OAuth refresh token flow)
  - `resend` → `Resend` SDK
  - `smtp` → Nodemailer (uses request body overrides, else env defaults)

### 3.5 CRM tracking

When `crmTracking !== false` (default true):

1. `prepareCrmTrackedSend` (`lib/crm/prepare-tracked-send.ts`) inserts a `crm_messages` row, rewrites every external `<a href>` to `/api/crm/track/click/{id}` and injects an open-tracking pixel.
2. The provider sends the modified HTML.
3. Click + open events are recorded against `crm_messages` and `crm_message_links` and surfaced in the CRM UI.

If the provider call fails after step 1, the `crm_messages` row is deleted to keep the CRM clean.

---

## 4. Supabase tables

| Table | Used by | Operations |
|---|---|---|
| `junkyard_directory` | `find-yards` | Read (verified yards w/ lat-lon) |
| `6_user_database_parts` | `process-member`, `matchVehiclesToParts` | Read (admin parts catalog) |
| `saved_pick_sheets` | `process-member`, `/api/pick-sheet/save`, `/api/admin/pick-sheet/share` | Insert + update (`share_token`) |
| `crm_contacts` | `send-email` (when CRM tracking on) | Read / write |
| `crm_messages` | `send-email` (when CRM tracking on) | Insert + delete-on-failure |
| `crm_message_links` | `send-email` (when CRM tracking on) | Insert |
| `monitored_yards` | Pick-sheet "Monitor yard" dialog | CRUD |

Fitment expansion inside `lib/pick-sheet-matching.ts` reads:
- `1 year_make_model_category_variation`
- `2 Fitment Subcategory`
- `4 fitment_vehicles`

---

## 5. Environment variables

### Required for production

| Variable | Used by | Notes |
|---|---|---|
| `PICK_SHEET_SERVICE_URL` | `lib/railway-client.ts` | Railway origin (no trailing slash). Default `http://localhost:8000`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/server.ts` | Standard Supabase service-role setup. |

### Email provider — pick at least one

| Variable | Provider |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_EMAIL_ADDRESS` | Gmail (recommended for high-deliverability personal sends) |
| `RESEND_API_KEY`, `SMTP_FROM` | Resend |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Generic SMTP fallback |

### Optional

| Variable | Effect |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Base URL used to build absolute "Open" links in the UI. |
| `SHARE_BASE_URL` | Preferred base for share links in outbound emails (else `NEXT_PUBLIC_APP_URL`, else `https://partscout.app`). |
| `EMAIL_SENDER_NAME` | Fallback display name when the UI's sender field is blank. |

---

## 6. Operational notes

### Deploying extractor changes to Railway

The Python service deploys from a specific branch:

- **Branch:** `cursor/reliable-vehicle-inventory-extraction-system-e9bb`
- **Root directory:** `lib/pick-sheet-extractor`
- **Builder:** Dockerfile

After making changes on `main`, push them to the deploy branch:

```bash
git push origin main:cursor/reliable-vehicle-inventory-extraction-system-e9bb
```

Pushing only to `main` will NOT trigger a Railway rebuild.

### Adding a new chain extractor (single-file change)

Since the recent `chain_extractors` refactor, a new extractor only requires
creating one Python file:

```python
# lib/pick-sheet-extractor/chain_extractors/my_chain.py
from chain_extractors import (
    BaseChainExtractor, ChainProfile, ExtractionResult, register_extractor,
)

@register_extractor
class MyChainExtractor(BaseChainExtractor):
    CHAIN_TYPE = "my_chain"
    CHAIN_NAME = "My Chain"
    DOMAIN_PATTERNS = [r"mychain\.com"]
    PROFILE = ChainProfile(
        chain_type="my_chain",
        display_name="My Chain",
        domain_patterns=DOMAIN_PATTERNS,
        preferred_method="table_html",
        playwright_mode="playwright_never",
    )

    def can_handle(self, url): ...
    def extract(self, url) -> ExtractionResult: ...
```

`chain_extractors/__init__.py` auto-discovers it via `pkgutil.iter_modules`,
and `chain_registry.py` picks up the `PROFILE`. No edits to any registry file
are required.

### Adding a multi-location chain to the picker

If the chain has multiple physical yards behind a single URL, also add an
entry to `lib/multi-location-chains.ts`. The pick-sheet page and the email
automation will both pick it up automatically — the picker modal will trigger
when `needsLocationPicker(url)` returns the chain.

### Known caveats

- `app/api/pick-sheet/extract/route.ts` always sends `force_refresh: true` to
  Railway. The `dryRun` field in the request body is parsed but ignored.
- `process-member` resolves the admin `user_id` from the first row of
  `6_user_database_parts`, but `matchVehiclesToParts` itself currently uses a
  hardcoded `ADMIN_USER_ID` constant inside `lib/pick-sheet-matching.ts` — the
  `userId` arg is not used for the parts query.
- The three `/api/admin/email-automation/*` route handlers do **not** call
  Clerk `auth()` directly; protection comes from middleware. Be cautious if
  the middleware changes.
- "Find closest yard" weighs distance only — it does not check whether the
  chain has a working extractor. Members assigned to an un-extractable chain
  will fail at step 3 with a `502` from `process-member`.

---

## 7. File reference

### Email automation

```
app/admin/email-automation/page.tsx
app/api/admin/email-automation/find-yards/route.ts
app/api/admin/email-automation/process-member/route.ts
app/api/admin/email-automation/send-email/route.ts
```

### Pick sheet generator

```
app/generate-pick-sheet/page.tsx
app/generate-pick-sheet/layout.tsx
app/api/pick-sheet/extract/route.ts
app/api/pick-sheet/match/route.ts
app/api/pick-sheet/save/route.ts
app/api/pick-sheet/saved/...
app/api/pick-sheet/shared/[token]/route.ts
app/api/pick-sheet/claim/[token]/route.ts
app/api/admin/pick-sheet/share/route.ts
```

### Shared infrastructure

```
lib/railway-client.ts
lib/pick-sheet-matching.ts
lib/multi-location-chains.ts
components/chain-location-picker.tsx
lib/gmail.ts
lib/crm/prepare-tracked-send.ts
lib/supabase/server.ts
```

### Python extractor service

```
lib/pick-sheet-extractor/api.py
lib/pick-sheet-extractor/chain_registry.py
lib/pick-sheet-extractor/guaranteed_extractor.py
lib/pick-sheet-extractor/site_profile.py
lib/pick-sheet-extractor/chain_extractors/__init__.py
lib/pick-sheet-extractor/chain_extractors/<chain>.py
```
