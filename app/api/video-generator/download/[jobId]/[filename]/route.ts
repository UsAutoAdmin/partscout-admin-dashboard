import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { OUTPUT_DIR } from "@/lib/video-generator/constants";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;
  const filePath = path.join(OUTPUT_DIR, jobId, filename);

  try {
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;

    const isPreview = req.nextUrl.searchParams.get("preview") === "1";
    const disposition = isPreview ? "inline" : `attachment; filename="${filename}"`;

    const rangeHeader = req.headers.get("range");

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const stream = createReadStream(filePath, { start, end });
        const readable = new ReadableStream({
          start(controller) {
            stream.on("data", (chunk: string | Buffer) => controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
            stream.on("end", () => controller.close());
            stream.on("error", (err) => controller.error(err));
          },
        });

        return new NextResponse(readable as any, {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": disposition,
          },
        });
      }
    }

    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
