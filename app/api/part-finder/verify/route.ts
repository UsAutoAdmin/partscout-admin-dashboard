import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function buildActiveUrl(searchTerm: string): string {
  const nkw = encodeURIComponent(searchTerm).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc`;
}

function buildSoldUrl(searchTerm: string): string {
  const nkw = encodeURIComponent(searchTerm).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc&LH_Sold=1&LH_Complete=1`;
}

function extractCount(html: string): number {
  const match = html.match(/srp-controls__count-heading[^>]*>([^<]*)/);
  if (match) {
    const numMatch = match[1].replace(/,/g, "").match(/(\d+)/);
    if (numMatch) return parseInt(numMatch[1], 10);
  }
  const altMatch = html.match(/(\d[\d,]*)\+?\s*results/i);
  if (altMatch) return parseInt(altMatch[1].replace(/,/g, ""), 10);
  return 0;
}

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getServiceRoleClient();
  const { data: part } = await supabase
    .from("scored_parts")
    .select("id, search_term, sell_through, sold_volume")
    .eq("id", id)
    .single();

  if (!part) return NextResponse.json({ error: "Part not found" }, { status: 404 });

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  const [activeRes, soldRes] = await Promise.all([
    fetch(buildActiveUrl(part.search_term), { headers }).then((r) => r.text()).catch(() => ""),
    fetch(buildSoldUrl(part.search_term), { headers }).then((r) => r.text()).catch(() => ""),
  ]);

  const activeCount = extractCount(activeRes);
  const soldCount = extractCount(soldRes);
  const newSellThrough = activeCount > 0 ? Math.round((soldCount / activeCount) * 100 * 100) / 100 : 0;
  const origST = part.sell_through ?? 0;
  const stChange = origST > 0 ? Math.round(((newSellThrough - origST) / origST) * 100 * 10) / 10 : 0;

  return NextResponse.json({
    id: part.id,
    activeCount,
    soldCount,
    newSellThrough,
    originalSellThrough: origST,
    stChange,
    consistent: Math.abs(stChange) <= 50,
  });
}
