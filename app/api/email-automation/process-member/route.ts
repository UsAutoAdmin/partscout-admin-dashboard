import { NextResponse } from "next/server";
import { createPickSheetForNewMember } from "@/lib/new-member/pick-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      yardUrl: string;
      yardName: string;
      yardCity?: string;
      memberName: string;
      memberId: string;
    };

    const { yardUrl, yardName, yardCity, memberName, memberId } = body;
    if (!yardUrl) return NextResponse.json({ error: "yardUrl required" }, { status: 400 });

    const result = await createPickSheetForNewMember({
      yardUrl,
      yardName,
      yardCity,
      memberName,
    });

    if (!result.ok) {
      const status =
        result.step === "admin_user"
          ? 500
          : result.step === "extract"
            ? 502
            : result.step === "vehicles" || result.step === "match"
              ? 422
              : 500;
      return NextResponse.json({ error: result.message }, { status });
    }

    return NextResponse.json({
      success: true,
      memberId,
      vehicles: result.vehicles,
      matchedParts: result.matchedParts,
      pickSheetId: result.pickSheetId,
      shareToken: result.shareToken,
      shareUrl: result.sharePath,
    });
  } catch (err) {
    console.error("[process-member]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      { status: 500 },
    );
  }
}
