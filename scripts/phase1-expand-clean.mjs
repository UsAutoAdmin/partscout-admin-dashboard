/**
 * Phase 1: Expand clean scored_parts into normalized, ready-to-ship parts.
 * Pulls ALL scored_parts that have clean data (no make-in-model, no all-caps),
 * applies quality scoring, normalizes, consolidates multi-year dupes.
 * Updates pipeline state and logs progress in real-time.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { updatePhase, updateSummary, log, success, error as logError } from "./lib/pipeline-log.mjs";

const envContent = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Data quality detection ────────────────────────────────────────────────────
function hasDoubleModel(make, model) {
  if (!make || !model) return false;
  const makeUp = make.trim().toUpperCase();
  const modelUp = model.trim().toUpperCase();
  if (modelUp.startsWith(makeUp + " ") && makeUp.length > 1) return true;
  if (modelUp === makeUp) return true;
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
  if (isAllCaps(row.model) && !/^[A-Z0-9]{1,5}$/.test(row.model.trim())) return true;
  return false;
}

// ── Build model library ────────────────────────────────────────────────────────
async function buildModelLibrary() {
  log("Loading 00_year_make_model_lookup for model validation...");
  const allRows = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from("00_year_make_model_lookup")
      .select("make, model")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  const modelsByMake = new Map();
  const modelDisplay = new Map();

  for (const r of allRows) {
    const mk = r.make.trim();
    const md = r.model.trim();
    const mkKey = mk.toUpperCase();
    const mdKey = md.toUpperCase();
    if (!modelsByMake.has(mkKey)) modelsByMake.set(mkKey, new Set());
    modelsByMake.get(mkKey).add(mdKey);
    modelDisplay.set(`${mkKey}|${mdKey}`, md);
  }

  log(`Model library: ${modelsByMake.size} makes, ${[...modelsByMake.values()].reduce((s, v) => s + v.size, 0)} unique models`);
  return { modelsByMake, modelDisplay };
}

function isKnownModel(lib, make, candidate) {
  const models = lib.modelsByMake.get(make.toUpperCase());
  return models ? models.has(candidate.toUpperCase()) : false;
}

function getModelDisplay(lib, make, candidate) {
  return lib.modelDisplay.get(`${make.toUpperCase()}|${candidate.toUpperCase()}`) || candidate;
}

function matchModelFromWords(lib, make, words) {
  const mkKey = make.toUpperCase();
  const models = lib.modelsByMake.get(mkKey);
  if (!models) return null;
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    const candidate = words.slice(0, len).join(" ").toUpperCase();
    if (models.has(candidate)) {
      const display = lib.modelDisplay.get(`${mkKey}|${candidate}`) || words.slice(0, len).join(" ");
      return { model: display, remaining: words.slice(len) };
    }
  }
  return null;
}

// ── Normalization ────────────────────────────────────────────────────────────
function normalize(p, lib) {
  const make = (p.make || "").trim();
  const model = (p.model || "").trim();
  const part = (p.part_name || "").trim();
  if (!make || !model || !part) return { make, model, part_name: part };
  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();
  const partWords = part.split(/\s+/);

  if (modelUpper === makeUpper || modelUpper.replace(/\s/g, "") === makeUpper.replace(/\s/g, "")) {
    const match = matchModelFromWords(lib, make, partWords);
    if (match && match.remaining.length > 0) {
      return { make, model: match.model, part_name: match.remaining.join(" ") };
    }
    if (partWords.length >= 2) {
      return { make, model: partWords[0], part_name: partWords.slice(1).join(" ") };
    }
    return { make, model, part_name: part };
  }

  if (partWords.length >= 1) {
    const extendedCandidate = `${model} ${partWords[0]}`.toUpperCase();
    if (isKnownModel(lib, make, extendedCandidate)) {
      const display = getModelDisplay(lib, make, extendedCandidate);
      if (partWords.length >= 2) {
        const extendedMore = `${model} ${partWords[0]} ${partWords[1]}`.toUpperCase();
        if (isKnownModel(lib, make, extendedMore)) {
          const display2 = getModelDisplay(lib, make, extendedMore);
          return { make, model: display2, part_name: partWords.slice(2).join(" ") };
        }
      }
      return { make, model: display, part_name: partWords.slice(1).join(" ") };
    }
  }

  if (partWords.length >= 2 && partWords[0].toUpperCase() === modelUpper) {
    return { make, model, part_name: partWords.slice(1).join(" ") };
  }

  return { make, model, part_name: part };
}

// ── Title-case ────────────────────────────────────────────────────────────────
function looksLikeAbbreviation(w) {
  if (w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)) return true;
  if (/\d/.test(w)) return true;
  if (w.length <= 4 && !/[aeiou]/i.test(w) && /^[A-Z]+$/.test(w)) return true;
  return false;
}

const KEEP_UPPER = new Set([
  "BMW", "GMC", "AMG", "GTS", "SRT", "TRD", "CRV", "RSX", "MDX", "RDX",
  "TLX", "TSX", "CTS", "STS", "DTS", "ATS", "XTS", "RX", "GX", "LX",
  "IS", "LS", "NX", "UX", "RC", "NV", "GT", "A/C", "ABS", "LED",
  "XL", "ESV", "EXT", "VAN", "SUV",
]);

function toTitleCase(str) {
  return str.split(/\s+/).map(w => {
    const upper = w.toUpperCase();
    if (KEEP_UPPER.has(upper)) return upper;
    if (/^\d/.test(w)) return w.toUpperCase();
    if (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(w)) return w.toUpperCase();
    if (looksLikeAbbreviation(w)) return upper;
    if (w.length <= 2 && /^[A-Z]+$/i.test(w)) return upper;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}

// ── Quality scoring ────────────────────────────────────────────────────────────
function qualityScore(p) {
  const st = p.sell_through ?? 0;
  const vol = p.sold_volume ?? 0;
  const conf = p.sold_confidence ?? 0;
  const consistency = p.price_consistency ?? 0.5;
  const price = p.avg_sell_price ?? 0;

  // Sell-through proximity to 100% (sweet spot)
  const stScore = st >= 50 && st <= 300
    ? 1 - Math.abs(st - 100) / 200
    : st > 300 ? 0.1 : 0.2;

  // Volume score: more sales = more reliable
  const volScore = Math.min(vol / 40, 1);

  // Confidence from LLM verification
  const confScore = conf;

  // Price favors moderate range ($20-$200)
  const priceScore = price >= 20 && price <= 200
    ? 1
    : price > 200 ? 0.8 : Math.max(price / 20, 0.1);

  return stScore * 0.30 + volScore * 0.25 + confScore * 0.20 + consistency * 0.15 + priceScore * 0.10;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Phase 1: Expand Clean Scored Parts ===\n");
  log("Phase 1 started: expanding clean scored_parts");
  updatePhase("phase1-clean-expand", {
    status: "running",
    startedAt: new Date().toISOString(),
    progress: 0,
  });

  // Load model library
  const lib = await buildModelLibrary();

  // Load cross-compatibility data if available
  const ccPath = resolve(import.meta.dirname, "../data/cross-compat-results.json");
  const ccByKey = new Map();
  if (existsSync(ccPath)) {
    const ccData = JSON.parse(readFileSync(ccPath, "utf8"));
    for (const entry of ccData) {
      const key = `${entry.base_year}|${(entry.base_make || "").toLowerCase()}|${(entry.base_model || "").toLowerCase()}|${(entry.base_part || "").toLowerCase()}`;
      ccByKey.set(key, entry);
    }
    log(`Loaded ${ccData.length} cross-compatibility entries`);
  }

  // Fetch ALL scored_parts
  log("Fetching all scored_parts from database...");
  let allScored = [];
  let offset = 0;
  while (true) {
    const { data, error: err } = await supabase
      .from("scored_parts")
      .select("id, scrape_id, variation_id, year, make, model, part_name, variation_name, avg_sell_price, median_sell_price, sell_through, sold_volume, sold_confidence, profit_margin, cog, cog_matched_name, price_consistency, best_image_url, best_listing_title")
      .range(offset, offset + 999);
    if (err) { logError(`DB error: ${err.message}`); break; }
    if (!data || data.length === 0) break;
    allScored.push(...data);
    offset += 1000;
    if (offset % 10000 === 0) {
      console.log(`  Loaded ${allScored.length} rows...`);
    }
    if (data.length < 1000) break;
  }
  log(`Loaded ${allScored.length} total scored_parts`);
  updatePhase("phase1-clean-expand", { progress: 1000, details: `Loaded ${allScored.length} scored_parts` });

  // Split into clean vs affected
  const clean = allScored.filter(r => !isAffected(r));
  const affected = allScored.filter(r => isAffected(r));
  log(`Clean: ${clean.length} rows | Affected: ${affected.length} rows`);
  console.log(`\nClean: ${clean.length} | Affected: ${affected.length}\n`);

  // Apply minimum quality thresholds (relaxed compared to Part Review initial sample)
  const qualified = clean.filter(p => {
    const st = p.sell_through ?? 0;
    const vol = p.sold_volume ?? 0;
    const conf = p.sold_confidence ?? 0;
    const margin = p.profit_margin ?? 0;
    return st >= 40 && st <= 400 && vol >= 3 && conf >= 0.5 && margin >= 5;
  });
  log(`After quality filter: ${qualified.length} rows pass thresholds`);
  console.log(`Qualified (ST 40-400%, vol>=3, conf>=0.5, margin>=5%): ${qualified.length}`);

  // De-dup: pick best variation per year/make/model/part
  const bestByKey = new Map();
  for (const p of qualified) {
    const key = `${p.year}|${p.make}|${p.model}|${p.part_name}`;
    const existing = bestByKey.get(key);
    if (!existing || (p.sold_confidence > existing.sold_confidence) ||
        (p.sold_confidence === existing.sold_confidence && p.sold_volume > existing.sold_volume)) {
      bestByKey.set(key, p);
    }
  }
  log(`Unique year/make/model/part combos: ${bestByKey.size}`);
  console.log(`Unique combos: ${bestByKey.size}`);
  updatePhase("phase1-clean-expand", { progress: 3000, details: `${bestByKey.size} unique parts, normalizing...` });

  // Normalize and group across years
  const groups = new Map();
  let normalizeCount = 0;
  for (const p of bestByKey.values()) {
    const { make, model, part_name } = normalize(p, lib);
    const cleanMake = toTitleCase(make);
    const cleanModel = toTitleCase(model);
    const cleanPart = toTitleCase(part_name);

    const groupKey = `${cleanMake.toLowerCase()}|${cleanModel.toLowerCase()}|${cleanPart.toLowerCase()}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ ...p, _make: cleanMake, _model: cleanModel, _part: cleanPart });
    normalizeCount++;
    if (normalizeCount % 2000 === 0) {
      updatePhase("phase1-clean-expand", { progress: 3000 + Math.floor(normalizeCount / bestByKey.size * 3000) });
    }
  }
  log(`Normalized into ${groups.size} unique parts (from ${bestByKey.size} combos)`);
  console.log(`\nGroups after normalization: ${groups.size}`);

  // Build consolidated output
  const consolidated = [];
  for (const [, parts] of groups) {
    const best = parts.reduce((a, b) => (a.avg_sell_price || 0) >= (b.avg_sell_price || 0) ? a : b);
    const years = [...new Set(parts.map(p => parseInt(p.year)))].sort((a, b) => a - b);
    const yearStart = Math.min(...years);
    const yearEnd = Math.max(...years);
    const allModels = [...new Set(parts.map(p => p._model))];

    let bestCC = null;
    for (const p of parts) {
      const ccKey = `${p.year}|${(p.make || "").toLowerCase()}|${(p.model || "").toLowerCase()}|${(p.part_name || "").toLowerCase()}`;
      const cc = ccByKey.get(ccKey);
      if (cc && (!bestCC || (cc.confidence || 0) > (bestCC.confidence || 0))) bestCC = cc;
    }

    let compatYearStart = yearStart;
    let compatYearEnd = yearEnd;
    let compatMakes = [];
    let compatModels = [];
    if (bestCC) {
      if (bestCC.compatible_year_start) compatYearStart = Math.min(compatYearStart, bestCC.compatible_year_start);
      if (bestCC.compatible_year_end) compatYearEnd = Math.max(compatYearEnd, bestCC.compatible_year_end);
      compatMakes = bestCC.compatible_makes || [];
      compatModels = bestCC.compatible_models || [];
    }

    const score = qualityScore(best);

    consolidated.push({
      make: best._make,
      model: best._model,
      all_models: allModels,
      part_name: best._part,
      variation: best.variation_name || null,
      avg_sell_price: best.avg_sell_price,
      median_sell_price: best.median_sell_price,
      cog: best.cog,
      sell_through: best.sell_through,
      sold_volume: best.sold_volume,
      active_count: 0,
      profit_margin: best.profit_margin,
      price_consistency: best.price_consistency,
      best_image_url: best.best_image_url,
      scrape_id: best.scrape_id,
      scored_part_id: best.id,
      primary_year: best.year,
      all_years: years,
      year_start: compatYearStart,
      year_end: compatYearEnd,
      compatible_makes: compatMakes,
      compatible_models: compatModels,
      source_count: parts.length,
      quality_score: score,
      sold_confidence: best.sold_confidence,
    });
  }

  consolidated.sort((a, b) => b.quality_score - a.quality_score);
  updatePhase("phase1-clean-expand", { progress: 8000 });

  // Stats by quality tier
  const tier1 = consolidated.filter(p => p.quality_score >= 0.7);
  const tier2 = consolidated.filter(p => p.quality_score >= 0.5 && p.quality_score < 0.7);
  const tier3 = consolidated.filter(p => p.quality_score >= 0.3 && p.quality_score < 0.5);
  const below = consolidated.filter(p => p.quality_score < 0.3);

  console.log(`\n=== Quality Distribution ===`);
  console.log(`  Tier 1 (score >= 0.7): ${tier1.length} parts`);
  console.log(`  Tier 2 (0.5 - 0.7):   ${tier2.length} parts`);
  console.log(`  Tier 3 (0.3 - 0.5):   ${tier3.length} parts`);
  console.log(`  Below 0.3:             ${below.length} parts`);
  console.log(`  Total:                 ${consolidated.length} parts`);
  log(`Quality tiers - T1: ${tier1.length}, T2: ${tier2.length}, T3: ${tier3.length}, Below: ${below.length}`);

  // Output all parts scoring >= 0.3 (reasonable quality threshold)
  const output = consolidated.filter(p => p.quality_score >= 0.3);
  const outPath = resolve(import.meta.dirname, "../data/pipeline/phase1-expanded.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  // Also update normalized-parts.json with top 1000 for the existing Ready to Ship tab
  const normalizedPath = resolve(import.meta.dirname, "../data/part-review/normalized-parts.json");
  const top1000 = output.slice(0, 1000).map(p => ({ ...p, rank_score: p.quality_score }));
  writeFileSync(normalizedPath, JSON.stringify(top1000, null, 2));

  console.log(`\nOutput: ${output.length} parts → ${outPath}`);
  console.log(`Updated normalized-parts.json with top 1000`);

  const withCompat = output.filter(p => p.year_start !== p.year_end || p.compatible_makes.length > 0).length;
  const withImage = output.filter(p => p.best_image_url).length;
  const withCog = output.filter(p => p.cog).length;
  const multiYear = output.filter(p => p.source_count > 1).length;

  console.log(`\n=== Output Stats ===`);
  console.log(`  Total parts:       ${output.length}`);
  console.log(`  With compatibility: ${withCompat}`);
  console.log(`  With image:        ${withImage}`);
  console.log(`  With COG:          ${withCog}`);
  console.log(`  Multi-year:        ${multiYear}`);

  // Spot checks
  for (const mk of ["Ford", "Chevrolet", "Toyota", "Honda", "BMW", "Lexus"]) {
    const parts = output.filter(p => p.make.toLowerCase() === mk.toLowerCase());
    console.log(`\n--- ${mk} (${parts.length}) ---`);
    for (const p of parts.slice(0, 5)) {
      console.log(`  ${p.make} ${p.model} | ${p.part_name} | ST:${p.sell_through}% | $${p.avg_sell_price} | Q:${p.quality_score.toFixed(3)}`);
    }
  }

  // Update pipeline state
  updatePhase("phase1-clean-expand", {
    status: "completed",
    progress: output.length,
    total: output.length,
    completedAt: new Date().toISOString(),
    details: `${output.length} parts extracted (T1: ${tier1.length}, T2: ${tier2.length}, T3: ${tier3.length})`,
  });
  updateSummary({ totalPartsReady: output.length });
  success(`Phase 1 complete: ${output.length} clean parts ready`);
  console.log(`\nPhase 1 complete.`);
}

main().catch(e => {
  console.error(e);
  logError(`Phase 1 failed: ${e.message}`);
  updatePhase("phase1-clean-expand", { status: "failed", details: e.message });
});
