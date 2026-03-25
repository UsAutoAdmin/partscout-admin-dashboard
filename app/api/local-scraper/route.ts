import { NextResponse } from "next/server";
import { getLocalScraperStatus, restartLocalScraper, startLocalScraper, stopLocalScraper } from "@/lib/local-scraper";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLocalScraperStatus());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action === "start") return NextResponse.json(await startLocalScraper());
  if (action === "stop") return NextResponse.json(await stopLocalScraper());
  if (action === "restart") return NextResponse.json(await restartLocalScraper());

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
