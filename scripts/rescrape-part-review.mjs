/**
 * Rescrape active and sold counts for parts in the review queue.
 * No LLM filtering — just raw eBay result counts.
 * Removes parts where sell-through changed dramatically (>50% relative change).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const QUEUE_FILE = path.join(process.cwd(), "data", "part-review", "queue.json");
const CONCURRENCY = 4;
const ST_CHANGE_THRESHOLD = 50; // remove if sell-through changed by more than 50% relative
const SAVE_INTERVAL = 25;

function readQueue() {
  return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(1500);

    const count = await page.evaluate(() => {
      const el = document.querySelector(".srp-controls__count-heading");
      if (el) {
        const text = el.textContent || "";
        const match = text.replace(/,/g, "").match(/([\d,]+)\s*(results?|items?)/i);
        if (match) return parseInt(match[1].replace(/,/g, ""), 10);
        const numMatch = text.replace(/,/g, "").match(/(\d+)/);
        if (numMatch) return parseInt(numMatch[1], 10);
      }
      const heading = document.querySelector("h1.srp-controls__count-heading, h2.srp-controls__count-heading");
      if (heading) {
        const m = (heading.textContent || "").replace(/,/g, "").match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
      const any = document.querySelector("[class*='count']");
      if (any) {
        const m = (any.textContent || "").replace(/,/g, "").match(/([\d]+)\+?\s*results/i);
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
  const queue = readQueue();
  const pending = queue.filter((q) => q.status === "pending");
  console.log(`Queue: ${queue.length} total, ${pending.length} pending\n`);

  if (pending.length === 0) {
    console.log("Nothing to scrape.");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const pages = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => context.newPage())
  );

  let processed = 0;
  let kept = 0;
  let removedCount = 0;
  let errors = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (item, j) => {
        const pg = pages[j % CONCURRENCY];

        const activeUrl = buildActiveUrl(item.ebay_url);
        const soldUrl = buildSoldUrl(item.ebay_url);

        const activeCount = activeUrl ? await scrapeCount(pg, activeUrl) : null;

        await pg.waitForTimeout(500);

        const soldCount = soldUrl ? await scrapeCount(pg, soldUrl) : null;

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
        queue[idx].remove_reason = "Scrape failed — no data";
        errors++;
        removedCount++;
        console.log(`  [${processed + 1}/${pending.length}] ✗ ${label} — scrape failed`);
        processed++;
        continue;
      }

      const ac = activeCount ?? 0;
      const sc = soldCount ?? 0;
      const newST = ac > 0 ? Math.round((sc / ac) * 100 * 100) / 100 : sc > 0 ? 999 : 0;
      const origST = item.original_sell_through;
      const stChange =
        origST > 0
          ? Math.round(((newST - origST) / origST) * 100 * 10) / 10
          : newST > 0
          ? 100
          : 0;

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
        console.log(`  [${processed + 1}/${pending.length}] ✗ ${label} — ST ${Math.round(origST)}% → ${Math.round(newST)}% (${stChange > 0 ? "+" : ""}${Math.round(stChange)}% change, removed)`);
      } else {
        kept++;
        console.log(`  [${processed + 1}/${pending.length}] ✓ ${label} — ST ${Math.round(origST)}% → ${Math.round(newST)}% (${stChange > 0 ? "+" : ""}${Math.round(stChange)}%) A:${ac} S:${sc}`);
      }

      processed++;
    }

    if (processed % SAVE_INTERVAL < CONCURRENCY) {
      saveQueue(queue);
    }

    if (i + CONCURRENCY < pending.length) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  saveQueue(queue);
  await browser.close();

  console.log(`\n=== Done ===`);
  console.log(`Processed: ${processed}`);
  console.log(`Kept: ${kept}`);
  console.log(`Removed: ${removedCount} (${errors} scrape failures)`);
  console.log(`Results saved to ${QUEUE_FILE}`);
}

main().catch(console.error);
