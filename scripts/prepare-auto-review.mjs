#!/usr/bin/env node
/**
 * Prepare input shards for the automated ready-to-ship review.
 *
 * Input source : data/part-review/normalized-parts.json (the 21,499 ship-ready set)
 * Output       : data/part-review/auto-review-input.json — single combined manifest
 *                data/part-review/auto-review-shards/shard-{1..N}.json — per-mini shards
 *
 * Each entry contains everything the rescraper needs to scrape both sides of
 * the funnel (active + sold) and report back without another DB roundtrip:
 *   {
 *     scored_part_id, scrape_id,
 *     original_url,    // active listings page (from 9_Octoparse_Scrapes)
 *     sold_link,       // sold listings page (from 9_Octoparse_Scrapes)
 *     // baseline (for drift comparison after rescrape)
 *     baseline_active, baseline_sold, baseline_sell_through,
 *     baseline_composite, baseline_tier,
 *     // immutable scoring inputs (so the aggregator can recompute composite)
 *     profit_ratio, sold_confidence, price_consistency
 *   }
 */
import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const NORMALIZED_FILE = resolve(ROOT, "data/part-review/normalized-parts.json");
const OUT_DIR = resolve(ROOT, "data/part-review");
const SHARD_DIR = resolve(OUT_DIR, "auto-review-shards");
mkdirSync(SHARD_DIR, { recursive: true });

const SHARDS = parseInt(process.argv[2] || "3", 10); // default: 3 (Local + 2 minis)
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

function tierOf(s) {
  if (s >= 0.7) return "T1";
  if (s >= 0.5) return "T2";
  if (s >= 0.3) return "T3";
  return "below";
}

async function main() {
  const parts = JSON.parse(readFileSync(NORMALIZED_FILE, "utf8"));
  console.log(`[1/4] Loaded ${parts.length.toLocaleString()} ship-ready parts`);

  const scrapeIds = [...new Set(parts.map((p) => p.scrape_id).filter(Boolean))];
  console.log(`[2/4] ${scrapeIds.length.toLocaleString()} unique scrape_ids`);

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  const urlByScrapeId = new Map();
  const BATCH = 1000;
  for (let i = 0; i < scrapeIds.length; i += BATCH) {
    const slice = scrapeIds.slice(i, i + BATCH);
    const r = await client.query(
      `SELECT id, original_url, sold_link, active, sold, sell_through
       FROM "9_Octoparse_Scrapes"
       WHERE id = ANY($1::uuid[])`,
      [slice],
    );
    for (const row of r.rows) urlByScrapeId.set(row.id, row);
    process.stdout.write(`  fetched ${Math.min(i + BATCH, scrapeIds.length).toLocaleString()} / ${scrapeIds.length.toLocaleString()}\r`);
  }
  console.log(`\n[3/4] Resolved URLs for ${urlByScrapeId.size.toLocaleString()} scrapes`);
  await client.end();

  const manifest = [];
  let missingSold = 0;
  let missingActive = 0;
  for (const p of parts) {
    const src = urlByScrapeId.get(p.scrape_id);
    if (!src) continue;
    if (!src.original_url) missingActive++;
    if (!src.sold_link) missingSold++;
    if (!src.original_url && !src.sold_link) continue;

    manifest.push({
      scored_part_id: p.scored_part_id,
      scrape_id: p.scrape_id,
      original_url: src.original_url ?? null,
      sold_link: src.sold_link ?? null,
      // baseline snapshot (so the aggregator + dashboard can show drift)
      baseline_active: src.active != null && /^[0-9]+$/.test(String(src.active)) ? parseInt(src.active, 10) : null,
      baseline_sold: src.sold != null && /^[0-9]+$/.test(String(src.sold)) ? parseInt(src.sold, 10) : null,
      baseline_sell_through: src.sell_through != null ? Number(src.sell_through) : null,
      baseline_composite: Number(p.composite_score ?? p.rank_score ?? 0),
      baseline_tier: tierOf(Number(p.composite_score ?? p.rank_score ?? 0)),
      // scoring inputs that don't change during a rescrape
      profit_ratio: p.profit_ratio != null ? Number(p.profit_ratio) : null,
      sold_confidence: p.sold_confidence != null ? Number(p.sold_confidence) : null,
      price_consistency: p.price_consistency != null ? Number(p.price_consistency) : null,
      // descriptive fields for log messages
      make: p.make,
      model: p.model,
      part_name: p.part_name,
      year: p.primary_year,
    });
  }
  console.log(`  ${manifest.length.toLocaleString()} parts have at least one URL`);
  console.log(`  missing active URL: ${missingActive.toLocaleString()} | missing sold URL: ${missingSold.toLocaleString()}`);

  writeFileSync(resolve(OUT_DIR, "auto-review-input.json"), JSON.stringify(manifest));
  console.log(`  wrote auto-review-input.json (${manifest.length.toLocaleString()} parts)`);

  const shardSize = Math.ceil(manifest.length / SHARDS);
  for (let i = 0; i < SHARDS; i++) {
    const slice = manifest.slice(i * shardSize, (i + 1) * shardSize);
    const path = resolve(SHARD_DIR, `shard-${i + 1}.json`);
    writeFileSync(path, JSON.stringify(slice));
    console.log(`  shard-${i + 1}: ${slice.length.toLocaleString()} parts → ${path}`);
  }
  console.log(`[4/4] Done. ${SHARDS} shards ready.`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
