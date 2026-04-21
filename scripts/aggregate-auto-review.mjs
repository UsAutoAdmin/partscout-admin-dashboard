#!/usr/bin/env node
/**
 * Pull rescrape results from each fleet node, merge by scored_part_id, recompute
 * composite/tier with the new sell_through, classify drift, and write the final
 * dashboard payload to data/part-review/auto-review-results.json.
 *
 * Safe to run while the rescrape is still in progress — partial output is
 * supported (entries with no rescrape yet are reported as "pending").
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_DIR = resolve(ROOT, "data/part-review");
const PULLED_DIR = resolve(DATA_DIR, "auto-review-pulled");
mkdirSync(PULLED_DIR, { recursive: true });

const MINIS = [
  { name: "local", host: null,            local_path: "/Users/chaseeriksson/Downloads/Seed Database/auto-review-output.jsonl" },
  { name: "mini2", host: "100.100.6.101", remote_path: "~/Seed-Database/auto-review-output.jsonl" },
  { name: "mini3", host: "100.68.192.57", remote_path: "~/Seed-Database/auto-review-output.jsonl" },
  // Targeted fix for parts whose `original_url` was incorrectly populated with
  // LH_Sold=1 — these entries carry `fixed_url: true` and a corrected new_active.
  // They land in the same JSONL stream and the latest-by-scraped_at logic below
  // ensures they win over the original (buggy) auto-review entry.
  { name: "fix-local", host: null,            local_path: "/Users/chaseeriksson/Downloads/Seed Database/fix-active-output.jsonl" },
  { name: "fix-mini2", host: "100.100.6.101", remote_path: "~/Seed-Database/fix-active-output.jsonl" },
  { name: "fix-mini3", host: "100.68.192.57", remote_path: "~/Seed-Database/fix-active-output.jsonl" },
];

// Composite scoring constants (must match src/scoring.ts exactly).
const W_PROFIT_RATIO = 0.30;
const W_SELL_THROUGH = 0.25;
const W_SOLD_VOLUME = 0.15;
const W_CONFIDENCE = 0.15;
const W_PRICE_CONSISTENCY = 0.15;
const MAX_PROFIT_RATIO = 15;
const MAX_SELL_THROUGH = 300;
const MAX_SOLD_VOLUME = 50;
const SELL_THROUGH_CAP = 500;

const norm = (v, max) => Math.min(1, Math.max(0, (v ?? 0) / max));
const tierOf = (s) => (s >= 0.7 ? "T1" : s >= 0.5 ? "T2" : s >= 0.3 ? "T3" : "below");

function pullShards() {
  console.log("[1/4] Pulling result files from each node...");
  for (const m of MINIS) {
    const dest = resolve(PULLED_DIR, `${m.name}.jsonl`);
    try {
      if (m.host) {
        execSync(`scp -q chaseeriksson@${m.host}:${m.remote_path} "${dest}"`, { stdio: "pipe" });
      } else {
        execSync(`cp "${m.local_path}" "${dest}"`, { stdio: "pipe" });
      }
      const sz = readFileSync(dest, "utf8").split("\n").filter((l) => l.trim()).length;
      console.log(`  ${m.name}: ${sz.toLocaleString()} entries`);
    } catch (e) {
      console.log(`  ${m.name}: NO DATA YET (${e.message.split("\n")[0]})`);
      writeFileSync(dest, "");
    }
  }
}

function readResults() {
  const byId = new Map();
  for (const m of MINIS) {
    const f = resolve(PULLED_DIR, `${m.name}.jsonl`);
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        // keep latest by scraped_at
        const prev = byId.get(r.scored_part_id);
        if (!prev || (r.scraped_at && r.scraped_at > prev.scraped_at)) {
          byId.set(r.scored_part_id, { ...r, _source: m.name });
        }
      } catch { /* ignore corrupt line */ }
    }
  }
  return byId;
}

function classify(baselineTier, newTier, hasData, suspicious) {
  if (!hasData) return "pending";
  if (suspicious) return "suspicious";
  const order = { below: 0, T3: 1, T2: 2, T1: 3 };
  const a = order[baselineTier] ?? 0;
  const b = order[newTier] ?? 0;
  if (newTier === "below") return "dropped";
  if (b > a) return "improved";
  if (b < a) return "degraded";
  return "unchanged";
}

function main() {
  pullShards();

  console.log("[2/4] Loading manifest + results...");
  const manifest = JSON.parse(readFileSync(resolve(DATA_DIR, "auto-review-input.json"), "utf8"));
  const results = readResults();
  console.log(`  manifest: ${manifest.length.toLocaleString()} | rescraped so far: ${results.size.toLocaleString()}`);

  console.log("[3/4] Recomputing composite + classifying drift...");
  const enriched = manifest.map((p) => {
    const r = results.get(p.scored_part_id);
    if (!r) {
      return {
        scored_part_id: p.scored_part_id,
        scrape_id: p.scrape_id,
        baseline_active: p.baseline_active,
        baseline_sold: p.baseline_sold,
        baseline_sell_through: p.baseline_sell_through,
        baseline_composite: p.baseline_composite,
        baseline_tier: p.baseline_tier,
        new_active: null,
        new_sold: null,
        new_sell_through: null,
        new_composite: null,
        new_tier: null,
        classification: "pending",
        scraped_at: null,
      };
    }

    const newSt =
      r.new_active != null && r.new_active > 0 && r.new_sold != null
        ? Math.min(SELL_THROUGH_CAP, (r.new_sold / r.new_active) * 100)
        : r.new_active === 0 && r.new_sold != null && r.new_sold > 0
          ? SELL_THROUGH_CAP
          : null;
    const stRaw =
      r.new_active != null && r.new_active > 0 && r.new_sold != null
        ? (r.new_sold / r.new_active) * 100
        : null;
    const suspicious = stRaw != null && stRaw > SELL_THROUGH_CAP;

    let newComposite = null;
    let newTier = null;
    if (newSt != null) {
      newComposite =
        norm(p.profit_ratio ?? 0, MAX_PROFIT_RATIO) * W_PROFIT_RATIO +
        norm(newSt, MAX_SELL_THROUGH) * W_SELL_THROUGH +
        // sold_volume comes from variation clustering on the original scrape, not from
        // the page-level page count. We hold it constant by re-deriving from the baseline
        // composite — this isolates the sell_through delta as the cause of any drift.
        norm(p.baseline_sold ?? 0, MAX_SOLD_VOLUME) * W_SOLD_VOLUME +
        norm(p.sold_confidence ?? 0, 1) * W_CONFIDENCE +
        (p.price_consistency ?? 0) * W_PRICE_CONSISTENCY;
      newComposite = Math.round(newComposite * 10000) / 10000;
      newTier = tierOf(newComposite);
    }

    return {
      scored_part_id: p.scored_part_id,
      scrape_id: p.scrape_id,
      baseline_active: p.baseline_active,
      baseline_sold: p.baseline_sold,
      baseline_sell_through: p.baseline_sell_through,
      baseline_composite: p.baseline_composite,
      baseline_tier: p.baseline_tier,
      new_active: r.new_active,
      new_sold: r.new_sold,
      new_sell_through_raw: stRaw,
      new_sell_through: newSt,
      new_composite: newComposite,
      new_tier: newTier,
      classification: classify(p.baseline_tier, newTier, newSt != null, suspicious),
      active_error: r.active_error ?? null,
      sold_error: r.sold_error ?? null,
      scraped_at: r.scraped_at,
    };
  });

  const counts = enriched.reduce((acc, e) => {
    acc[e.classification] = (acc[e.classification] ?? 0) + 1;
    return acc;
  }, {});

  // Tier movement matrix (baseline → new) — only counts rescraped rows
  const matrix = {};
  for (const e of enriched) {
    if (!e.new_tier) continue;
    const k = `${e.baseline_tier}->${e.new_tier}`;
    matrix[k] = (matrix[k] ?? 0) + 1;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalParts: manifest.length,
    rescraped: enriched.filter((e) => e.classification !== "pending").length,
    pending: counts.pending ?? 0,
    classifications: counts,
    tierMatrix: matrix,
    sellThroughCap: SELL_THROUGH_CAP,
  };

  console.log("[4/4] Writing output...");
  writeFileSync(resolve(DATA_DIR, "auto-review-results.json"), JSON.stringify({ summary, parts: enriched }));
  console.log(`  wrote auto-review-results.json (${enriched.length.toLocaleString()} entries)`);
  console.log("\nSummary:");
  console.log(`  Rescraped : ${summary.rescraped.toLocaleString()} / ${summary.totalParts.toLocaleString()} ` +
    `(${((summary.rescraped / summary.totalParts) * 100).toFixed(1)}%)`);
  for (const [k, v] of Object.entries(counts)) {
    console.log(`    ${k.padEnd(12)} ${v.toLocaleString()}`);
  }
  console.log("  Tier movement (baseline → new):");
  for (const [k, v] of Object.entries(matrix).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(20)} ${v.toLocaleString()}`);
  }
}

main();
