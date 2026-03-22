import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = buildAuthUrl();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json(
      { error: "Instagram app not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI." },
      { status: 500 }
    );
  }
}
