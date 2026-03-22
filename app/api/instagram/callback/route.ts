import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchIgProfile } from "@/lib/instagram";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    const reason = req.nextUrl.searchParams.get("error_reason") ?? error ?? "unknown";
    return NextResponse.redirect(
      new URL(`/scheduler?ig_error=${encodeURIComponent(reason)}`, req.url)
    );
  }

  try {
    const { accessToken, expiresIn, userId } = await exchangeCodeForToken(code);
    const profile = await fetchIgProfile(accessToken, userId);

    const supabase = getServiceRoleClient();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await supabase.from("instagram_accounts").upsert(
      {
        ig_user_id: userId,
        ig_username: profile.username,
        access_token: accessToken,
        token_expires_at: expiresAt,
      },
      { onConflict: "ig_user_id" }
    );

    return NextResponse.redirect(new URL("/scheduler?ig_connected=1", req.url));
  } catch (e: any) {
    console.error("[instagram/callback]", e);
    return NextResponse.redirect(
      new URL(`/scheduler?ig_error=${encodeURIComponent(e.message)}`, req.url)
    );
  }
}
