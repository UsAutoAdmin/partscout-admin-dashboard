import { NextResponse } from "next/server";
import { getCommandState, processCommand } from "@/lib/command-center";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getCommandState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await processCommand(body?.message ?? "");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Command center failed" },
      { status: 500 },
    );
  }
}
