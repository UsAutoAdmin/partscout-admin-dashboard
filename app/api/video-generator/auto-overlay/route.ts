import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import {
  findPriceCard,
  downloadPriceCardImage,
} from "@/lib/video-generator/price-lookup";

/**
 * POST: Given a jobId and the spoken part name (from overlay detection),
 * automatically find and download the matching LKQ price card image.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, partName } = body as { jobId: string; partName: string };

    if (!jobId || !partName) {
      return NextResponse.json(
        { error: "jobId and partName are required" },
        { status: 400 }
      );
    }

    const card = await findPriceCard(partName);
    if (!card) {
      return NextResponse.json({
        matched: false,
        partName,
        message: `No matching price card found for "${partName}"`,
      });
    }

    const filename = `auto_price_${card.storage_path.replace(/\//g, "_")}`;
    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });
    const destPath = path.join(jobDir, filename);
    await downloadPriceCardImage(card.image_url, destPath);

    return NextResponse.json({
      matched: true,
      partName,
      matchedPart: card.part_name,
      price: card.price,
      yardLocation: card.yard_location,
      filename,
      imageUrl: card.image_url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
