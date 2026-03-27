import { chromium, type Browser } from "playwright";
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

const CATALOG_DOMAINS = [
  "cstatic-images.com",
  "cars.com",
  "edmunds.com",
  "caranddriver.com",
  "motortrend.com",
  "kbb.com",
  "autotrader.com",
  "carfax.com",
  "autoblog.com",
];

/**
 * Search Bing Images for a catalog-style car photo, download it,
 * and save as JPEG. Tries multiple candidates if the first fails.
 */
export async function findCarImage(
  carDescription: string
): Promise<{
  imageUrl: string;
  searchTerm: string;
  width: number;
  height: number;
} | null> {
  const cleaned = carDescription.trim();
  const searchTerm = `${cleaned} front side view`;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    const q = encodeURIComponent(searchTerm);
    await page.goto(
      `https://www.bing.com/images/search?q=${q}&qft=+filterui:imagesize-large+filterui:photo-photo`,
      { waitUntil: "domcontentloaded", timeout: 15_000 }
    );

    await page
      .waitForSelector("a.iusc", { timeout: 6_000 })
      .catch(() => {});

    const urls = await page.$$eval("a.iusc", (links) =>
      links.slice(0, 15).map((a) => {
        try {
          const data = JSON.parse(a.getAttribute("m") || "{}");
          return (data.murl as string) || "";
        } catch {
          return "";
        }
      })
    );

    const EXCLUDE = ["logo", "interior", "dashboard", "cabin", "cockpit", "seat", "steering"];
    const valid = urls.filter(
      (u) =>
        u.startsWith("http") &&
        !u.endsWith(".svg") &&
        !EXCLUDE.some((ex) => u.toLowerCase().includes(ex))
    );

    if (valid.length === 0) return null;

    const catalogUrls = valid.filter((u) =>
      CATALOG_DOMAINS.some((d) => u.includes(d))
    );
    const ranked = [
      ...catalogUrls,
      ...valid.filter((u) => !catalogUrls.includes(u)),
    ];

    return {
      imageUrl: ranked[0],
      searchTerm,
      width: 0,
      height: 0,
      _candidates: ranked.slice(1, 6),
    } as any;
  } finally {
    await context.close();
  }
}

/**
 * Download a car image and convert to JPEG.
 * Tries the primary URL first, then falls back to candidates.
 */
export async function downloadCarImage(
  imageUrl: string,
  destPath: string,
  candidates?: string[]
): Promise<{ width: number; height: number }> {
  const allUrls = [imageUrl, ...(candidates || [])];

  const browser = await getBrowser();

  for (const url of allUrls) {
    const context = await browser.newContext();
    try {
      const response = await context.request.get(url, { timeout: 8_000 });
      if (!response.ok()) continue;
      const raw = await response.body();
      if (raw.length < 5000) continue;
      const metadata = await sharp(raw).metadata();
      if (!metadata.width || metadata.width < 200) continue;
      await sharp(raw).jpeg({ quality: 90 }).toFile(destPath);
      return { width: metadata.width || 0, height: metadata.height || 0 };
    } catch {
      continue;
    } finally {
      await context.close();
    }
  }

  throw new Error("All image download candidates failed");
}
