import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = getServiceRoleClient();
  const url = new URL(req.url);
  const approvedOnly = url.searchParams.get("approved") !== "false";

  let query = supabase
    .from("scored_parts")
    .select(
      "search_term, variation_name, year, make, model, part_name, avg_sell_price, median_sell_price, cog, profit_margin, profit_ratio, sell_through, sold_confidence, sold_volume, price_consistency, composite_score, best_image_url, cog_matched_name, status, approved"
    )
    .order("composite_score", { ascending: false });

  if (approvedOnly) {
    query = query.eq("approved", true);
  }

  const { data, error } = await query.limit(10000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];

  const header = [
    "search_term", "variation_name", "year", "make", "model", "part_name",
    "avg_sell_price", "median_sell_price", "cog", "profit_margin", "profit_ratio",
    "sell_through", "sold_confidence", "sold_volume", "price_consistency",
    "composite_score", "best_image_url", "cog_matched_name", "status", "approved",
  ];

  const csvLines = [header.join(",")];
  for (const row of rows) {
    const values = header.map((key) => {
      const val = (row as Record<string, unknown>)[key];
      if (val == null) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    });
    csvLines.push(values.join(","));
  }

  return new NextResponse(csvLines.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="scored-parts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
