import { NextResponse } from "next/server";
import { getConnectedAccount } from "@/lib/instagram";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const account = await getConnectedAccount();
    if (!account) return NextResponse.json({ connected: false });
    return NextResponse.json({
      connected: true,
      id: account.id,
      username: account.ig_username,
      expiresAt: account.token_expires_at,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
