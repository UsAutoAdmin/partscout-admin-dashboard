import { NextResponse } from "next/server";
import { controlScraperFleetMachine, getScraperFleetStatus } from "@/lib/scraper-fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getScraperFleetStatus());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const key = body?.key;
  const action = body?.action;

  if (!key || !action) {
    return NextResponse.json({ error: "Missing key or action" }, { status: 400 });
  }

  try {
    const result = await controlScraperFleetMachine(key, action);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fleet control failed" }, { status: 500 });
  }
}
