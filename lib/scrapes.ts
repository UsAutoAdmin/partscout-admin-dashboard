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

async function exactCount(table: string, builder?: (q: any) => Promise<any> | any): Promise<number> {
  const base = supabase().from(table).select("id", { count: "exact", head: true });
  const res = builder ? await builder(base) : await base;
  if (res.error) throw new Error(`${table} exact count failed: ${res.error.message || res.statusText || 'unknown error'}`);
  return res.count ?? 0;
}

async function estimatedCount(table: string): Promise<number> {
  const res = await supabase().from(table).select("id", { count: "estimated", head: true });
  if (res.error) throw new Error(`${table} estimated count failed: ${res.error.message || res.statusText || 'unknown error'}`);
  return res.count ?? 0;
}

export async function fetchScrapePipelineMetrics(): Promise<ScrapePipelineMetrics> {
  const [
    table8Total,
    table9Total,
    activeCompleted,
    activeZeroCount,
    soldEligible,
    soldCompleted,
    soldZeroCount,
    verificationEligible,
    verificationCompleted,
    confidenceHigh,
    topRowsRes,
  ] = await Promise.all([
    estimatedCount("8_Research_Assistant"),
    exactCount("9_Octoparse_Scrapes"),
    exactCount("9_Octoparse_Scrapes", (q) => q.not("active", "is", null)),
    exactCount("9_Octoparse_Scrapes", (q) => q.eq("active", "0")),
    exactCount("9_Octoparse_Scrapes", (q) => q.not("sold_link", "is", null)),
    exactCount("9_Octoparse_Scrapes", (q) => q.eq("sold_scraped", "true")),
    exactCount("9_Octoparse_Scrapes", (q) => q.eq("sold", "0")),
    exactCount("9_Octoparse_Scrapes", (q) => q.gt("sell_through", 60)),
    exactCount("9_Octoparse_Scrapes", (q) => q.not("sold_verified_at", "is", null)),
    exactCount("9_Octoparse_Scrapes", (q) => q.gt("sold_confidence", 0.8)),
    supabase()
      .from("9_Octoparse_Scrapes")
      .select("original_url, active, sold, sell_through, sold_confidence, active_lastscraped, sold_lastscraped, sold_verified_at")
      .order("sell_through", { ascending: false, nullsFirst: false })
      .limit(15),
  ]);

  if (topRowsRes.error) {
    throw new Error(`Top pipeline rows query failed: ${topRowsRes.error.message}`);
  }

  return {
    table8Total,
    table9Total,
    activeCompleted,
    activeCompletionPct: table8Total ? Math.round((activeCompleted / table8Total) * 1000) / 10 : 0,
    soldEligible,
    soldCompleted,
    soldCompletionPct: soldEligible ? Math.round((soldCompleted / soldEligible) * 1000) / 10 : 0,
    verificationEligible,
    verificationCompleted,
    verificationCompletionPct: verificationEligible ? Math.round((verificationCompleted / verificationEligible) * 1000) / 10 : 0,
    confidenceHigh,
    confidenceHighPct: verificationEligible ? Math.round((confidenceHigh / verificationEligible) * 1000) / 10 : 0,
    activeZeroCount,
    soldZeroCount,
    topPipelineRows: topRowsRes.data ?? [],
  };
}
