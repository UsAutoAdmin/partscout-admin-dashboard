# PartScout Project Context

## Overview
PartScout is an auto parts profitability analysis platform. It scrapes eBay sold/active listings, verifies data quality with LLMs, identifies profitable part variations via clustering, matches cost-of-goods from junkyard catalogs, and scores parts by composite profitability. The end goal is ~5,000 high-profit auto parts with 3x+ selling-price-to-purchase-price ratio.

---

## Project Directories

### 1. Admin Dashboard (Next.js 14)
**Path:** `/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard/`
- **Framework:** Next.js 14 App Router, React, TypeScript
- **Port:** `localhost:3000`
- **Key pages:**
  - `/` — Main dashboard
  - `/scrapes` — Scrape pipeline metrics
  - `/scrapes/monitor` — Real-time scraper monitor (rates, logs, pipeline progress)
  - `/part-finder` — Scored profitable parts browser with approve/verify workflow
  - `/video-research` — Video research tool (reference for UI styling)
  - `/video-generator` — Automated video generation
- **Key libs:**
  - `lib/supabase.ts` — Supabase service role client
  - `lib/scraper-fleet.ts` — Direct HTTP calls to each mini's agent (port 3848)
  - `lib/scraper-fleet-client.ts` — Calls via local gateway (port 3850)
  - `lib/scrapes.ts` — Scrape pipeline metric queries
- **API routes:**
  - `/api/scrapes/monitor` — Fleet status + pipeline counts
  - `/api/part-finder` — Scored parts list with deduplication
  - `/api/part-finder/[id]` — Single part detail with variations and listings
  - `/api/part-finder/export` — CSV export
  - `/api/scraper-fleet` — Fleet status/control proxy
- **Env:** Uses `.env.local` at project root (Chase's Open Claw/.env.local)
- **Design system:** Uses `gray-*`, `brand-*`, `success-*`, `warning-*`, `error-*` color tokens with dark mode support

### 2. Scraper Agent (Node.js/TypeScript)
**Path:** `/Users/chaseeriksson/Downloads/Seed Database/`
- **Entry:** `src/index.ts`
- **Env:** `.env.local` at Seed Database root (separate from dashboard)
- **Launch:** `bash run-detached.sh --workers 10 --browsers 3`
- **Key source files:**
  - `src/index.ts` — Main entry, coordinates all modes and pools
  - `src/config.ts` — CLI args, env var loading
  - `src/db.ts` — All Supabase interactions (fetch batches, write results, RPCs)
  - `src/worker-pool.ts` — Playwright browser pool manager
  - `src/scraper.ts` — Sold/active count scraping from eBay
  - `src/deep-scraper.ts` — Extract individual sold listing details (title, price, image, date)
  - `src/verification.ts` — LLM confidence verification of listing matches
  - `src/variation-clustering.ts` — LLM-based grouping of listings into part variations
  - `src/cog-matcher.ts` — Fuzzy match part names against junkyard price catalogs
  - `src/scoring.ts` — Composite profitability scoring engine
  - `src/dashboard.ts` — WebSocket server (port 3847) broadcasting real-time stats
  - `src/agent.ts` — HTTP server (port 3848) for remote control and status
- **Ports:**
  - `3847` — Dashboard WebSocket (stats broadcast every 2s)
  - `3848` — Agent HTTP API (status, control, mode management)

### 3. Local Fleet Gateway
**Path:** `/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard/local-gateway/server.mjs`
- **Port:** `3850`
- Aggregates fleet status and control across all minis

---

## Infrastructure

### Mac Mini Cluster (Scraper Fleet)
| Machine | IP (Tailscale) | Scraper Path |
|---------|---------------|--------------|
| Mini 1 (Local) | 100.106.88.91 | `/Users/chaseeriksson/Downloads/Seed Database/` |
| Mini 2 | 100.100.6.101 | `~/Seed-Database/` |
| Mini 3 | 100.68.192.57 | `~/Seed-Database/` |

- SSH access: `chaseeriksson@<ip>` (key-based, no password)
- Deploy code via `scp` to all minis, then restart
- Each mini runs the same scraper agent code independently
- Typical launch: `bash run-detached.sh --workers 10 --browsers 3`

### Supabase
- **Project:** `wykhqhclzyygkslpbgmh`
- **Dashboard:** https://supabase.com/dashboard/project/wykhqhclzyygkslpbgmh
- **URL:** `https://wykhqhclzyygkslpbgmh.supabase.co`

---

## Database Schema (Key Tables)

### `9_Octoparse_Scrapes` (main scrape data, ~478K+ rows)
- `id` (UUID PK)
- `original_url` — eBay search URL
- `sold_link` — eBay sold listings URL
- `active` — Active listing count (text)
- `sold` — Sold listing count (text)
- `sell_through` — Sold/Active percentage
- `sold_confidence` — LLM verification confidence (0-1)
- `sold_verified_at` — When LLM verified
- `deep_scraped` (boolean) — Individual listings extracted
- `deep_scraped_at` (timestamptz) — Claim timestamp for atomic batching
- `variation_clustered` (boolean) — LLM clustering complete
- `variation_clustered_at` (timestamptz)
- `scored` (boolean) — Scoring engine processed

### `sold_listing_details` (individual eBay sold listings)
- `id` (UUID PK)
- `scrape_id` (FK → 9_Octoparse_Scrapes)
- `title`, `price`, `image_url`, `sold_date`, `listing_url`
- Unique constraint: `(scrape_id, listing_url)`

### `part_variations` (LLM-identified variation clusters)
- `id` (UUID PK)
- `scrape_id` (FK)
- `search_term`, `variation_name`, `variation_keywords`
- `avg_price`, `median_price`, `min_price`, `max_price`
- `listing_count`, `best_image_url`, `best_listing_title`
- `is_highest_value` (boolean)

### `scored_parts` (final profitability rankings)
- `id` (UUID PK)
- `scrape_id`, `variation_id`
- `search_term`, `variation_name`, `year`, `make`, `model`, `part_name`
- `avg_sell_price`, `median_sell_price`, `cog`, `profit_margin`, `profit_ratio`
- `sell_through`, `sold_confidence`, `sold_volume`, `price_consistency`
- `composite_score` — Weighted score (profit ratio 30%, sell-through 25%, volume 15%, confidence 15%, price consistency 15%)
- `best_image_url`, `best_listing_title`
- `cog_matched_name`, `cog_match_score`
- `approved` (boolean), `status`

### `lkq_prices` (junkyard cost-of-goods catalog)
- Contains pricing from LKQ and other junkyards
- LKQ entries have priority in COG matching

### `Video_Parts_for_research` (video generation queue)
### `8_Research_Assistant` (older research data, not primary)

---

## Pipeline Architecture

```
9_Octoparse_Scrapes (raw)
    │
    ├─► [Sold/Active Scrape] — Playwright browsers extract sold/active counts from eBay
    │
    ├─► [LLM Verification] — Confidence scoring that listings match the search query
    │       (gpt-4.1-nano or Anthropic claude-haiku-4-5)
    │
    ├─► [Deep Scrape] — Extract individual sold listing details (title, price, image)
    │       Stores in: sold_listing_details
    │       Atomic claiming via: claim_deep_batch RPC (FOR UPDATE SKIP LOCKED)
    │
    ├─► [Variation Clustering] — LLM groups listings into distinct part variations
    │       Model: gpt-4.1-nano (was gpt-4o-mini, switched for rate limits)
    │       Stores in: part_variations
    │
    ├─► [COG Matching] — Fuzzy match against lkq_prices catalog
    │       src/cog-matcher.ts
    │
    └─► [Scoring] — Composite profitability score
            Filters: profit_ratio >= 3x, confidence > 0.7, sold_volume >= 10
            Stores in: scored_parts
            Mutex prevents overlapping scoring passes
            Marks scored immediately to prevent duplicates
```

---

## Key RPC Functions (Supabase)

### `claim_deep_batch(batch_size int)`
Atomically claims rows for deep scraping using `FOR UPDATE SKIP LOCKED`. Sets `deep_scraped_at = now()` as claim timestamp. Filters: confidence > 0.7, sell_through > 60, sold >= 10, has sold_link, not yet deep scraped.

### `claim_verification_backlog_batch(batch_size int)`
Claims rows for LLM verification backlog processing.

---

## API Keys & Services

| Service | Env Var | Used For |
|---------|---------|----------|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database |
| OpenAI | `OPENAI_API_KEY` | Variation clustering (gpt-4.1-nano), LLM verification |
| Anthropic | `ANTHROPIC_API_KEY` | LLM verification (currently disabled — credits exhausted) |
| Clerk | `CLERK_SECRET_KEY` | Dashboard auth |
| eBay | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay OAuth API |
| Stripe | `STRIPE_SECRET_KEY` | Payments |
| Google | `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` | Email via Gmail API |
| Zapier | `ZAPIER_WEBHOOK_URL` | Webhooks |

**OpenAI Tier:** Tier 3 ($100+ spent). Rate limits: 5,000 RPM, 4M TPM for gpt-4.1-nano.

---

## Common Operations

### Start scrapers on all minis
```bash
# Local
cd "/Users/chaseeriksson/Downloads/Seed Database" && bash run-detached.sh --workers 10 --browsers 3

# Remote
ssh chaseeriksson@100.100.6.101 "cd ~/Seed-Database && bash run-detached.sh --workers 10 --browsers 3"
ssh chaseeriksson@100.68.192.57 "cd ~/Seed-Database && bash run-detached.sh --workers 10 --browsers 3"
```

### Start deep scrape mode (after scrapers are running)
```bash
for IP in 127.0.0.1 100.100.6.101 100.68.192.57; do
  curl -s -X POST "http://$IP:3848/control" -H "Content-Type: application/json" -d '{"action":"startMode","mode":"deep"}'
done
```

### Deploy code changes to all minis
```bash
scp -o ConnectTimeout=5 "/Users/chaseeriksson/Downloads/Seed Database/src/<file>.ts" chaseeriksson@100.100.6.101:~/Seed-Database/src/
scp -o ConnectTimeout=5 "/Users/chaseeriksson/Downloads/Seed Database/src/<file>.ts" chaseeriksson@100.68.192.57:~/Seed-Database/src/
```

### Check scraper status
```bash
curl -s http://127.0.0.1:3848/status | jq '.metrics'
tail -50 "/Users/chaseeriksson/Downloads/Seed Database/logs/scraper.log"
```

### Start dashboard
```bash
cd "/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard" && npm run dev
```

### Start gateway
```bash
cd "/Users/chaseeriksson/.openclaw/workspace/partscout-admin-dashboard" && node local-gateway/server.mjs
```

---

## Known Issues & Notes

1. **Supabase statement timeouts** — Large queries on `9_Octoparse_Scrapes` can timeout. Use partial indexes and `SET LOCAL statement_timeout` in RPCs.
2. **Port conflicts on restart** — Kill stale processes on 3847/3848 before restarting: `lsof -ti:3847 | xargs kill -9`
3. **Deep/verify pools are lazy-initialized** — They don't launch browsers until `startMode` is called via the agent.
4. **Scoring mutex** — `runScoringPass` has a `scoringInProgress` flag to prevent overlapping passes. Rows are marked `scored=true` immediately after fetch to prevent duplicates.
5. **Part Finder deduplication** — API deduplicates by `search_term + variation_name`, keeping highest `composite_score`.
6. **Anthropic credits exhausted** — Key is commented out in Seed Database `.env.local`. Re-enable when topped up.
7. **gpt-4.1-nano** — Switched from gpt-4o-mini for 20x higher rate limits at lower cost. Quality is sufficient for listing title clustering.
