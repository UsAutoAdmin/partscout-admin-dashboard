/**
 * Rescrape a chunk of parts — designed to run on any mini.
 * Usage: node rescrape-chunk.mjs <chunk-file> <output-file>
 */
import { chromium } from "playwright";
import fs from "fs";

const CHUNK_FILE = process.argv[2];
const OUTPUT_FILE = process.argv[3] || CHUNK_FILE.replace(".json", "-results.json");
const CONCURRENCY = 10;
const ST_CHANGE_THRESHOLD = 50;
const SAVE_INTERVAL = 50;

if (!CHUNK_FILE) {
  console.error("Usage: node rescrape-chunk.mjs <chunk-file> [output-file]");
  process.exit(1);
}

function buildActiveUrl(ebayUrl) {
  if (!ebayUrl) return null;
  return ebayUrl.replace(/&LH_Sold=1/g, "").replace(/&LH_Complete=1/g, "");
}

function buildSoldUrl(ebayUrl) {
  if (!ebayUrl) return null;
  let url = ebayUrl;
  if (!url.includes("LH_Sold=1")) url += "&LH_Sold=1";
  if (!url.includes("LH_Complete=1")) url += "&LH_Complete=1";
  return url;
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
  const queue = JSON.parse(fs.readFileSync(CHUNK_FILE, "utf8"));
  const pending = queue.filter((q) => q.status === "pending");
  console.log(`Chunk: ${queue.length} total, ${pending.length} pending\n`);

  if (pending.length === 0) {
    console.log("Nothing to scrape.");
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2));
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // 2 tabs per concurrent slot: one for active, one for sold
  const activePages = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => context.newPage())
  );
  const soldPages = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => context.newPage())
  );

  let processed = 0;
  let kept = 0;
  let removedCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (item, j) => {
        const activeUrl = buildActiveUrl(item.ebay_url);
        const soldUrl = buildSoldUrl(item.ebay_url);

        // Scrape active and sold in parallel on separate tabs
        const [activeCount, soldCount] = await Promise.all([
          activeUrl ? scrapeCount(activePages[j], activeUrl) : Promise.resolve(null),
          soldUrl ? scrapeCount(soldPages[j], soldUrl) : Promise.resolve(null),
        ]);

        return { item, activeCount, soldCount };
      })
    );

    for (const { item, activeCount, soldCount } of results) {
      const idx = queue.findIndex((q) => q.scored_part_id === item.scored_part_id);
      if (idx === -1) continue;

      const label = `${item.year} ${item.make} ${item.model} ${item.part_name}`;

      if (activeCount === null && soldCount === null) {
        queue[idx].status = "scraped";
        queue[idx].scraped_at = new Date().toISOString();
        queue[idx].new_active_count = 0;
        queue[idx].new_sold_count = 0;
        queue[idx].new_sell_through = 0;
        queue[idx].st_change_pct = -100;
        queue[idx].removed = true;
        queue[idx].remove_reason = "Scrape failed";
        removedCount++;
        processed++;
        continue;
      }

      const ac = activeCount ?? 0;
      const sc = soldCount ?? 0;
      const newST = ac > 0 ? Math.round((sc / ac) * 100 * 100) / 100 : sc > 0 ? 999 : 0;
      const origST = item.original_sell_through;
      const stChange = origST > 0 ? Math.round(((newST - origST) / origST) * 100 * 10) / 10 : newST > 0 ? 100 : 0;

      queue[idx].status = "scraped";
      queue[idx].scraped_at = new Date().toISOString();
      queue[idx].new_active_count = ac;
      queue[idx].new_sold_count = sc;
      queue[idx].new_sell_through = newST;
      queue[idx].st_change_pct = stChange;

      if (Math.abs(stChange) > ST_CHANGE_THRESHOLD) {
        queue[idx].removed = true;
        queue[idx].remove_reason = `ST changed ${stChange > 0 ? "+" : ""}${Math.round(stChange)}% (${Math.round(origST)}% → ${Math.round(newST)}%)`;
        removedCount++;
      } else {
        kept++;
      }
      processed++;
    }

    // Log progress every batch
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(processed / elapsed * 60);
    console.log(`  [${processed}/${pending.length}] ${kept} kept, ${removedCount} removed — ${rate}/min`);

    if (processed % SAVE_INTERVAL < CONCURRENCY) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2));
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(queue, null, 2));
  await browser.close();

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== Done in ${totalTime}s ===`);
  console.log(`Processed: ${processed}, Kept: ${kept}, Removed: ${removedCount}`);
  console.log(`Rate: ${Math.round(processed / totalTime * 60)}/min`);
  console.log(`Results: ${OUTPUT_FILE}`);
}

main().catch(console.error);
