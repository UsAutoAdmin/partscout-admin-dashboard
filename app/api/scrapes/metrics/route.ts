import { NextResponse } from "next/server";
import { fetchScrapePipelineMetrics } from "@/lib/scrapes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metrics = await fetchScrapePipelineMetrics();
    return NextResponse.json(metrics);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
