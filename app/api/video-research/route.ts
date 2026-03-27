import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceRoleClient();

  const [
    { count: total },
    { data: rows, error },
  ] = await Promise.all([
    supabase
      .from("Video_Parts_for_research")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("Video_Parts_for_research")
      .select("*")
      .order("sell_through", { ascending: false })
      .limit(1000),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const avgSellThrough =
    rows && rows.length
      ? rows.reduce((s, r) => s + (Number(r.sell_through) || 0), 0) / rows.length
      : 0;

  const avgConfidence =
    rows && rows.length
      ? rows.reduce((s, r) => s + (Number(r.sold_confidence) || 0), 0) / rows.length
      : 0;

  const totalActive =
    rows?.reduce((s, r) => s + (Number(r.active) || 0), 0) ?? 0;

  const totalSold =
    rows?.reduce((s, r) => s + (Number(r.sold) || 0), 0) ?? 0;

  return NextResponse.json({
    total: total ?? 0,
    avgSellThrough: Math.round(avgSellThrough * 10) / 10,
    avgConfidence: Math.round(avgConfidence * 100),
    totalActive,
    totalSold,
    rows: rows ?? [],
  });
}
