import { chromium, type Browser, type Page } from "playwright";
import fs from "fs/promises";
import sharp from "sharp";

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

export interface EbayListing {
  title: string;
  imageUrl: string;
  price: string;
  priceNum: number;
  soldDate: string;
  cardIndex: number;
}

/**
 * Build an eBay sold search URL from a part name and car description.
 */
export function buildSoldSearchUrl(
  partName: string,
  carDescription: string
): string {
  const query = `${carDescription} ${partName}`.trim();
  const nkw = encodeURIComponent(query).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc&LH_Sold=1`;
}

/**
 * Load an eBay sold search page in a real browser, then:
 *   1. Extract listings and pick the best two
 *   2. Download the top listing's image → Part Picture
 *   3. Screenshot the two best listings → Sold Listing Screenshot
 *
 * @param targetPrice Optional price hint (from transcript) to prefer
 *                    listings closest to the spoken sell price.
 */
export async function scrapeEbaySoldListings(
  searchUrl: string,
  partImagePath: string,
  soldScreenshotPath: string,
  targetPrice?: number
): Promise<{
  listings: EbayListing[];
  partImageSaved: boolean;
  soldScreenshotSaved: boolean;
}> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    await page
      .waitForSelector("ul.srp-results li.s-card", { timeout: 8_000 })
      .catch(() => {});

    const allListings = await extractListings(page);
    if (allListings.length === 0) {
      return {
        listings: [],
        partImageSaved: false,
        soldScreenshotSaved: false,
      };
    }

    const top2 = pickBestListings(allListings, targetPrice);

    const partImageSaved = await saveFirstListingImage(
      page,
      top2,
      partImagePath
    );

    const soldScreenshotSaved = await screenshotListingsByIndex(
      page,
      top2.map((l) => l.cardIndex),
      soldScreenshotPath
    );

    return { listings: top2, partImageSaved, soldScreenshotSaved };
  } finally {
    await context.close();
  }
}

/**
 * Pick the two best listings to display.
 *
 * When a targetPrice is provided (from the video transcript), listings are
 * sorted by proximity to that price so the screenshot shows comps closest
 * to what was mentioned in the video.
 *
 * Otherwise falls back to statistical filtering: mean + 1 stddev ceiling
 * for common parts (6+), relevance order for rare parts (<6).
 */
function pickBestListings(
  listings: EbayListing[],
  targetPrice?: number
): EbayListing[] {
  const priced = listings.filter((l) => l.priceNum > 0);
  if (priced.length <= 2) return priced;

  // If we have a target price from the transcript, prefer listings closest to it
  if (targetPrice && targetPrice > 0) {
    const sorted = [...priced].sort(
      (a, b) => Math.abs(a.priceNum - targetPrice) - Math.abs(b.priceNum - targetPrice)
    );
    console.log(
      `[ebay] Target price $${targetPrice} — closest: $${sorted[0]?.priceNum}, $${sorted[1]?.priceNum}`
    );
    return sorted.slice(0, 2);
  }

  if (priced.length < 6) {
    return priced.slice(0, 2);
  }

  const prices = priced.map((l) => l.priceNum);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance =
    prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const ceiling = mean + stdDev;

  const withinRange = priced
    .filter((l) => l.priceNum <= ceiling)
    .sort((a, b) => b.priceNum - a.priceNum);

  if (withinRange.length >= 2) return withinRange.slice(0, 2);

  return priced.slice(0, 2);
}

async function extractListings(page: Page): Promise<EbayListing[]> {
  return page.$$eval("ul.srp-results > li.s-card", (cards) => {
    const results: {
      title: string;
      imageUrl: string;
      price: string;
      priceNum: number;
      soldDate: string;
      cardIndex: number;
    }[] = [];

    cards.forEach((card, idx) => {
      if (results.length >= 15) return;

      const titleEl = card.querySelector("div.s-card__title");
      const rawTitle = titleEl?.textContent?.trim() || "";
      if (!rawTitle || rawTitle === "Shop on eBay") return;

      const title = rawTitle
        .replace(/Opens in a new.*$/i, "")
        .replace(/\(For:.*?\)/i, "")
        .trim();

      const imgEl = card.querySelector(
        "img.s-card__image"
      ) as HTMLImageElement;
      let imageUrl =
        imgEl?.src || imgEl?.getAttribute("data-defer-load") || "";
      if (imageUrl) {
        imageUrl = imageUrl.replace(/s-l\d+\.jpg/, "s-l1600.jpg");
      }

      const priceMatch = card.textContent?.match(/\$[\d,]+\.?\d*/);
      const price = priceMatch ? priceMatch[0] : "";
      const priceNum = price
        ? parseFloat(price.replace(/[$,]/g, ""))
        : 0;

      const soldMatch = card.textContent?.match(
        /Sold\s+\w+\s+\d+,\s+\d{4}/
      );
      const soldDate = soldMatch ? soldMatch[0] : "";

      results.push({ title, imageUrl, price, priceNum, soldDate, cardIndex: idx });
    });

    return results;
  });
}

/**
 * Download the highest-priced listing's image and convert to JPEG.
 */
async function saveFirstListingImage(
  page: Page,
  listings: EbayListing[],
  destPath: string
): Promise<boolean> {
  const first = listings.find((l) => l.imageUrl);
  if (!first) return false;

  try {
    const response = await page.context().request.get(first.imageUrl);
    if (!response.ok()) return false;
    const raw = await response.body();
    await sharp(raw).jpeg({ quality: 90 }).toFile(destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rearrange the DOM so the two target cards are at the top of the list,
 * hide everything else, then screenshot just those two.
 */
async function screenshotListingsByIndex(
  page: Page,
  cardIndices: number[],
  destPath: string
): Promise<boolean> {
  try {
    await page.evaluate((indices) => {
      const list = document.querySelector("ul.srp-results");
      if (!list) return;
      const cards = Array.from(list.querySelectorAll(":scope > li.s-card"));

      const targets = indices
        .map((i) => cards[i])
        .filter(Boolean) as HTMLElement[];
      if (targets.length === 0) return;

      for (const card of cards) {
        (card as HTMLElement).style.display = "none";
      }
      for (const card of targets) {
        card.style.display = "";
        list.prepend(card);
      }

      const banner = document.querySelector(".srp-river-answer--REWRITE_START");
      if (banner) (banner as HTMLElement).style.display = "none";
      const fitBar = document.querySelector(".fake-tabs");
      if (fitBar) (fitBar as HTMLElement).style.display = "none";
      const fitBar2 = document.querySelector('[class*="parts-compatibility"]');
      if (fitBar2) (fitBar2 as HTMLElement).style.display = "none";
    }, cardIndices);

    await page.waitForTimeout(200);

    const cards = await page.$$("ul.srp-results > li.s-card:visible");
    if (cards.length === 0) return false;

    const firstCard = cards[0];
    const lastCard = cards[Math.min(1, cards.length - 1)];

    await firstCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const firstBox = await firstCard.boundingBox();
    const lastBox = await lastCard.boundingBox();
    if (!firstBox || !lastBox) return false;

    const PADDING = 8;
    const x = Math.max(0, firstBox.x - PADDING);
    const y = Math.max(0, firstBox.y - PADDING);
    const bottom = lastBox.y + lastBox.height + PADDING;
    const right =
      Math.max(firstBox.x + firstBox.width, lastBox.x + lastBox.width) +
      PADDING;

    await page.screenshot({
      path: destPath,
      clip: { x, y, width: right - x, height: bottom - y },
    });

    return true;
  } catch {
    return false;
  }
}
