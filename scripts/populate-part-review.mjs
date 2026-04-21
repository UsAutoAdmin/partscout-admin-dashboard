/**
 * Populate the part review queue with top 5K parts ranked by data reliability.
 * Criteria: sell_through 80-200%, confidence >= 0.8, sold >= 10, margin >= 20%
 * De-dups to unique year/make/model/part, picks best variation per combo.
 * Writes queue to data/part-review/queue.json
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Fetching scored parts (ST 80-200%, conf>=0.8, sold>=10, margin>=20%)...");

  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("scored_parts")
      .select(
        "id, scrape_id, variation_id, year, make, model, part_name, variation_name, avg_sell_price, median_sell_price, sell_through, sold_volume, sold_confidence, profit_margin, cog, cog_matched_name, price_consistency, best_image_url, best_listing_title"
      )
      .gte("sell_through", 80)
      .lte("sell_through", 200)
      .gte("sold_confidence", 0.8)
      .gte("sold_volume", 10)
      .gte("profit_margin", 20)
      .range(from, from + 999);

    if (error) {
      console.error("Query error:", error.message);
      break;
    }
    all.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
    from += 1000;
  }
  console.log(`  ${all.length} variation-level rows`);

  // De-dup: pick best variation per year/make/model/part
  const best = new Map();
  for (const p of all) {
    const key = `${p.year}|${p.make}|${p.model}|${p.part_name}`;
    const existing = best.get(key);
    if (
      !existing ||
      p.sold_confidence > existing.sold_confidence ||
      (p.sold_confidence === existing.sold_confidence &&
        p.sold_volume > existing.sold_volume)
    ) {
      best.set(key, p);
    }
  }
  console.log(`  ${best.size} unique year/make/model/part combos`);

  // Sort by reliability: confidence * volume * price_consistency
  const sorted = Array.from(best.values()).sort((a, b) => {
    const sa = a.sold_confidence * a.sold_volume * (a.price_consistency || 0.5);
    const sb = b.sold_confidence * b.sold_volume * (b.price_consistency || 0.5);
    return sb - sa;
  });

  const top = sorted.slice(0, 5000);
  console.log(`  Selected top ${top.length}`);

  // Fetch eBay URLs from 9_Octoparse_Scrapes for each
  console.log("Fetching eBay URLs from scrape records...");
  const scrapeIds = [...new Set(top.map((p) => p.scrape_id))];

  const urlMap = new Map();
  for (let i = 0; i < scrapeIds.length; i += 200) {
    const batch = scrapeIds.slice(i, i + 200);
    const { data } = await sb
      .from("9_Octoparse_Scrapes")
      .select("id, original_url, sold_link, active_count, sold")
      .in("id", batch);
    for (const r of data ?? []) {
      urlMap.set(r.id, {
        original_url: r.original_url,
        sold_link: r.sold_link,
        orig_active_count: r.active_count,
        orig_sold_raw: r.sold,
      });
    }
  }
  console.log(`  Fetched URLs for ${urlMap.size} scrapes`);

  // Build queue
  const queue = top.map((p, idx) => {
    const scrape = urlMap.get(p.scrape_id) || {};
    return {
      queue_position: idx + 1,
      scored_part_id: p.id,
      scrape_id: p.scrape_id,
      year: p.year,
      make: p.make,
      model: p.model,
      part_name: p.part_name,
      variation_name: p.variation_name,
      avg_sell_price: p.avg_sell_price,
      median_sell_price: p.median_sell_price,
      original_sell_through: p.sell_through,
      original_sold_volume: p.sold_volume,
      sold_confidence: p.sold_confidence,
      profit_margin: p.profit_margin,
      cog: p.cog,
      price_consistency: p.price_consistency,
      best_image_url: p.best_image_url,
      ebay_url: scrape.original_url || null,
      sold_link: scrape.sold_link || null,
      status: "pending",
      new_active_count: null,
      new_sold_count: null,
      new_sell_through: null,
      st_change_pct: null,
      removed: false,
      remove_reason: null,
      scraped_at: null,
    };
  });

  const dir = path.join(process.cwd(), "data", "part-review");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "queue.json"), JSON.stringify(queue, null, 2));

  console.log(`\nWrote ${queue.length} parts to data/part-review/queue.json`);

  const withUrl = queue.filter((q) => q.ebay_url);
  console.log(`  ${withUrl.length} have eBay URLs for rescraping`);
}

main().catch(console.error);
