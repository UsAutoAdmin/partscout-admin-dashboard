#!/usr/bin/env node
/**
 * Repair `9_Octoparse_Scrapes.original_url` rows whose value was incorrectly
 * populated with the sold-URL (contains `LH_Sold=1`). Strips `LH_Sold=1` and
 * `LH_Complete=1` so the column means what its name implies: the URL of the
 * ACTIVE listings page.
 *
 * Idempotent. Safe to re-run.
 *
 * Run:
 *   node scripts/repair-original-urls.mjs              # dry run (default)
 *   node scripts/repair-original-urls.mjs --apply       # actually write
 */
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

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

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  console.log("[1/4] Counting affected rows...");
  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM "9_Octoparse_Scrapes" WHERE original_url LIKE '%LH_Sold=1%'`,
  );
  const affectedTotal = countRows[0].n;
  console.log(`  ${affectedTotal.toLocaleString()} rows have LH_Sold=1 in original_url`);

  if (affectedTotal === 0) {
    console.log("Nothing to repair.");
    await client.end();
    return;
  }

  console.log("[2/4] Sampling 5 affected rows for sanity check...");
  const { rows: sample } = await client.query(
    `SELECT id, original_url, sold_link FROM "9_Octoparse_Scrapes"
     WHERE original_url LIKE '%LH_Sold=1%' LIMIT 5`,
  );
  for (const r of sample) {
    const fixed = fixActiveUrl(r.original_url);
    console.log(`  id=${r.id}`);
    console.log(`    before: ${r.original_url}`);
    console.log(`    after : ${fixed}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — no changes written. Re-run with --apply to commit.");
    await client.end();
    return;
  }

  console.log("[3/4] Applying repair in chunks of 5,000...");
  const t0 = Date.now();
  let totalUpdated = 0;
  let pass = 0;
  // Loop: pick 5k affected ids, update them by id, repeat until 0 left.
  // This keeps each transaction far under the 5-min statement timeout.
  while (true) {
    pass += 1;
    const { rows: ids } = await client.query(
      `SELECT id FROM "9_Octoparse_Scrapes"
       WHERE original_url LIKE '%LH_Sold=1%' OR original_url LIKE '%LH_Complete=1%'
       LIMIT 5000`,
    );
    if (ids.length === 0) break;
    const idArr = ids.map((r) => r.id);
    const chunkT = Date.now();
    const { rowCount } = await client.query(
      `UPDATE "9_Octoparse_Scrapes"
       SET original_url = regexp_replace(
                            regexp_replace(
                              regexp_replace(original_url, '[?&]LH_Sold=1', '', 'g'),
                              '[?&]LH_Complete=1', '', 'g'
                            ),
                            '\\?&', '?', 'g'
                          )
       WHERE id = ANY($1::uuid[])`,
      [idArr],
    );
    totalUpdated += rowCount;
    const remaining = affectedTotal - totalUpdated;
    console.log(
      `  pass ${pass}: updated ${rowCount} rows in ${Math.round((Date.now() - chunkT) / 1000)}s ` +
        `(total ${totalUpdated.toLocaleString()} / ~${affectedTotal.toLocaleString()}, ~${Math.max(0, remaining).toLocaleString()} left)`,
    );
  }
  console.log(`  Total: ${totalUpdated.toLocaleString()} rows in ${Math.round((Date.now() - t0) / 1000)}s`);

  console.log("[4/4] Verifying...");
  const { rows: post } = await client.query(
    `SELECT COUNT(*)::int AS n FROM "9_Octoparse_Scrapes" WHERE original_url LIKE '%LH_Sold=1%'`,
  );
  console.log(`  rows still containing LH_Sold=1: ${post[0].n.toLocaleString()}`);

  const { rows: verifySample } = await client.query(
    `SELECT id, original_url FROM "9_Octoparse_Scrapes"
     WHERE id = ANY($1::uuid[])`,
    [sample.map((r) => r.id)],
  );
  console.log("  Sample after repair:");
  for (const r of verifySample) {
    console.log(`    id=${r.id}\n      ${r.original_url}`);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
