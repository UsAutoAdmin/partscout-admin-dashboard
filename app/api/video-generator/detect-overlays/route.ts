import { NextRequest, NextResponse } from "next/server";
import { detectOverlayTimestamps } from "@/lib/video-generator/overlay-detect";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { words } = body;

    if (!words || !Array.isArray(words)) {
      return NextResponse.json(
        { error: "words array is required" },
        { status: 400 }
      );
    }

    const overlays = await detectOverlayTimestamps(words);
    return NextResponse.json({ overlays });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
