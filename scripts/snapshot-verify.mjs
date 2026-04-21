#!/usr/bin/env node
// Phase 4 verify snapshot. Outputs: completed_5min,inflight,broad_pool_remaining
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(2); }

const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2, connectionTimeoutMillis: 10_000 });

try {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes"
        WHERE sold_verified_at > now() - interval '5 minutes'
          AND sold_confidence IS NOT NULL)                         AS completed_5min,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes"
        WHERE sold_verified_at IS NOT NULL AND sold_confidence IS NULL
          AND sold_verified_at > now() - interval '15 minutes')    AS inflight,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes"
        WHERE sold_confidence IS NULL
          AND (sold_verified_at IS NULL OR sold_verified_at < now() - interval '15 minutes')
          AND sold IS NOT NULL AND sold != '0'
          AND sold_link IS NOT NULL AND sold_link != '')           AS broad_remaining,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes"
        WHERE sold_confidence IS NOT NULL)                         AS verified_total,
      (SELECT COUNT(*) FROM "9_Octoparse_Scrapes"
        WHERE sold_confidence > 0.7
          AND sell_through > 60
          AND sold IS NOT NULL AND sold != '0'
          AND CAST(sold AS int) >= 10
          AND (deep_scraped IS NULL OR deep_scraped = false)
          AND deep_scraped_at IS NULL
          AND sold_link IS NOT NULL AND sold_link != '')           AS deep_eligible_promoted
  `);
  const row = r.rows[0];
  console.log(`${row.completed_5min},${row.inflight},${row.broad_remaining},${row.verified_total},${row.deep_eligible_promoted}`);
} catch (err) {
  console.error("snapshot failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
