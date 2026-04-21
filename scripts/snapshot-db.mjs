#!/usr/bin/env node
// One-shot DB snapshot for the overnight watchdog. Outputs CSV: deep_done,last5m,deep_queue,verify_queue,inflight
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(2); }

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 10_000 });

try {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes" WHERE deep_scraped = true) AS deep_done,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes" WHERE deep_scraped = true AND deep_scraped_at > now() - interval '5 minutes') AS last5m,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes" WHERE sold_confidence > 0.7 AND sell_through > 60 AND sold IS NOT NULL AND sold != '0' AND CAST(sold AS int) >= 10 AND (deep_scraped IS NULL OR deep_scraped = false) AND deep_scraped_at IS NULL AND sold_link IS NOT NULL AND sold_link != '') AS deep_queue,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes" WHERE sold_verified_at IS NULL AND sell_through > 60 AND sold IS NOT NULL AND sold != '0' AND CAST(sold AS int) >= 10) AS verify_queue,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes" WHERE deep_scraped_at IS NOT NULL AND (deep_scraped IS NULL OR deep_scraped = false) AND deep_scraped_at > now() - interval '5 minutes') AS inflight
  `);
  const row = r.rows[0];
  console.log(`${row.deep_done},${row.last5m},${row.deep_queue},${row.verify_queue},${row.inflight}`);
} catch (err) {
  console.error("snapshot failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
