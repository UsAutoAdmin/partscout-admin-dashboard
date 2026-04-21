/**
 * Generates data/part-review/normalized-parts.json from the verified queue.
 * Validates model names against PartScout's 00_year_make_model_lookup library.
 * Strips vehicle-type suffixes, handles sub-models, consolidates multi-year dupes.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const envContent = readFileSync(resolve(import.meta.dirname, "../.env.local"), "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Build model library from 00_year_make_model_lookup ──────────────────────
async function buildModelLibrary() {
  console.log("Loading 00_year_make_model_lookup...");
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

  // modelsByMake: Map<MAKE_UPPER, Set<MODEL_UPPER>>
  const modelsByMake = new Map();
  // modelDisplay: Map<"MAKE|MODEL", displayString>  (for proper casing)
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

  console.log(
    `Library: ${modelsByMake.size} makes, ${[...modelsByMake.values()].reduce((s, v) => s + v.size, 0)} unique models`,
  );
  return { modelsByMake, modelDisplay };
}

function isKnownModel(lib, make, candidate) {
  const models = lib.modelsByMake.get(make.toUpperCase());
  return models ? models.has(candidate.toUpperCase()) : false;
}

function getModelDisplay(lib, make, candidate) {
  return lib.modelDisplay.get(`${make.toUpperCase()}|${candidate.toUpperCase()}`) || candidate;
}

/**
 * Try to match a sequence of words against known models for a make.
 * Tries longest match first (4 words, 3 words, 2 words, 1 word).
 * Returns { model, remainingWords } or null.
 */
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

// ── Core normalization ──────────────────────────────────────────────────────
function normalize(p, lib) {
  const make = p.make.trim();
  const model = p.model.trim();
  const part = p.part_name.trim();

  const makeUpper = make.toUpperCase();
  const modelUpper = model.toUpperCase();
  const partWords = part.split(/\s+/);

  // ── CASE 1: model == make (degenerate) ──
  // Real model is hiding in the part_name
  if (modelUpper === makeUpper || modelUpper.replace(/\s/g, "") === makeUpper.replace(/\s/g, "")) {
    // Try to match part_name prefix against library models for this make
    const match = matchModelFromWords(lib, make, partWords);
    if (match && match.remaining.length > 0) {
      return { make, model: match.model, part_name: match.remaining.join(" ") };
    }
    // Fallback: first word as model if it's not obviously a part word
    if (partWords.length >= 2) {
      return { make, model: partWords[0], part_name: partWords.slice(1).join(" ") };
    }
    return { make, model, part_name: part };
  }

  // ── CASE 2: model is valid, check if part_name starts with model-extension ──
  // e.g., model="TRANSIT", part="150 Air Bag" → check if "Transit 150" is in library
  if (partWords.length >= 1) {
    const extendedCandidate = `${model} ${partWords[0]}`.toUpperCase();
    if (isKnownModel(lib, make, extendedCandidate)) {
      const display = getModelDisplay(lib, make, extendedCandidate);
      // Check if even more words extend it (e.g., "SAVANA 3500 VAN")
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

  // ── CASE 3: part_name starts with model name (redundant prefix) ──
  if (partWords.length >= 2 && partWords[0].toUpperCase() === modelUpper) {
    return { make, model, part_name: partWords.slice(1).join(" ") };
  }

  // ── CASE 4: model is valid as-is ──
  return { make, model, part_name: part };
}

// ── Title-case helpers ──────────────────────────────────────────────────────
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

function rankScore(p) {
  const st = p.new_sell_through ?? p.original_sell_through ?? 0;
  const vol = p.new_sold_count ?? p.original_sold_volume ?? 0;
  const margin = p.profit_margin ?? 0;
  const consistency = p.price_consistency ?? 0.5;
  const stScore = st >= 80 && st <= 200 ? 1 - Math.abs(st - 125) / 125 : 0;
  return stScore * 0.35 + Math.min(vol / 50, 1) * 0.3 + Math.min(Math.max(margin, 0) / 100, 1) * 0.2 + consistency * 0.15;
}

// ── Main ────────────────────────────────────────────────────────────────────
const lib = await buildModelLibrary();

const ccPath = resolve(import.meta.dirname, "../data/cross-compat-results.json");
const ccData = JSON.parse(readFileSync(ccPath, "utf8"));
const ccByKey = new Map();
for (const entry of ccData) {
  const key = `${entry.base_year}|${(entry.base_make || "").toLowerCase()}|${(entry.base_model || "").toLowerCase()}|${(entry.base_part || "").toLowerCase()}`;
  ccByKey.set(key, entry);
}

const queuePath = resolve(import.meta.dirname, "../data/part-review/queue.json");
const queue = JSON.parse(readFileSync(queuePath, "utf8"));
const verified = queue.filter(q => q.status === "scraped" && !q.removed);

// ── Normalize and group ──
const groups = new Map();
const transforms = [];

for (const p of verified) {
  const { make, model, part_name } = normalize(p, lib);
  const cleanMake = toTitleCase(make);
  const cleanModel = toTitleCase(model);
  const cleanPart = toTitleCase(part_name);

  const key = `${cleanMake.toLowerCase()}|${cleanModel.toLowerCase()}|${cleanPart.toLowerCase()}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...p, _make: cleanMake, _model: cleanModel, _part: cleanPart });

  if (model !== p.model || part_name !== p.part_name) {
    transforms.push(`  ${p.make} | ${p.model} | ${p.part_name}  →  ${cleanMake} | ${cleanModel} | ${cleanPart}`);
  }
}

console.log(`\nTransformations (${transforms.length} of ${verified.length}):`);
const uniqueT = [...new Set(transforms)];
for (const t of uniqueT.slice(0, 60)) console.log(t);
if (uniqueT.length > 60) console.log(`  ... and ${uniqueT.length - 60} more`);

// ── Build consolidated output ──
const consolidated = [];
for (const [, parts] of groups) {
  const best = parts.reduce((a, b) => (a.avg_sell_price || 0) >= (b.avg_sell_price || 0) ? a : b);
  const years = [...new Set(parts.map(p => parseInt(p.year)))].sort((a, b) => a - b);
  const yearStart = Math.min(...years);
  const yearEnd = Math.max(...years);
  const allModels = [...new Set(parts.map(p => p._model))];

  let bestCC = null;
  for (const p of parts) {
    const ccKey = `${p.year}|${p.make.toLowerCase()}|${p.model.toLowerCase()}|${p.part_name.toLowerCase()}`;
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

  consolidated.push({
    make: best._make,
    model: best._model,
    all_models: allModels,
    part_name: best._part,
    variation: best.variation_name || null,
    avg_sell_price: best.avg_sell_price,
    median_sell_price: best.median_sell_price,
    cog: best.cog,
    sell_through: best.new_sell_through ?? best.original_sell_through,
    sold_volume: best.new_sold_count ?? best.original_sold_volume,
    active_count: best.new_active_count ?? 0,
    profit_margin: best.profit_margin,
    price_consistency: best.price_consistency,
    best_image_url: best.best_image_url,
    scrape_id: best.scrape_id,
    scored_part_id: best.scored_part_id,
    primary_year: best.year,
    all_years: years,
    year_start: compatYearStart,
    year_end: compatYearEnd,
    compatible_makes: compatMakes,
    compatible_models: compatModels,
    source_count: parts.length,
    rank_score: rankScore(best),
  });
}

consolidated.sort((a, b) => b.rank_score - a.rank_score);
const top = consolidated.slice(0, 1000);

const outPath = resolve(import.meta.dirname, "../data/part-review/normalized-parts.json");
writeFileSync(outPath, JSON.stringify(top, null, 2));

console.log(`\nVerified: ${verified.length}`);
console.log(`Unique after normalization: ${consolidated.length}`);
console.log(`Output: ${top.length} parts → ${outPath}`);
console.log();

const withCompat = top.filter(p => p.year_start !== p.year_end || p.compatible_makes.length > 0).length;
const withImage = top.filter(p => p.best_image_url).length;
const withCog = top.filter(p => p.cog).length;
const multiYear = top.filter(p => p.source_count > 1).length;
console.log(`With compatibility: ${withCompat}`);
console.log(`With image: ${withImage}`);
console.log(`With COG: ${withCog}`);
console.log(`Multi-year consolidated: ${multiYear}`);

// ── Spot checks ──
for (const mk of ["Ford", "Lexus", "Chevrolet", "GMC", "Dodge", "BMW"]) {
  const parts = top.filter(p => p.make.toLowerCase() === mk.toLowerCase());
  console.log(`\n=== ${mk} (${parts.length}) ===`);
  for (const p of parts.slice(0, 12)) {
    console.log(`  ${p.make} | ${p.model} | ${p.part_name} (${p.year_start}-${p.year_end}, ${p.source_count} merged)`);
  }
}
