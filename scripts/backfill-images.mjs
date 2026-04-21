/**
 * Backfill images for parts missing them by scraping eBay sold listings.
 * Searches for the highest-price sold listing image for each part.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const USER_ID = "user_38tYWMdCYvz3XkcG1ENgzErjpoR";

function buildEbayUrl(year, make, model, partName) {
  const cleanModel = model
    .replace(/FORD |DODGE |CHEVROLET |GMC |NISSAN |TOYOTA |HONDA |BMW |LEXUS |SCION |HUMMER |MERCEDES /gi, "")
    .trim();
  const terms = [year, make, cleanModel, partName].join(" ").replace(/\s+/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(terms)}&LH_Sold=1&LH_Complete=1&_sop=16&_ipg=60`;
}

async function scrapeFirstImage(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1500);

    const img = await page.evaluate(() => {
      const all = document.querySelectorAll("img");
      for (const el of all) {
        const src = el.src || "";
        if (src.includes("i.ebayimg.com") && src.includes("/s-l140")) {
          return src.replace(/\/s-l\d+/, "/s-l500").replace(".webp", ".jpg");
        }
      }
      for (const el of all) {
        const src = el.src || "";
        if (
          src.includes("i.ebayimg.com") &&
          !src.includes("ebaystatic") &&
          !src.includes(".gif") &&
          !src.includes(".png")
        ) {
          return src.replace(/\/s-l\d+/, "/s-l500").replace(".webp", ".jpg");
        }
      }
      return null;
    });

    return img;
  } catch {
    return null;
  }
}

async function main() {
  const { data: parts } = await sb
    .from("6_user_database_parts")
    .select("id, year, make, model, part_name, image_url")
    .eq("user_id", USER_ID)
    .is("image_url", null);

  console.log(`${parts.length} parts need images\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const CONCURRENCY = 3;
  const pages = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => context.newPage())
  );

  let found = 0, failed = 0;

  for (let i = 0; i < parts.length; i += CONCURRENCY) {
    const batch = parts.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (p, j) => {
        const page = pages[j % CONCURRENCY];
        const label = `${p.year} ${p.make} ${p.model} ${p.part_name}`;
        const url = buildEbayUrl(p.year, p.make, p.model, p.part_name);
        const img = await scrapeFirstImage(page, url);
        return { part: p, label, img };
      })
    );

    for (const { part, label, img } of results) {
      const idx = parts.indexOf(part) + 1;
      if (img) {
        await sb
          .from("6_user_database_parts")
          .update({ image_url: img })
          .eq("id", part.id);
        console.log(`  [${idx}/${parts.length}] ✓ ${label}`);
        found++;
      } else {
        console.log(`  [${idx}/${parts.length}] ✗ ${label} — no results`);
        failed++;
      }
    }

    if (i + CONCURRENCY < parts.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  await browser.close();
  console.log(`\nDone: ${found} images found, ${failed} no results`);
}

main().catch(console.error);
