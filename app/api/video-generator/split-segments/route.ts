import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";
import { extractSegment } from "@/lib/video-generator/silence-detect";

interface SegmentInput {
  start: number;
  end: number;
  label: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jobId, segments } = body as {
      jobId: string;
      segments: SegmentInput[];
    };

    if (!jobId || !segments?.length) {
      return NextResponse.json(
        { error: "jobId and segments array required" },
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

    const hooks: string[] = [];
    let bodyPath: string | null = null;

    let hookIdx = 0;
    for (const seg of segments) {
      if (seg.label === "Discard") continue;

      const isBody = seg.label === "Body";
      const filename = isBody
        ? "body_segment.mp4"
        : `hook_${hookIdx}.mp4`;
      const outputPath = path.join(jobDir, filename);

      await extractSegment(rawPath, seg.start, seg.end, outputPath);

      if (isBody) {
        bodyPath = outputPath;
      } else {
        hooks.push(outputPath);
        hookIdx++;
      }
    }

    if (!bodyPath) {
      return NextResponse.json(
        { error: "No segment labeled 'Body' was provided" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      hookPaths: hooks.map((p) => path.basename(p)),
      bodyPath: path.basename(bodyPath),
      hookCount: hooks.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
