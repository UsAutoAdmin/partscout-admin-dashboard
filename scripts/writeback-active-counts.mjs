#!/usr/bin/env node
/**
 * Write the corrected `new_active` / `new_sold` values from
 * data/part-review/auto-review-results.json back into
 * `9_Octoparse_Scrapes.active` / `.sold` so the database mirrors the
 * post-fix-active reality.
 *
 * Only updates rows whose current `active` differs from the corrected value
 * (so it's idempotent and minimal).
 *
 * Run:
 *   node scripts/writeback-active-counts.mjs               # dry run
 *   node scripts/writeback-active-counts.mjs --apply       # write
 */
import fs from "node:fs";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

const SRC = "data/part-review/auto-review-results.json";

async function main() {
  console.log(`[1/4] Loading ${SRC}...`);
  const data = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const parts = data.parts.filter(
    (p) =>
      p.scrape_id &&
      p.new_active != null &&
      p.new_sold != null &&
      !p.active_error &&
      !p.sold_error,
  );
  console.log(`  ${parts.length.toLocaleString()} parts have valid new counts`);

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  console.log("[2/4] Reading current DB values for those scrape_ids...");
  const ids = parts.map((p) => p.scrape_id);
  const { rows } = await client.query(
    `SELECT id, active, sold FROM "9_Octoparse_Scrapes" WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const dbMap = new Map(rows.map((r) => [r.id, r]));
  console.log(`  found ${rows.length.toLocaleString()} of ${ids.length.toLocaleString()} in DB`);

  const updates = [];
  let activeDiff = 0;
  let soldDiff = 0;
  let bothMatch = 0;
  for (const p of parts) {
    const cur = dbMap.get(p.scrape_id);
    if (!cur) continue;
    const newActive = Math.round(p.new_active);
    const newSold = Math.round(p.new_sold);
    const aDiff = cur.active !== newActive;
    const sDiff = cur.sold !== newSold;
    if (aDiff) activeDiff += 1;
    if (sDiff) soldDiff += 1;
    if (aDiff || sDiff) {
      updates.push({ id: p.scrape_id, active: newActive, sold: newSold });
    } else {
      bothMatch += 1;
    }
  }
  console.log(`  active mismatches : ${activeDiff.toLocaleString()}`);
  console.log(`  sold mismatches   : ${soldDiff.toLocaleString()}`);
  console.log(`  already match     : ${bothMatch.toLocaleString()}`);
  console.log(`  rows to update    : ${updates.length.toLocaleString()}`);

  if (!APPLY) {
    console.log("\nDRY RUN — no changes written. Re-run with --apply to commit.");
    if (updates.length > 0) {
      console.log("Sample updates (first 5):");
      for (const u of updates.slice(0, 5)) {
        const cur = dbMap.get(u.id);
        console.log(
          `  ${u.id}  active ${cur.active} -> ${u.active}   sold ${cur.sold} -> ${u.sold}`,
        );
      }
    }
    await client.end();
    return;
  }

  console.log("[3/4] Writing back in chunks of 500...");
  const t0 = Date.now();
  let written = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const valuesSql = chunk
      .map(
        (_, idx) =>
          `($${idx * 3 + 1}::uuid, $${idx * 3 + 2}::int, $${idx * 3 + 3}::int)`,
      )
      .join(",");
    const params = [];
    for (const u of chunk) {
      params.push(u.id, u.active, u.sold);
    }
    await client.query(
      `UPDATE "9_Octoparse_Scrapes" t
       SET active = v.active,
           sold   = v.sold,
           active_lastscraped = NOW()
       FROM (VALUES ${valuesSql}) AS v(id, active, sold)
       WHERE t.id = v.id`,
      params,
    );
    written += chunk.length;
    if (written % 2500 === 0 || written === updates.length) {
      console.log(`  ${written.toLocaleString()} / ${updates.length.toLocaleString()} written`);
    }
  }
  console.log(`  Done in ${Math.round((Date.now() - t0) / 1000)}s`);

  console.log("[4/4] Verifying random sample of 5...");
  const sample = updates.slice(0, 5);
  const { rows: post } = await client.query(
    `SELECT id, active, sold FROM "9_Octoparse_Scrapes" WHERE id = ANY($1::uuid[])`,
    [sample.map((s) => s.id)],
  );
  for (const r of post) {
    const want = sample.find((s) => s.id === r.id);
    const ok = r.active === want.active && r.sold === want.sold;
    console.log(
      `  ${r.id}  db active=${r.active} sold=${r.sold}  expected ${want.active}/${want.sold}  ${ok ? "OK" : "MISMATCH"}`,
    );
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
