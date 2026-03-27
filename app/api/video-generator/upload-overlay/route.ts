import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { UPLOADS_DIR } from "@/lib/video-generator/constants";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const jobId = formData.get("jobId") as string | null;
    const slot = formData.get("slot") as string | null;
    const file = formData.get("image") as File | null;

    if (!jobId || !slot || !file) {
      return NextResponse.json(
        { error: "jobId, slot, and image are required" },
        { status: 400 }
      );
    }

    const validSlots = ["part", "car", "price", "soldPrice"];
    if (!validSlots.includes(slot)) {
      return NextResponse.json(
        { error: `Invalid slot. Must be one of: ${validSlots.join(", ")}` },
        { status: 400 }
      );
    }

    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const ext = path.extname(file.name) || ".png";
    const destPath = path.join(jobDir, `overlay_${slot}${ext}`);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(destPath, buf);

    return NextResponse.json({
      slot,
      filename: `overlay_${slot}${ext}`,
      path: destPath,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
