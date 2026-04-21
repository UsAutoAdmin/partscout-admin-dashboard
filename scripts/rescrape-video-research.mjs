import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const THRESHOLD = 0.2;

async function scrapeCount(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const text = await page.textContent("h1.srp-controls__count-heading, h2.srp-controls__count-heading", { timeout: 5000 }).catch(() => null);
    if (!text) return null;
    const match = text.replace(/,/g, "").match(/([\d]+)/);
    return match ? parseInt(match[1]) : null;
  } catch {
    return null;
  }
}

const LOW_VOLUME_CEIL = 20;
const MIN_SELL_THROUGH = 0.75;

function within20(oldVal, newVal) {
  if (oldVal === 0 && newVal === 0) return true;
  if (oldVal === 0) return newVal <= 3;
  return Math.abs(newVal - oldVal) / oldVal <= THRESHOLD;
}

function isLowVolumeButHealthy(oldActive, oldSold, newActive, newSold) {
  if (oldSold > LOW_VOLUME_CEIL && oldActive > LOW_VOLUME_CEIL) return false;
  const finalActive = newActive ?? oldActive;
  const finalSold = newSold ?? oldSold;
  if (finalActive <= 0) return false;
  return (finalSold / finalActive) >= MIN_SELL_THROUGH;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("Video_Parts_for_research")
    .select("*")
    .not("sell_price", "is", null);

  if (error) { console.error("DB error:", error.message); process.exit(1); }
  console.log(`Loaded ${rows.length} parts to re-scrape\n`);

  const browser = await chromium.launch({ headless: true });
  const CONCURRENCY = 5;
  const results = [];

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (row) => {
      const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" });
      const page = await ctx.newPage();
      const label = `${row.year} ${row.make} ${row.model} ${row.part}`;

      let newActive = null;
      let newSold = null;

      try {
        newActive = await scrapeCount(page, row.original_url);
        if (row.sold_link) {
          newSold = await scrapeCount(page, row.sold_link);
        }
      } finally {
        await ctx.close();
      }

      return { row, label, newActive, newSold };
    }));
    results.push(...batchResults);
    process.stdout.write(`  Scraped ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}\r`);
  }

  await browser.close();
  console.log(`\nScraping complete. Analyzing results...\n`);

  const updated = [];
  const removed = [];
  const unchanged = [];
  const failed = [];

  for (const { row, label, newActive, newSold } of results) {
    const oldActive = Number(row.active) || 0;
    const oldSold = Number(row.sold) || 0;

    if (newActive === null && newSold === null) {
      failed.push({ label, reason: "Could not scrape either count" });
      continue;
    }

    const activeOk = newActive === null || within20(oldActive, newActive);
    const soldOk = newSold === null || within20(oldSold, newSold);

    if (!activeOk || !soldOk) {
      if (isLowVolumeButHealthy(oldActive, oldSold, newActive, newSold)) {
        // Low-volume part with healthy sell-through — keep it, just update counts
        const updates = {};
        if (newActive !== null) updates.active = newActive;
        if (newSold !== null) updates.sold = newSold;
        const finalActive = newActive ?? oldActive;
        const finalSold = newSold ?? oldSold;
        updates.sell_through = finalActive > 0 ? Math.round((finalSold / finalActive) * 10000) / 100 : 0;
        updated.push({ id: row.id, label, oldActive, oldSold, newActive, newSold, updates, lowVolKeep: true });
      } else {
        const reason = [];
        if (!activeOk) reason.push(`active: ${oldActive} → ${newActive}`);
        if (!soldOk) reason.push(`sold: ${oldSold} → ${newSold}`);
        removed.push({ id: row.id, label, reason: reason.join(", ") });
      }
    } else if (newActive !== null || newSold !== null) {
      const updates = {};
      if (newActive !== null && newActive !== oldActive) updates.active = newActive;
      if (newSold !== null && newSold !== oldSold) updates.sold = newSold;

      if (Object.keys(updates).length > 0) {
        const finalActive = updates.active ?? oldActive;
        const finalSold = updates.sold ?? oldSold;
        updates.sell_through = finalActive > 0 ? Math.round((finalSold / finalActive) * 10000) / 100 : 0;
        updated.push({ id: row.id, label, oldActive, oldSold, newActive, newSold, updates });
      } else {
        unchanged.push({ label });
      }
    }
  }

  // Apply updates
  for (const u of updated) {
    await supabase.from("Video_Parts_for_research").update(u.updates).eq("id", u.id);
  }

  // Remove outliers
  for (const r of removed) {
    await supabase.from("Video_Parts_for_research").delete().eq("id", r.id);
  }

  console.log("=== RESULTS ===\n");

  if (removed.length > 0) {
    console.log(`REMOVED (${removed.length}):`);
    for (const r of removed) {
      console.log(`  ✗ ${r.label} — ${r.reason}`);
    }
    console.log();
  }

  if (updated.length > 0) {
    console.log(`UPDATED (${updated.length}):`);
    for (const u of updated) {
      const tag = u.lowVolKeep ? " [low-vol kept, ST≥75%]" : "";
      console.log(`  ✓ ${u.label} — active: ${u.oldActive}→${u.newActive ?? "n/a"}, sold: ${u.oldSold}→${u.newSold ?? "n/a"}${tag}`);
    }
    console.log();
  }

  console.log(`UNCHANGED: ${unchanged.length}`);
  if (failed.length > 0) {
    console.log(`FAILED TO SCRAPE: ${failed.length}`);
    for (const f of failed) console.log(`  ? ${f.label} — ${f.reason}`);
  }

  console.log(`\nDone. ${updated.length} updated, ${removed.length} removed, ${unchanged.length} unchanged, ${failed.length} failed.`);
}

main().catch(console.error);
