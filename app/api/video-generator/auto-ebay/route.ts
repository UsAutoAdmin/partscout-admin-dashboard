import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import {
  buildSoldSearchUrl,
  scrapeEbaySoldListings,
  closeBrowser,
} from "@/lib/video-generator/ebay-scraper";

/**
 * POST: Given a jobId, partName, and carDescription, automatically:
 *   1. Load the eBay sold search page in a real browser
 *   2. Save the first listing's image → "Part Picture" overlay
 *   3. Screenshot two sold listings → "Sold Listing Screenshot" overlay
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, partName, carDescription, soldPriceText } = body as {
      jobId: string;
      partName: string;
      carDescription: string;
      soldPriceText?: string;
    };

    if (!jobId || !partName || !carDescription) {
      return NextResponse.json(
        { error: "jobId, partName, and carDescription are required" },
        { status: 400 }
      );
    }

    let targetPrice: number | undefined;
    if (soldPriceText) {
      const numMatch = soldPriceText.match(/\d+/);
      if (numMatch) targetPrice = parseFloat(numMatch[0]);
    }

    const searchUrl = buildSoldSearchUrl(partName, carDescription);

    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const partImagePath = path.join(jobDir, "auto_part_image.jpg");
    const soldScreenshotPath = path.join(jobDir, "auto_sold_listings.png");

    const result = await scrapeEbaySoldListings(
      searchUrl,
      partImagePath,
      soldScreenshotPath,
      targetPrice
    );

    if (result.listings.length === 0) {
      return NextResponse.json({
        partImage: null,
        soldCard: null,
        message: `No sold listings found for "${carDescription} ${partName}"`,
        searchUrl,
      });
    }

    await closeBrowser();

    return NextResponse.json({
      partImage: result.partImageSaved
        ? {
            filename: "auto_part_image.jpg",
            title: result.listings[0].title,
            price: result.listings[0].price,
          }
        : null,
      soldCard: result.soldScreenshotSaved
        ? {
            filename: "auto_sold_listings.png",
            listingsUsed: result.listings.slice(0, 2).map((l) => ({
              title: l.title,
              price: l.price,
              soldDate: l.soldDate,
            })),
          }
        : null,
      totalListingsFound: result.listings.length,
      searchUrl,
    });
  } catch (err: any) {
    await closeBrowser().catch(() => {});
    console.error("auto-ebay error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
