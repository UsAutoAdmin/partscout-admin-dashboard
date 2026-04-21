#!/usr/bin/env node
/**
 * Build a sharded input manifest for re-scraping the active counts of every
 * 9_Octoparse_Scrapes row whose original_url was repaired by
 * scripts/repair-original-urls.mjs (fingerprint: LH_ItemCondition=3000),
 * EXCLUDING the 21,495 ready-to-ship rows whose values were already corrected
 * by fix-active.ts + writeback-active-counts.mjs.
 *
 * Workload split (local mini lighter):
 *   local : 20%  → /Users/chaseeriksson/Downloads/Seed Database/fix-affected-input.json
 *   mini2 : 40%  → ~/Seed-Database/fix-affected-input.json on 100.100.6.101
 *   mini3 : 40%  → ~/Seed-Database/fix-affected-input.json on 100.68.192.57
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_DIR = path.resolve(ROOT, "data/fix-affected");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  console.log("[1/5] Loading already-corrected scrape_ids from auto-review-results.json...");
  const reviewed = JSON.parse(
    fs.readFileSync(path.resolve(ROOT, "data/part-review/auto-review-results.json"), "utf8"),
  );
  const exclude = new Set(reviewed.parts.map((p) => p.scrape_id).filter(Boolean));
  console.log(`  excluding ${exclude.size.toLocaleString()} already-corrected scrape_ids`);

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  console.log("[2/5] Pulling repaired rows from 9_Octoparse_Scrapes...");
  const t0 = Date.now();
  const { rows } = await client.query(
    `SELECT id, original_url, active, sold, active_lastscraped
     FROM "9_Octoparse_Scrapes"
     WHERE original_url LIKE '%LH_ItemCondition=3000%'
       AND original_url IS NOT NULL`,
  );
  console.log(`  pulled ${rows.length.toLocaleString()} candidates in ${Math.round((Date.now() - t0) / 1000)}s`);
  await client.end();

  const queue = rows
    .filter((r) => !exclude.has(r.id) && r.original_url && r.original_url.startsWith("http"))
    .map((r) => ({
      scored_part_id: r.id,        // fix-active.ts uses this for dedup; scrape_id is unique
      scrape_id: r.id,
      original_url: r.original_url,
      preserved_new_sold: null,    // we are NOT preserving sold; only fetching new_active
      previous_active: r.active != null ? Number(r.active) : null,
      previous_sold: r.sold != null ? Number(r.sold) : null,
      previous_scraped: r.active_lastscraped,
    }));
  console.log(`[3/5] After excluding ready-to-ship: ${queue.length.toLocaleString()} to rescrape`);

  // 20 / 40 / 40 split
  console.log("[4/5] Sharding 20% local / 40% mini2 / 40% mini3...");
  const total = queue.length;
  const localCount = Math.round(total * 0.20);
  const mini2Count = Math.round(total * 0.40);
  const shardLocal = queue.slice(0, localCount);
  const shardMini2 = queue.slice(localCount, localCount + mini2Count);
  const shardMini3 = queue.slice(localCount + mini2Count);

  for (const [name, s] of [
    ["shard-local", shardLocal],
    ["shard-mini2", shardMini2],
    ["shard-mini3", shardMini3],
  ]) {
    const p = path.resolve(OUT_DIR, `${name}.json`);
    fs.writeFileSync(p, JSON.stringify(s));
    console.log(`  ${name}: ${s.length.toLocaleString()} parts → ${p}`);
  }
  fs.writeFileSync(path.resolve(OUT_DIR, "all.json"), JSON.stringify(queue));

  console.log("[5/5] Done.");
  console.log(`Total: ${queue.length.toLocaleString()} parts.`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
