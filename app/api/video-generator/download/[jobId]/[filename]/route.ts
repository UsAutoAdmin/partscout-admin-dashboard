import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { OUTPUT_DIR } from "@/lib/video-generator/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;
  const filePath = path.join(OUTPUT_DIR, jobId, filename);

  try {
    const stat = await fs.stat(filePath);
    const buf = await fs.readFile(filePath);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
