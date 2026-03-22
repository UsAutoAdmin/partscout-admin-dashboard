import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { OUTPUT_DIR } from "@/lib/video-generator/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string; filename: string } }
) {
  const filePath = path.join(OUTPUT_DIR, params.jobId, params.filename);

  try {
    const stat = await fs.stat(filePath);
    const buffer = await fs.readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size.toString(),
        "Content-Disposition": `attachment; filename="${params.filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
