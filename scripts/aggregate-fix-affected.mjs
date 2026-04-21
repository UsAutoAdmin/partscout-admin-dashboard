#!/usr/bin/env node
/**
 * Pull `fix-affected-output.jsonl` from local + mini2 + mini3, merge by
 * scrape_id (latest scraped_at wins), and optionally write the corrected
 * `active` count back into `9_Octoparse_Scrapes`.
 *
 * Usage:
 *   node scripts/aggregate-fix-affected.mjs            # just pull + summarize
 *   node scripts/aggregate-fix-affected.mjs --apply    # also writeback to DB
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:Partscoutbotsuperior%21@db.wykhqhclzyygkslpbgmh.supabase.co:5432/postgres";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PULLED_DIR = path.resolve(ROOT, "data/fix-affected/pulled");
fs.mkdirSync(PULLED_DIR, { recursive: true });

const NODES = [
  { name: "local", host: null,            local_path: "/Users/chaseeriksson/Downloads/Seed Database/fix-affected-output.jsonl" },
  { name: "mini2", host: "100.100.6.101", remote_path: "~/Seed-Database/fix-affected-output.jsonl" },
  { name: "mini3", host: "100.68.192.57", remote_path: "~/Seed-Database/fix-affected-output.jsonl" },
];

function pull() {
  console.log("[1/4] Pulling JSONL from each node...");
  for (const n of NODES) {
    const dest = path.resolve(PULLED_DIR, `${n.name}.jsonl`);
    try {
      if (n.host) {
        execSync(`scp -q chaseeriksson@${n.host}:${n.remote_path} "${dest}"`, { stdio: "pipe" });
      } else {
        execSync(`cp "${n.local_path}" "${dest}"`, { stdio: "pipe" });
      }
      const count = fs.readFileSync(dest, "utf8").split("\n").filter((l) => l.trim()).length;
      console.log(`  ${n.name}: ${count.toLocaleString()} lines`);
    } catch (e) {
      console.log(`  ${n.name}: NO DATA YET (${e.message.split("\n")[0]})`);
      fs.writeFileSync(dest, "");
    }
  }
}

function readMerged() {
  const byId = new Map();
  let totalLines = 0;
  let parseErrors = 0;
  for (const n of NODES) {
    const f = path.resolve(PULLED_DIR, `${n.name}.jsonl`);
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      totalLines += 1;
      try {
        const r = JSON.parse(line);
        const id = r.scrape_id || r.scored_part_id;
        if (!id) continue;
        const prev = byId.get(id);
        if (!prev || (r.scraped_at && (!prev.scraped_at || r.scraped_at > prev.scraped_at))) {
          byId.set(id, { ...r, _source: n.name });
        }
      } catch {
        parseErrors += 1;
      }
    }
  }
  return { byId, totalLines, parseErrors };
}

async function main() {
  pull();

  console.log("[2/4] Merging by scrape_id...");
  const { byId, totalLines, parseErrors } = readMerged();
  console.log(`  total JSONL lines : ${totalLines.toLocaleString()}`);
  console.log(`  unique scrape_ids : ${byId.size.toLocaleString()}`);
  console.log(`  parse errors      : ${parseErrors.toLocaleString()}`);

  const succeeded = [];
  const failed = [];
  for (const r of byId.values()) {
    if (r.new_active != null && r.new_active >= 0) succeeded.push(r);
    else failed.push(r);
  }
  console.log(`  with new_active   : ${succeeded.length.toLocaleString()}`);
  console.log(`  errored           : ${failed.length.toLocaleString()}`);

  if (succeeded.length === 0) {
    console.log("Nothing to write yet.");
    return;
  }

  // Pull current values to compute delta + skip no-ops
  console.log("[3/4] Comparing against current DB values...");
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  await client.query("SET statement_timeout = '5min'");

  const ids = succeeded.map((r) => r.scrape_id || r.scored_part_id);
  const dbMap = new Map();
  for (let i = 0; i < ids.length; i += 5000) {
    const slice = ids.slice(i, i + 5000);
    const { rows } = await client.query(
      `SELECT id, active FROM "9_Octoparse_Scrapes" WHERE id = ANY($1::uuid[])`,
      [slice],
    );
    for (const r of rows) dbMap.set(r.id, Number(r.active));
  }

  let same = 0, deltaUp = 0, deltaDown = 0, missing = 0;
  const updates = [];
  for (const r of succeeded) {
    const id = r.scrape_id || r.scored_part_id;
    const cur = dbMap.get(id);
    const next = Math.round(r.new_active);
    if (cur == null) { missing += 1; continue; }
    if (cur === next) { same += 1; continue; }
    if (next > cur) deltaUp += 1; else deltaDown += 1;
    updates.push({ id, active: next });
  }
  console.log(`  same        : ${same.toLocaleString()}`);
  console.log(`  delta up    : ${deltaUp.toLocaleString()}`);
  console.log(`  delta down  : ${deltaDown.toLocaleString()}`);
  console.log(`  missing     : ${missing.toLocaleString()}`);
  console.log(`  to write    : ${updates.length.toLocaleString()}`);

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to commit.");
    if (updates.length > 0) {
      console.log("Sample updates:");
      for (const u of updates.slice(0, 5)) {
        console.log(`  ${u.id}: ${dbMap.get(u.id)} -> ${u.active}`);
      }
    }
    await client.end();
    return;
  }

  console.log("[4/4] Writing back in chunks of 500...");
  const t0 = Date.now();
  let written = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const valuesSql = chunk
      .map((_, idx) => `($${idx * 2 + 1}::uuid, $${idx * 2 + 2}::int)`)
      .join(",");
    const params = [];
    for (const u of chunk) {
      params.push(u.id, u.active);
    }
    await client.query(
      `UPDATE "9_Octoparse_Scrapes" t
       SET active = v.active, active_lastscraped = NOW()
       FROM (VALUES ${valuesSql}) AS v(id, active)
       WHERE t.id = v.id`,
      params,
    );
    written += chunk.length;
    if (written % 5000 === 0 || written === updates.length) {
      console.log(`  ${written.toLocaleString()} / ${updates.length.toLocaleString()}`);
    }
  }
  console.log(`  Done in ${Math.round((Date.now() - t0) / 1000)}s`);

  await client.end();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
