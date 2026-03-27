import { NextRequest, NextResponse } from "next/server";
import { generateHookTexts } from "@/lib/video-generator/hook-banner";

/**
 * POST: Generate catchy hook text variations for video overlays.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { numHooks, partName, carName, yardPrice, soldPrice } = body as {
      numHooks: number;
      partName?: string;
      carName?: string;
      yardPrice?: string;
      soldPrice?: string;
    };

    if (!numHooks || numHooks < 1) {
      return NextResponse.json(
        { error: "numHooks must be >= 1" },
        { status: 400 }
      );
    }

    const texts = await generateHookTexts(numHooks, {
      partName,
      carName,
      yardPrice,
      soldPrice,
    });

    return NextResponse.json({ texts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
