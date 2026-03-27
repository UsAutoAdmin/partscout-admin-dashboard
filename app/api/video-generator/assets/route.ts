import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ASSETS_DIR } from "@/lib/video-generator/constants";

export interface AssetInfo {
  name: string;
  sizeMb: number;
  exists: boolean;
}

const KNOWN_ASSETS = ["riser.mp3", "click.mp3", "grade.cube"] as const;

export async function GET() {
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });

    const assets: Record<string, AssetInfo> = {};
    for (const name of KNOWN_ASSETS) {
      const filePath = path.join(ASSETS_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        assets[name] = {
          name,
          sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
          exists: true,
        };
      } catch {
        assets[name] = { name, sizeMb: 0, exists: false };
      }
    }

    return NextResponse.json({ assets });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const slot = formData.get("slot") as string | null;
    const file = formData.get("file") as File | null;

    if (!slot || !file) {
      return NextResponse.json(
        { error: "slot and file are required" },
        { status: 400 }
      );
    }

    const allowed = ["riser.mp3", "click.mp3", "grade.cube"];
    if (!allowed.includes(slot)) {
      return NextResponse.json(
        { error: `Invalid slot. Must be one of: ${allowed.join(", ")}` },
        { status: 400 }
      );
    }

    await fs.mkdir(ASSETS_DIR, { recursive: true });
    const dest = path.join(ASSETS_DIR, slot);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(dest, buf);

    const stat = await fs.stat(dest);
    return NextResponse.json({
      name: slot,
      sizeMb: Math.round((stat.size / 1024 / 1024) * 100) / 100,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
