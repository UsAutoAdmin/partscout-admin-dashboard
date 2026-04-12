import { NextResponse } from "next/server";
import { getScraperFleetStatus } from "@/lib/scraper-fleet";
import { getServiceRoleClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getPipelineCounts() {
  const db = getServiceRoleClient();

  const [deepScraped, clustered, scored, scoredParts, totalEligible] =
    await Promise.all([
      db
        .from("9_Octoparse_Scrapes")
        .select("*", { count: "exact", head: true })
        .eq("deep_scraped", true),
      db
        .from("9_Octoparse_Scrapes")
        .select("*", { count: "exact", head: true })
        .eq("variation_clustered", true),
      db
        .from("9_Octoparse_Scrapes")
        .select("*", { count: "exact", head: true })
        .eq("scored", true),
      db
        .from("scored_parts")
        .select("*", { count: "exact", head: true }),
      db
        .from("9_Octoparse_Scrapes")
        .select("*", { count: "exact", head: true })
        .gt("sold_confidence", 0.7)
        .gt("sell_through", 60)
        .not("sold", "is", null)
        .neq("sold", "0"),
    ]);

  return {
    deepScraped: deepScraped.count ?? 0,
    clustered: clustered.count ?? 0,
    scored: scored.count ?? 0,
    scoredParts: scoredParts.count ?? 0,
    totalEligible: totalEligible.count ?? 0,
  };
}

export async function GET() {
  try {
    const [fleet, pipeline] = await Promise.all([
      getScraperFleetStatus(),
      getPipelineCounts(),
    ]);

    return NextResponse.json({ fleet, pipeline });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
