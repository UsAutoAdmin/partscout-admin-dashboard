/**
 * Single worker: 1 browser, TABS active pages + TABS sold pages.
 * Reads items from stdin (JSON array), outputs progress to stderr, results to stdout.
 * Usage: echo '[...]' | node rescrape-worker.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const TABS = 10;

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
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    return await page.evaluate(() => {
      const el = document.querySelector(".srp-controls__count-heading");
      if (el) {
        const m = (el.textContent || "").replace(/,/g, "").match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
      return 0;
    });
  } catch {
    return null;
  }
}

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

const items = JSON.parse(input);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

const activePages = await Promise.all(Array.from({ length: TABS }, () => ctx.newPage()));
const soldPages = await Promise.all(Array.from({ length: TABS }, () => ctx.newPage()));

let processed = 0;
let updated = 0;
let failed = 0;
const results = [];
const start = Date.now();

for (let i = 0; i < items.length; i += TABS) {
  const batch = items.slice(i, i + TABS);

  const batchResults = await Promise.all(
    batch.map(async (item, j) => {
      const aUrl = buildActiveUrl(item.active_url);
      const sUrl = buildSoldUrl(item.sold_url || item.active_url);
      const [ac, sc] = await Promise.all([
        aUrl ? scrapeCount(activePages[j], aUrl) : Promise.resolve(null),
        sUrl ? scrapeCount(soldPages[j], sUrl) : Promise.resolve(null),
      ]);
      return { id: item.id, ac, sc, active_url: item.active_url, sold_url: item.sold_url };
    })
  );

  const dbOps = [];
  for (const r of batchResults) {
    processed++;
    if (r.ac === null && r.sc === null) {
      failed++;
      results.push({ id: r.id, error: true });
      continue;
    }
    const ac = r.ac ?? 0;
    const sc = r.sc ?? 0;
    updated++;
    results.push({ id: r.id, new_active: ac, new_sold: sc });

    const payload = { active_count: ac, sold: sc };
    if (r.active_url) payload.original_url = r.active_url;
    if (r.sold_url) payload.sold_link = r.sold_url;
    dbOps.push(sb.from("9_Octoparse_Scrapes").update(payload).eq("id", r.id));
  }

  if (dbOps.length) await Promise.all(dbOps);

  const rate = Math.round((processed / ((Date.now() - start) / 1000)) * 60);
  process.stderr.write(`[${processed}/${items.length}] ok=${updated} fail=${failed} ${rate}/min\r`);
}

await browser.close();
const elapsed = Math.round((Date.now() - start) / 1000);
process.stderr.write(`\nDone: ${processed} items, ${updated} updated, ${failed} failed in ${elapsed}s (${Math.round(processed/elapsed*60)}/min)\n`);
process.stdout.write(JSON.stringify(results));
