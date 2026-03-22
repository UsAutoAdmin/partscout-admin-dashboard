import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { BROLL_DIR } from "@/lib/video-generator/constants";

export async function GET() {
  try {
    await fs.mkdir(BROLL_DIR, { recursive: true });
    const files = (await fs.readdir(BROLL_DIR)).filter((f) =>
      /\.(mp4|mov|mkv|avi|webm)$/i.test(f)
    );

    const broll = await Promise.all(
      files.map(async (f) => {
        const stat = await fs.stat(path.join(BROLL_DIR, f));
        return {
          name: f,
          sizeMb: Math.round((stat.size / 1024 / 1024) * 10) / 10,
          modified: stat.mtime.toISOString(),
        };
      })
    );

    return NextResponse.json({ count: broll.length, files: broll });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0)
      return NextResponse.json({ error: "No files provided" }, { status: 400 });

    await fs.mkdir(BROLL_DIR, { recursive: true });
    const saved: string[] = [];

    for (const file of files) {
      const dest = path.join(BROLL_DIR, file.name);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(dest, buf);
      saved.push(file.name);
    }

    return NextResponse.json({ saved, count: saved.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
