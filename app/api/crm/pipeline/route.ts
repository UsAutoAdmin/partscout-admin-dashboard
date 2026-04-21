import { NextResponse } from "next/server";
import { fetchPipelineRows } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await fetchPipelineRows();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
