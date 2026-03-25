import { getServiceRoleClient } from "@/lib/supabase";

const supabase = () => getServiceRoleClient();

export type ScrapePipelineMetrics = {
  table8Total: number;
  table9Total: number;
  activeCompleted: number;
  activeCompletionPct: number;
  soldEligible: number;
  soldCompleted: number;
  soldCompletionPct: number;
  verificationEligible: number;
  verificationCompleted: number;
  verificationCompletionPct: number;
  confidenceHigh: number;
  confidenceHighPct: number;
  activeZeroCount: number;
  soldZeroCount: number;
  topPipelineRows: Array<{
    original_url: string;
    active: string | null;
    sold: string | null;
    sell_through: number | null;
    sold_confidence: number | null;
    active_lastscraped: string | null;
    sold_lastscraped: string | null;
    sold_verified_at: string | null;
  }>;
};

export async function fetchScrapePipelineMetrics(): Promise<ScrapePipelineMetrics> {
  const [
    { count: table8Total },
    { count: table9Total },
    { count: activeCompleted },
    { count: activeZeroCount },
    { count: soldEligible },
    { count: soldCompleted },
    { count: soldZeroCount },
    { count: verificationEligible },
    { count: verificationCompleted },
    { count: confidenceHigh },
    { data: topPipelineRows },
  ] = await Promise.all([
    supabase().from("8_Research_Assistant").select("*", { count: "exact", head: true }),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).not("active", "is", null),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).eq("active", "0"),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).not("sold_link", "is", null),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).eq("sold_scraped", "true"),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).eq("sold", "0"),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).gt("sell_through", 60),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).not("sold_verified_at", "is", null),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).gt("sold_confidence", 0.8),
    supabase().from("9_Octoparse_Scrapes").select("original_url, active, sold, sell_through, sold_confidence, active_lastscraped, sold_lastscraped, sold_verified_at").order("sell_through", { ascending: false, nullsFirst: false }).limit(15),
  ]);

  const activeBase = table8Total ?? 0;
  const soldBase = soldEligible ?? 0;
  const verificationBase = verificationEligible ?? 0;

  return {
    table8Total: table8Total ?? 0,
    table9Total: table9Total ?? 0,
    activeCompleted: activeCompleted ?? 0,
    activeCompletionPct: activeBase ? Math.round(((activeCompleted ?? 0) / activeBase) * 1000) / 10 : 0,
    soldEligible: soldEligible ?? 0,
    soldCompleted: soldCompleted ?? 0,
    soldCompletionPct: soldBase ? Math.round(((soldCompleted ?? 0) / soldBase) * 1000) / 10 : 0,
    verificationEligible: verificationEligible ?? 0,
    verificationCompleted: verificationCompleted ?? 0,
    verificationCompletionPct: verificationBase ? Math.round(((verificationCompleted ?? 0) / verificationBase) * 1000) / 10 : 0,
    confidenceHigh: confidenceHigh ?? 0,
    confidenceHighPct: verificationBase ? Math.round(((confidenceHigh ?? 0) / verificationBase) * 1000) / 10 : 0,
    activeZeroCount: activeZeroCount ?? 0,
    soldZeroCount: soldZeroCount ?? 0,
    topPipelineRows: topPipelineRows ?? [],
  };
}
