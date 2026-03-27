import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import {
  findCarImage,
  downloadCarImage,
  closeBrowser,
} from "@/lib/video-generator/car-image";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, carDescription } = body as {
      jobId: string;
      carDescription: string;
    };

    if (!jobId || !carDescription) {
      return NextResponse.json(
        { error: "jobId and carDescription are required" },
        { status: 400 }
      );
    }

    const result = await findCarImage(carDescription);
    if (!result) {
      return NextResponse.json({
        found: false,
        carDescription,
        message: `No car image found for "${carDescription}"`,
      });
    }

    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const filename = `auto_car_${carDescription
      .replace(/[^a-zA-Z0-9]/g, "_")
      .substring(0, 40)}.jpg`;
    const destPath = path.join(jobDir, filename);

    const dimensions = await downloadCarImage(
      result.imageUrl,
      destPath,
      (result as any)._candidates
    );

    await closeBrowser();

    return NextResponse.json({
      found: true,
      carDescription,
      searchTerm: result.searchTerm,
      sourceUrl: result.imageUrl,
      filename,
      dimensions,
    });
  } catch (err: any) {
    await closeBrowser().catch(() => {});
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
