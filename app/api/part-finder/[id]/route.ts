import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getServiceRoleClient();
  const { id } = params;

  const { data: part } = await supabase
    .from("scored_parts")
    .select("*")
    .eq("id", id)
    .single();

  if (!part) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ data: variations }, { data: listings }] = await Promise.all([
    supabase
      .from("part_variations")
      .select("*")
      .eq("scrape_id", part.scrape_id)
      .order("avg_price", { ascending: false }),
    supabase
      .from("sold_listing_details")
      .select("*")
      .eq("scrape_id", part.scrape_id)
      .order("price", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    part,
    variations: variations ?? [],
    listings: listings ?? [],
  });
}
