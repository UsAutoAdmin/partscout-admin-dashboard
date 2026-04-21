#!/usr/bin/env node
/**
 * Some 9_Octoparse_Scrapes rows have an `original_url` that actually contains
 * `LH_Sold=1` — i.e. the column was populated with the sold-URL by mistake.
 * That made auto-review's "active" rescrape return the sold count, producing
 * fake 100% sell-throughs.
 *
 * This script builds a focused input file for re-scraping ONLY the active
 * URLs of the affected parts, with `LH_Sold=1`/`LH_Complete=1` stripped.
 * The existing `new_sold` values from auto-review-output stay authoritative.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data/part-review");
const OUT_DIR = resolve(DATA_DIR, "fix-active");
mkdirSync(OUT_DIR, { recursive: true });

function fixActiveUrl(url) {
  if (!url) return null;
  return url
    .replace(/&LH_Sold=1/g, "")
    .replace(/&LH_Complete=1/g, "")
    .replace(/\?LH_Sold=1&/g, "?")
    .replace(/\?LH_Complete=1&/g, "?")
    .replace(/\?LH_Sold=1$/g, "")
    .replace(/\?LH_Complete=1$/g, "");
}

const manifest = JSON.parse(readFileSync(resolve(DATA_DIR, "auto-review-input.json"), "utf8"));

// Pull current new_sold from the per-shard output JSONL files so we can preserve them
const PULLED = resolve(DATA_DIR, "auto-review-pulled");
const soldByPart = new Map();
const activeByPart = new Map();
for (const node of ["local", "mini2", "mini3"]) {
  const f = resolve(PULLED, `${node}.jsonl`);
  let body;
  try { body = readFileSync(f, "utf8"); } catch { continue; }
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.new_sold != null) soldByPart.set(r.scored_part_id, r.new_sold);
      if (r.new_active != null) activeByPart.set(r.scored_part_id, r.new_active);
    } catch {}
  }
}

const affected = [];
for (const p of manifest) {
  if (!p.original_url) continue;
  if (!p.original_url.includes("LH_Sold=1")) continue;
  const fixed = fixActiveUrl(p.original_url);
  if (!fixed) continue;
  affected.push({
    scored_part_id: p.scored_part_id,
    scrape_id: p.scrape_id,
    original_url: fixed,
    sold_link: null, // do not re-scrape sold; we already have it
    make: p.make,
    model: p.model,
    part_name: p.part_name,
    year: p.year,
    // carried through so the rescraper can emit new_sold unchanged
    preserved_new_sold: soldByPart.get(p.scored_part_id) ?? null,
    previous_new_active: activeByPart.get(p.scored_part_id) ?? null,
  });
}

console.log(`Total in manifest: ${manifest.length.toLocaleString()}`);
console.log(`Affected (has LH_Sold=1 in active URL): ${affected.length.toLocaleString()}`);

// Shard 3 ways for fleet processing
const SHARDS = 3;
const shardSize = Math.ceil(affected.length / SHARDS);
for (let i = 0; i < SHARDS; i++) {
  const slice = affected.slice(i * shardSize, (i + 1) * shardSize);
  const path = resolve(OUT_DIR, `shard-${i + 1}.json`);
  writeFileSync(path, JSON.stringify(slice));
  console.log(`  shard-${i + 1}: ${slice.length.toLocaleString()} parts → ${path}`);
}

writeFileSync(resolve(OUT_DIR, "all.json"), JSON.stringify(affected));
console.log(`Wrote ${affected.length.toLocaleString()} affected entries`);
