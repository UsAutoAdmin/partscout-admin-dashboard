import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const url = new URL(req.url);

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const sortBy = url.searchParams.get("sort") ?? "composite_score";
  const sortDir = url.searchParams.get("dir") === "asc" ? true : false;
  const search = url.searchParams.get("q") ?? "";
  const minRatio = Number(url.searchParams.get("minRatio") ?? 0);
  const approvedOnly = url.searchParams.get("approved") === "true";

  let query = supabase
    .from("scored_parts")
    .select("*", { count: "exact" });

  if (search) {
    query = query.or(
      `search_term.ilike.%${search}%,part_name.ilike.%${search}%,variation_name.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%`
    );
  }

  if (minRatio > 0) {
    query = query.gte("profit_ratio", minRatio);
  }

  if (approvedOnly) {
    query = query.eq("approved", true);
  }

  const validSortColumns = [
    "composite_score", "profit_ratio", "avg_sell_price", "cog",
    "profit_margin", "sell_through", "sold_confidence", "sold_volume",
    "price_consistency", "created_at",
  ];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : "composite_score";

  query = query
    .order(sortColumn, { ascending: sortDir })
    .range(offset, offset + limit - 1);

  const { data: rawData, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate: keep only the highest composite_score per search_term+variation_name
  const seen = new Map<string, (typeof rawData extends (infer T)[] | null ? T : never)>();
  for (const row of rawData ?? []) {
    const key = `${row.search_term}||${row.variation_name ?? ""}`;
    const existing = seen.get(key);
    if (!existing || (row.composite_score ?? 0) > (existing.composite_score ?? 0)) {
      seen.set(key, row);
    }
  }
  const data = Array.from(seen.values());

  // Summary stats
  const [
    { count: totalCount },
    { count: approvedCount },
    { data: avgData },
  ] = await Promise.all([
    supabase.from("scored_parts").select("*", { count: "exact", head: true }),
    supabase.from("scored_parts").select("*", { count: "exact", head: true }).eq("approved", true),
    supabase.from("scored_parts").select("avg_sell_price, cog, profit_ratio, composite_score").order("composite_score", { ascending: false }).limit(100),
  ]);

  const top100 = avgData ?? [];
  const avgProfitRatio = top100.length > 0
    ? top100.reduce((s, r) => s + Number(r.profit_ratio), 0) / top100.length
    : 0;
  const avgSellPrice = top100.length > 0
    ? top100.reduce((s, r) => s + Number(r.avg_sell_price), 0) / top100.length
    : 0;

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    stats: {
      totalScored: totalCount ?? 0,
      totalApproved: approvedCount ?? 0,
      avgProfitRatio: Math.round(avgProfitRatio * 100) / 100,
      avgSellPrice: Math.round(avgSellPrice * 100) / 100,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const body = await req.json();
  const { id, approved, status } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (approved !== undefined) updates.approved = Boolean(approved);
  if (status !== undefined) updates.status = String(status);

  const { data, error } = await supabase
    .from("scored_parts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
