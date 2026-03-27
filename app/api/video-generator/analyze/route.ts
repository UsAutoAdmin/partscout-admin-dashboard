import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import {
  detectSilence,
  getVideoDuration,
  segmentsFromSilence,
} from "@/lib/video-generator/silence-detect";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const jobId = crypto.randomUUID();
    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const rawPath = path.join(jobDir, "raw.mp4");
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(rawPath, buf);

    const [silenceRanges, totalDuration] = await Promise.all([
      detectSilence(rawPath),
      getVideoDuration(rawPath),
    ]);

    const segments = segmentsFromSilence(silenceRanges, totalDuration);

    return NextResponse.json({
      jobId,
      totalDuration,
      silenceRanges,
      segments,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
