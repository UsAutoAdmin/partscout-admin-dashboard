#!/usr/bin/env node
/**
 * Direct-Postgres replica of phase1-expand-clean. Bypasses Cloudflare WAF
 * and applies a 500%-sell-through sanity cap to the ship-ready set.
 *
 * Outputs three artifacts:
 *   data/part-review/normalized-parts.json     — ALL ship-ready (sell_through ≤ 500%)
 *   data/part-review/suspicious-parts.json     — sell_through > 500% (queued for active rescrape)
 *   data/part-review/expand-summary.json       — counts + tier breakdown
 *
 * Run with DATABASE_URL pointing at the direct Postgres port (5432, not the pooler).
 *
 * Consolidation key: (make, model, part_name) lower-cased.
 * For each unique key we keep the row with the highest composite_score, then
 * aggregate the set of years observed across all matching rows.
 */
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "data/part-review");
mkdirSync(OUT_DIR, { recursive: true });

const SELL_THROUGH_CAP = 500; // sanity cap — anything above is data-quality suspect
const COMPOSITE_FLOOR = 0.3;  // matches phase1 quality threshold
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

// ─── Data quality helpers (mirror phase1-expand-clean.mjs) ───────────────────
function hasDoubleModel(make, model) {
  if (!make || !model) return false;
  const a = make.trim().toUpperCase();
  const b = model.trim().toUpperCase();
  if (b.startsWith(a + " ") && a.length > 1) return true;
  if (b === a) return true;
  return false;
}

function isAllCaps(str) {
  if (!str) return false;
  const letters = str.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase() && letters.length > 3;
}

function isAffected(row) {
  if (hasDoubleModel(row.make, row.model)) return true;
  if (row.model && isAllCaps(row.model) && !/^[A-Z0-9]{1,5}$/.test(row.model.trim())) return true;
  return false;
}

function tierOf(score) {
  if (score >= 0.7) return "T1";
  if (score >= 0.5) return "T2";
  if (score >= 0.3) return "T3";
  return "below";
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  const t0 = Date.now();
  console.log(`[1/4] Fetching scored_parts (composite_score >= ${COMPOSITE_FLOOR})...`);
  const { rows } = await client.query(`
    SELECT
      id, scrape_id, variation_id,
      year, make, model, part_name, variation_name,
      avg_sell_price, median_sell_price, cog,
      profit_margin, profit_ratio, sell_through,
      sold_volume, sold_confidence, price_consistency,
      composite_score,
      best_image_url, best_listing_title, cog_matched_name
    FROM scored_parts
    WHERE composite_score >= $1
  `, [COMPOSITE_FLOOR]);
  console.log(`  loaded ${rows.length.toLocaleString()} rows in ${Math.round((Date.now()-t0)/1000)}s`);

  // ── Filter clean ──
  const clean = rows.filter(r => !isAffected(r));
  console.log(`[2/4] Clean rows (no double-make / no all-caps): ${clean.length.toLocaleString()}`);

  // ── Consolidate by (make, model, part_name) ──
  // Best variant = highest composite_score. We also track all years observed
  // per consolidation key so the dashboard can show year ranges.
  const byKey = new Map();
  const yearsByKey = new Map();
  for (const r of clean) {
    const key = `${(r.make ?? "").trim().toLowerCase()}|${(r.model ?? "").trim().toLowerCase()}|${(r.part_name ?? "").trim().toLowerCase()}`;
    const yearN = parseInt(r.year);
    if (!Number.isNaN(yearN)) {
      if (!yearsByKey.has(key)) yearsByKey.set(key, new Set());
      yearsByKey.get(key).add(yearN);
    }
    const prev = byKey.get(key);
    if (!prev || Number(r.composite_score ?? 0) > Number(prev.composite_score ?? 0)) byKey.set(key, r);
  }
  const unique = [...byKey.entries()];
  console.log(`[3/4] Unique parts (consolidated): ${unique.length.toLocaleString()}`);

  // ── Build dashboard rows ──
  // Schema must match what app/part-review/PartReviewClient.tsx → NormalizedPart expects.
  const allParts = unique.map(([key, p]) => {
    const yearSet = yearsByKey.get(key) ?? new Set();
    const years = [...yearSet].sort((a, b) => a - b);
    const yearStart = years.length ? years[0] : parseInt(p.year) || null;
    const yearEnd = years.length ? years[years.length - 1] : parseInt(p.year) || null;
    const sellThrough = Number(p.sell_through ?? 0);
    const composite = Number(p.composite_score ?? 0);
    return {
      make: p.make ?? "",
      model: p.model ?? "",
      all_models: p.model ? [p.model] : [],
      part_name: p.part_name ?? "",
      variation: p.variation_name || null,
      avg_sell_price: Number(p.avg_sell_price ?? 0),
      median_sell_price: p.median_sell_price != null ? Number(p.median_sell_price) : null,
      cog: p.cog != null ? Number(p.cog) : null,
      sell_through: sellThrough,
      sold_volume: p.sold_volume ?? null,
      active_count: 0,
      profit_margin: p.profit_margin != null ? Number(p.profit_margin) : null,
      profit_ratio: p.profit_ratio != null ? Number(p.profit_ratio) : null,
      sold_confidence: p.sold_confidence != null ? Number(p.sold_confidence) : null,
      price_consistency: p.price_consistency != null ? Number(p.price_consistency) : null,
      best_image_url: p.best_image_url ?? null,
      best_listing_title: p.best_listing_title ?? null,
      cog_matched_name: p.cog_matched_name ?? null,
      primary_year: parseInt(p.year) || null,
      all_years: years,
      year_start: yearStart,
      year_end: yearEnd,
      compatible_makes: [],
      compatible_models: [],
      source_count: years.length || 1,
      rank_score: composite,
      composite_score: composite,
      tier: tierOf(composite),
      scrape_id: p.scrape_id,
      scored_part_id: p.id,
    };
  });

  // ── Split: ship-ready (≤ cap) vs suspicious (> cap) ──
  const shipReady = allParts.filter(p => p.sell_through <= SELL_THROUGH_CAP);
  const suspicious = allParts.filter(p => p.sell_through > SELL_THROUGH_CAP);

  shipReady.sort((a, b) => b.rank_score - a.rank_score);
  suspicious.sort((a, b) => b.sell_through - a.sell_through);

  const tierCount = (arr, t) => arr.filter(p => p.tier === t).length;

  const summary = {
    generatedAt: new Date().toISOString(),
    sellThroughCap: SELL_THROUGH_CAP,
    compositeFloor: COMPOSITE_FLOOR,
    raw: rows.length,
    clean: clean.length,
    uniqueAfterConsolidation: unique.length,
    shipReady: {
      total: shipReady.length,
      t1: tierCount(shipReady, "T1"),
      t2: tierCount(shipReady, "T2"),
      t3: tierCount(shipReady, "T3"),
    },
    suspicious: {
      total: suspicious.length,
      bySellThrough: {
        "500-1000": suspicious.filter(p => p.sell_through < 1000).length,
        "1000-2000": suspicious.filter(p => p.sell_through >= 1000 && p.sell_through < 2000).length,
        "2000-5000": suspicious.filter(p => p.sell_through >= 2000 && p.sell_through < 5000).length,
        "5000+": suspicious.filter(p => p.sell_through >= 5000).length,
      },
      withScrapeId: suspicious.filter(p => p.scrape_id).length,
    },
  };

  console.log(`[4/4] Writing artifacts...`);
  writeFileSync(resolve(OUT_DIR, "normalized-parts.json"), JSON.stringify(shipReady));
  writeFileSync(resolve(OUT_DIR, "suspicious-parts.json"), JSON.stringify(suspicious));
  writeFileSync(resolve(OUT_DIR, "expand-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`  normalized-parts.json: ${shipReady.length.toLocaleString()} parts`);
  console.log(`  suspicious-parts.json: ${suspicious.length.toLocaleString()} parts (sell_through > ${SELL_THROUGH_CAP}%)`);
  console.log(`  expand-summary.json:   tiers ship-ready → T1=${summary.shipReady.t1} T2=${summary.shipReady.t2} T3=${summary.shipReady.t3}`);

  await client.end();
}

main().catch(e => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
