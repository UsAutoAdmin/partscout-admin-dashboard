#!/usr/bin/env node
/**
 * Queue suspicious (sell_through > 500%) parts for an active-listings rescrape.
 *
 * The active-rescrape worker on the fleet pulls rows from 9_Octoparse_Scrapes
 * ordered by `active_lastscraped ASC NULLS FIRST`. Setting that timestamp to
 * NULL on a row jumps it to the front of the queue, so within minutes the
 * fleet refreshes its `active` count and `sell_through` is recomputed
 * downstream.
 *
 * We map the suspicious scored_parts back to their source rows via scrape_id,
 * then null out active_lastscraped in batches.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SUSPICIOUS_FILE = resolve(ROOT, "data/part-review/suspicious-parts.json");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

const BATCH = 500;

async function main() {
  const suspicious = JSON.parse(readFileSync(SUSPICIOUS_FILE, "utf8"));
  const scrapeIds = [...new Set(suspicious.map(p => p.scrape_id).filter(Boolean))];
  console.log(`[1/3] Loaded ${suspicious.length.toLocaleString()} suspicious parts → ${scrapeIds.length.toLocaleString()} unique scrape_ids`);

  if (scrapeIds.length === 0) {
    console.log("Nothing to queue. Exiting.");
    return;
  }

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  // Verify the rows exist + show pre-update state
  const sampleRes = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE active_lastscraped IS NULL) AS already_queued,
      MIN(active_lastscraped) AS oldest,
      MAX(active_lastscraped) AS newest
    FROM "9_Octoparse_Scrapes"
    WHERE id = ANY($1::uuid[])
  `, [scrapeIds]);
  console.log(`[2/3] DB state for those scrape_ids:`, sampleRes.rows[0]);

  // Null out active_lastscraped in batches so the fleet picks them up first
  let updated = 0;
  for (let i = 0; i < scrapeIds.length; i += BATCH) {
    const slice = scrapeIds.slice(i, i + BATCH);
    const r = await client.query(`
      UPDATE "9_Octoparse_Scrapes"
      SET active_lastscraped = NULL
      WHERE id = ANY($1::uuid[])
        AND active_lastscraped IS NOT NULL
    `, [slice]);
    updated += r.rowCount;
    process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: updated ${r.rowCount} (total ${updated})\r`);
  }
  console.log(`\n[3/3] Queued ${updated.toLocaleString()} rows for active rescrape (active_lastscraped → NULL)`);
  console.log(`\nThe active-rescrape worker on the fleet pulls oldest-first, so these will be processed within the next ~${Math.ceil(updated / 250)} minutes (assuming ~250 active-rescrapes/min combined fleet throughput).`);

  await client.end();
}

main().catch(e => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
