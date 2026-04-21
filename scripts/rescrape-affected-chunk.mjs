/**
 * Rescrape active/sold counts for URL-affected scrapes.
 * 10 workers across 3 browsers — mirrors the original scraper architecture.
 * Usage: node rescrape-affected-chunk.mjs <chunk-file>
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const CHUNK_FILE = process.argv[2];
const NUM_BROWSERS = 3;
const CONCURRENCY = 10;
const SAVE_INTERVAL = 500;

if (!CHUNK_FILE) {
  console.error("Usage: node rescrape-affected-chunk.mjs <chunk-file>");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildActiveUrl(url) {
  if (!url) return null;
  return url.replace(/&LH_Sold=1/g, "").replace(/&LH_Complete=1/g, "");
}

function buildSoldUrl(url) {
  if (!url) return null;
  let u = url;
  if (!u.includes("LH_Sold=1")) u += "&LH_Sold=1";
  if (!u.includes("LH_Complete=1")) u += "&LH_Complete=1";
  return u;
}

async function scrapeCount(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(400);
    const count = await page.evaluate(() => {
      const el = document.querySelector(".srp-controls__count-heading");
      if (el) {
        const text = el.textContent || "";
        const m = text.replace(/,/g, "").match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
      return 0;
    });
    return count;
  } catch {
    return null;
  }
}

async function main() {
  const chunk = JSON.parse(fs.readFileSync(CHUNK_FILE, "utf8"));

  const idToIdx = new Map();
  for (let i = 0; i < chunk.length; i++) idToIdx.set(chunk[i].id, i);

  const pending = chunk.filter((r) => !r.done);
  console.log(`Chunk: ${chunk.length} total, ${pending.length} pending\n`);

  if (pending.length === 0) {
    console.log("Nothing to scrape.");
    return;
  }

  // Launch 3 browsers, distribute 10 workers across them
  const workersPerBrowser = [];
  for (let i = 0; i < NUM_BROWSERS; i++) {
    workersPerBrowser.push(
      i < CONCURRENCY % NUM_BROWSERS
        ? Math.ceil(CONCURRENCY / NUM_BROWSERS)
        : Math.floor(CONCURRENCY / NUM_BROWSERS)
    );
  }

  console.log(`Launching ${NUM_BROWSERS} browsers: ${workersPerBrowser.join("+")} workers = ${CONCURRENCY} total\n`);

  const browsers = await Promise.all(
    Array.from({ length: NUM_BROWSERS }, () => chromium.launch({ headless: true }))
  );

  const allActivePages = [];
  const allSoldPages = [];

  for (let b = 0; b < NUM_BROWSERS; b++) {
    const ctx = await browsers[b].newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const n = workersPerBrowser[b];
    const ap = await Promise.all(Array.from({ length: n }, () => ctx.newPage()));
    const sp = await Promise.all(Array.from({ length: n }, () => ctx.newPage()));
    allActivePages.push(...ap);
    allSoldPages.push(...sp);
  }

  let processed = 0;
  let updated = 0;
  let failed = 0;
  const startTime = Date.now();
  let lastSave = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (item, j) => {
        const aUrl = buildActiveUrl(item.active_url);
        const sUrl = buildSoldUrl(item.sold_url || item.active_url);

        const [activeCount, soldCount] = await Promise.all([
          aUrl ? scrapeCount(allActivePages[j], aUrl) : Promise.resolve(null),
          sUrl ? scrapeCount(allSoldPages[j], sUrl) : Promise.resolve(null),
        ]);

        return { item, activeCount, soldCount };
      })
    );

    const dbUpdates = [];
    for (const { item, activeCount, soldCount } of results) {
      const idx = idToIdx.get(item.id);
      if (idx === undefined) continue;

      chunk[idx].done = true;
      processed++;

      if (activeCount === null && soldCount === null) {
        chunk[idx].error = true;
        failed++;
        continue;
      }

      const ac = activeCount ?? 0;
      const sc = soldCount ?? 0;
      chunk[idx].new_active = ac;
      chunk[idx].new_sold = sc;

      const payload = { active_count: ac, sold: sc };
      if (item.active_url) payload.original_url = item.active_url;
      if (item.sold_url) payload.sold_link = item.sold_url;

      dbUpdates.push(
        sb.from("9_Octoparse_Scrapes").update(payload).eq("id", item.id)
      );
      updated++;
    }

    if (dbUpdates.length > 0) {
      await Promise.all(dbUpdates);
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round((processed / elapsed) * 60);
    process.stdout.write(
      `  [${processed}/${pending.length}] updated=${updated} failed=${failed} — ${rate}/min\r`
    );

    if (processed - lastSave >= SAVE_INTERVAL) {
      lastSave = processed;
      fs.writeFileSync(CHUNK_FILE, JSON.stringify(chunk));
    }
  }

  fs.writeFileSync(CHUNK_FILE, JSON.stringify(chunk));
  await Promise.all(browsers.map((b) => b.close()));

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n=== Done in ${totalTime}s ===`);
  console.log(`Processed: ${processed}, Updated: ${updated}, Failed: ${failed}`);
  console.log(`Rate: ${Math.round((processed / totalTime) * 60)}/min`);
}

main().catch(console.error);
