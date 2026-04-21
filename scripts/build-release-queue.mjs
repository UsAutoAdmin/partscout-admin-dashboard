#!/usr/bin/env node
/**
 * Build a high-confidence release queue from the auto-review results.
 *
 * "High confidence" means a part survived the rescrape with no surprises:
 *   - It was T1 or T2 BEFORE the rescrape
 *   - It is still T1 or T2 AFTER the rescrape (drift class is unchanged or improved)
 *   - It has a healthy sell-through (50%–300%) — not bursty, not suspicious
 *   - It has live active inventory (new_active > 0) — we have something to compete with
 *   - It had a meaningful sold-volume sample (sold_volume >= 10) — original score wasn't noise
 *   - It still passes our 0.30 composite floor on the new score
 *
 * Top-5k by new_composite is then written to data/release-queue/queue.json.
 *
 * Usage:
 *   node scripts/build-release-queue.mjs              # default 5,000
 *   node scripts/build-release-queue.mjs 3000          # custom size
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data/part-review");
const OUT_DIR = resolve(ROOT, "data/release-queue");
mkdirSync(OUT_DIR, { recursive: true });

const TARGET = parseInt(process.argv[2] || "5000", 10);

// Eligibility thresholds (single source of truth — also surfaced in the dashboard)
//
// We start with a broader pool (T1/T2/T3 stable) and let composite-score ranking
// pick the cream. Floors below ensure every selected part has:
//   - high sell-through (≥ 80%)            → real, healthy demand
//   - stable tier across the rescrape       → no data-quality surprises
//   - a meaningful sold-volume sample       → not noise
//   - active inventory to compete with      → no dead listings
const CRITERIA = {
  baselineTiers: ["T1", "T2", "T3"],
  newTiers: ["T1", "T2", "T3"],
  classifications: ["unchanged", "improved"],
  newSellThroughMin: 80,
  newSellThroughMax: 300,
  minNewActive: 1,
  minBaselineSold: 10,
  minNewComposite: 0.3,
};

function tierOf(score) {
  if (score >= 0.7) return "T1";
  if (score >= 0.5) return "T2";
  if (score >= 0.3) return "T3";
  return "below";
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main() {
  console.log(`[1/4] Loading inputs...`);
  const normalized = loadJson(resolve(DATA_DIR, "normalized-parts.json"));
  const autoReview = loadJson(resolve(DATA_DIR, "auto-review-results.json"));
  console.log(`  normalized-parts: ${normalized.length.toLocaleString()}`);
  console.log(`  auto-review parts: ${autoReview.parts.length.toLocaleString()}`);

  const arById = new Map(autoReview.parts.map((p) => [p.scored_part_id, p]));

  console.log(`[2/4] Joining + applying eligibility filter...`);
  const eligible = [];
  const rejectionReasons = {
    no_auto_review: 0,
    pending: 0,
    bad_classification: 0,
    bad_baseline_tier: 0,
    bad_new_tier: 0,
    sell_through_low: 0,
    sell_through_high: 0,
    no_active: 0,
    low_sold_volume: 0,
    low_composite: 0,
  };

  for (const part of normalized) {
    const ar = arById.get(part.scored_part_id);
    if (!ar) {
      rejectionReasons.no_auto_review++;
      continue;
    }
    if (ar.classification === "pending") {
      rejectionReasons.pending++;
      continue;
    }
    if (!CRITERIA.classifications.includes(ar.classification)) {
      rejectionReasons.bad_classification++;
      continue;
    }
    if (!CRITERIA.baselineTiers.includes(ar.baseline_tier)) {
      rejectionReasons.bad_baseline_tier++;
      continue;
    }
    if (!CRITERIA.newTiers.includes(ar.new_tier)) {
      rejectionReasons.bad_new_tier++;
      continue;
    }
    if (ar.new_sell_through == null || ar.new_sell_through < CRITERIA.newSellThroughMin) {
      rejectionReasons.sell_through_low++;
      continue;
    }
    if (ar.new_sell_through > CRITERIA.newSellThroughMax) {
      rejectionReasons.sell_through_high++;
      continue;
    }
    if ((ar.new_active ?? 0) < CRITERIA.minNewActive) {
      rejectionReasons.no_active++;
      continue;
    }
    if ((part.sold_volume ?? 0) < CRITERIA.minBaselineSold) {
      rejectionReasons.low_sold_volume++;
      continue;
    }
    if ((ar.new_composite ?? 0) < CRITERIA.minNewComposite) {
      rejectionReasons.low_composite++;
      continue;
    }

    eligible.push({
      // identity
      scored_part_id: part.scored_part_id,
      scrape_id: part.scrape_id,
      // descriptive
      make: part.make,
      model: part.model,
      part_name: part.part_name,
      variation: part.variation,
      primary_year: part.primary_year,
      year_start: part.year_start,
      year_end: part.year_end,
      all_years: part.all_years,
      best_image_url: part.best_image_url,
      // pricing
      avg_sell_price: part.avg_sell_price,
      cog: part.cog,
      profit_margin: part.profit_margin,
      profit_ratio: part.profit_ratio,
      // demand: the rescrape numbers, not the stale ones
      active_count: ar.new_active,
      sold_count: ar.new_sold,
      sell_through: ar.new_sell_through,
      sold_volume: part.sold_volume,
      sold_confidence: part.sold_confidence,
      price_consistency: part.price_consistency,
      // scoring
      baseline_composite: ar.baseline_composite,
      composite_score: ar.new_composite,
      baseline_tier: ar.baseline_tier,
      tier: ar.new_tier,
      drift: ar.classification,
      // provenance
      rescraped_at: ar.scraped_at,
    });
  }
  console.log(`  eligible: ${eligible.length.toLocaleString()} / ${normalized.length.toLocaleString()}`);
  console.log(`  rejections:`);
  for (const [k, v] of Object.entries(rejectionReasons)) {
    if (v > 0) console.log(`    ${k.padEnd(20)} ${v.toLocaleString()}`);
  }

  console.log(`[3/4] Ranking + selecting top ${TARGET.toLocaleString()}...`);
  eligible.sort((a, b) => b.composite_score - a.composite_score);
  const selected = eligible.slice(0, TARGET);

  // Stats for dashboard
  const tierCounts = selected.reduce((acc, p) => {
    acc[p.tier] = (acc[p.tier] ?? 0) + 1;
    return acc;
  }, {});
  const driftCounts = selected.reduce((acc, p) => {
    acc[p.drift] = (acc[p.drift] ?? 0) + 1;
    return acc;
  }, {});
  const makeCounts = selected.reduce((acc, p) => {
    acc[p.make] = (acc[p.make] ?? 0) + 1;
    return acc;
  }, {});
  const topMakes = Object.entries(makeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([make, count]) => ({ make, count }));

  const stats = {
    total: selected.length,
    eligible: eligible.length,
    candidatePool: normalized.length,
    tierCounts,
    driftCounts,
    topMakes,
    avgComposite:
      selected.reduce((s, p) => s + p.composite_score, 0) / Math.max(selected.length, 1),
    avgSellThrough:
      selected.reduce((s, p) => s + p.sell_through, 0) / Math.max(selected.length, 1),
    avgProfit:
      selected.reduce((s, p) => s + (p.profit_margin ?? 0), 0) / Math.max(selected.length, 1),
    minComposite: selected.length ? selected[selected.length - 1].composite_score : 0,
    maxComposite: selected.length ? selected[0].composite_score : 0,
  };

  console.log(`  selected: ${selected.length.toLocaleString()}`);
  console.log(`    by tier:`);
  for (const [t, c] of Object.entries(tierCounts).sort()) {
    console.log(`      ${t}: ${c.toLocaleString()}`);
  }
  console.log(`    by drift:`);
  for (const [d, c] of Object.entries(driftCounts)) {
    console.log(`      ${d}: ${c.toLocaleString()}`);
  }
  console.log(`    composite range: ${stats.minComposite.toFixed(3)} – ${stats.maxComposite.toFixed(3)}`);
  console.log(`    avg sell-through: ${stats.avgSellThrough.toFixed(1)}%`);
  console.log(`    avg profit: $${stats.avgProfit.toFixed(2)}`);

  console.log(`[4/4] Writing output...`);
  const payload = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    criteria: CRITERIA,
    stats,
    parts: selected,
  };
  const outPath = resolve(OUT_DIR, "queue.json");
  writeFileSync(outPath, JSON.stringify(payload));
  console.log(`  wrote ${outPath} (${(JSON.stringify(payload).length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`\nDone. Open the "Release Preview" tab on the dashboard to review.`);
}

main();
