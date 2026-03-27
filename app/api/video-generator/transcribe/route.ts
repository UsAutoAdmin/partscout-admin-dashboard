import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import { extractSegment } from "@/lib/video-generator/silence-detect";
import { extractAudio, transcribeWithTimestamps } from "@/lib/video-generator/transcribe";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, start, end } = body;

    if (!jobId || start === undefined || end === undefined) {
      return NextResponse.json(
        { error: "jobId, start, and end are required" },
        { status: 400 }
      );
    }

    const jobDir = path.join(UPLOADS_DIR, jobId);
    const rawPath = path.join(jobDir, "raw.mp4");

    try {
      await fs.access(rawPath);
    } catch {
      return NextResponse.json({ error: "Raw video not found" }, { status: 404 });
    }

    const bodyVideoPath = path.join(jobDir, "body_segment.mp4");
    await extractSegment(rawPath, start, end, bodyVideoPath);

    const bodyAudioPath = path.join(jobDir, "body_audio.wav");
    await extractAudio(bodyVideoPath, bodyAudioPath);

    const transcript = await transcribeWithTimestamps(bodyAudioPath);

    await fs.unlink(bodyAudioPath).catch(() => {});

    return NextResponse.json({ transcript });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
