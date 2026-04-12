import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { OUTPUT_DIR } from "@/lib/video-generator/constants";
import { getAutoJob } from "@/lib/video-generator/auto-pipeline";

const exec = promisify(execFile);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = getAutoJob(jobId);
  const outputDir = path.join(OUTPUT_DIR, jobId);

  try {
    await fs.access(outputDir);
  } catch {
    return NextResponse.json({ error: "No output files found" }, { status: 404 });
  }

  const allFiles = (await fs.readdir(outputDir)).filter((f) => f.endsWith(".mp4"));
  if (allFiles.length === 0) {
    return NextResponse.json({ error: "No video files found" }, { status: 404 });
  }

  const flaggedIndices = new Set(
    (job?.hookFlags ?? []).filter((f) => f.flagged).map((f) => f.index + 1)
  );
  const files = flaggedIndices.size > 0
    ? allFiles.filter((f) => {
        const numMatch = f.match(/ - (\d+)\.mp4$/);
        return !numMatch || !flaggedIndices.has(parseInt(numMatch[1]));
      })
    : allFiles;

  if (files.length === 0) {
    return NextResponse.json({ error: "All videos are flagged" }, { status: 404 });
  }

  const zipName = job?.videoName
    ? `${job.videoName.replace(/[/\\?%*:|"<>]/g, "")}.zip`
    : `${jobId}.zip`;
  const zipPath = path.join(OUTPUT_DIR, `${jobId}_bundle.zip`);

  try {
    await exec("zip", ["-j", zipPath, ...files.map((f) => path.join(outputDir, f))]);

    const buf = await fs.readFile(zipPath);
    await fs.unlink(zipPath).catch(() => {});

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Zip failed: ${err.message}` }, { status: 500 });
  }
}
