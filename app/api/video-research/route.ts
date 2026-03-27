import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getServiceRoleClient();

  const [{ count: total }, { data: rows, error }] = await Promise.all([
    supabase.from("Video_Parts_for_research").select("*", { count: "exact", head: true }),
    supabase.from("Video_Parts_for_research").select("*").order("sell_through", { ascending: false }).limit(1000),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const safe = rows ?? [];
  const len = safe.length || 1;
  const avgSellThrough = safe.reduce((s, r) => s + (Number(r.sell_through) || 0), 0) / len;
  const avgConfidence = safe.reduce((s, r) => s + (Number(r.sold_confidence) || 0), 0) / len;
  const totalActive = safe.reduce((s, r) => s + (Number(r.active) || 0), 0);
  const totalSold = safe.reduce((s, r) => s + (Number(r.sold) || 0), 0);

  return NextResponse.json({
    total: total ?? 0,
    avgSellThrough: Math.round(avgSellThrough * 10) / 10,
    avgConfidence: Math.round(avgConfidence * 100),
    totalActive,
    totalSold,
    rows: safe,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const body = await req.json();
  const { id, active, sold, sell_price } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (active !== undefined) updates.active = Number(active);
  if (sold !== undefined) updates.sold = Number(sold);
  if (sell_price !== undefined) updates.sell_price = sell_price === "" || sell_price === null ? null : Number(sell_price);

  if (active !== undefined || sold !== undefined) {
    const newActive = active !== undefined ? Number(active) : undefined;
    const newSold = sold !== undefined ? Number(sold) : undefined;

    if (newActive !== undefined || newSold !== undefined) {
      const { data: current } = await supabase
        .from("Video_Parts_for_research")
        .select("active, sold")
        .eq("id", id)
        .single();

      const finalActive = newActive ?? Number(current?.active) ?? 0;
      const finalSold = newSold ?? Number(current?.sold) ?? 0;
      updates.sell_through = finalActive > 0 ? Math.round((finalSold / finalActive) * 10000) / 100 : 0;
    }
  }

  const { data, error } = await supabase
    .from("Video_Parts_for_research")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
