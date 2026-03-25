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
  warnings: string[];
};

async function countWithFallback(table: string, label: string, builder?: (q: any) => Promise<any> | any, modes: Array<"exact" | "planned" | "estimated"> = ["exact", "planned", "estimated"]) {
  const warnings: string[] = [];

  for (const mode of modes) {
    const base = supabase().from(table).select("id", { count: mode, head: true });
    const res = builder ? await builder(base) : await base;
    if (!res.error && typeof res.count === "number") {
      if (mode !== modes[0]) warnings.push(`${label} used ${mode} count fallback.`);
      return { count: res.count, warnings };
    }
    warnings.push(`${label} ${mode} count failed${res?.statusText ? ` (${res.statusText})` : ""}.`);
  }

  return { count: 0, warnings };
}

export async function fetchScrapePipelineMetrics(): Promise<ScrapePipelineMetrics> {
  const warningBag: string[] = [];

  const [
    table8Res,
    table9Res,
    activeCompletedRes,
    activeZeroRes,
    soldEligibleRes,
    soldCompletedRes,
    soldZeroRes,
    verificationEligibleRes,
    verificationCompletedRes,
    confidenceHighRes,
    topRowsRes,
  ] = await Promise.all([
    countWithFallback("8_Research_Assistant", "Table 8 total", undefined, ["estimated", "planned"]),
    countWithFallback("9_Octoparse_Scrapes", "Table 9 total"),
    countWithFallback("9_Octoparse_Scrapes", "Active completed", (q) => q.not("active", "is", null)),
    countWithFallback("9_Octoparse_Scrapes", "Active zero count", (q) => q.eq("active", "0")),
    countWithFallback("9_Octoparse_Scrapes", "Sold eligible", (q) => q.not("sold_link", "is", null)),
    countWithFallback("9_Octoparse_Scrapes", "Sold completed", (q) => q.eq("sold_scraped", "true")),
    countWithFallback("9_Octoparse_Scrapes", "Sold zero count", (q) => q.eq("sold", "0")),
    countWithFallback("9_Octoparse_Scrapes", "Verification eligible", (q) => q.gt("sell_through", 60)),
    countWithFallback("9_Octoparse_Scrapes", "Verification completed", (q) => q.not("sold_verified_at", "is", null)),
    countWithFallback("9_Octoparse_Scrapes", "Confidence > 80%", (q) => q.gt("sold_confidence", 0.8)),
    supabase()
      .from("9_Octoparse_Scrapes")
      .select("original_url, active, sold, sell_through, sold_confidence, active_lastscraped, sold_lastscraped, sold_verified_at")
      .order("sell_through", { ascending: false, nullsFirst: false })
      .limit(15),
  ]);

  for (const result of [table8Res, table9Res, activeCompletedRes, activeZeroRes, soldEligibleRes, soldCompletedRes, soldZeroRes, verificationEligibleRes, verificationCompletedRes, confidenceHighRes]) {
    warningBag.push(...result.warnings);
  }

  if (topRowsRes.error) {
    warningBag.push(`Top pipeline rows query failed: ${topRowsRes.error.message || topRowsRes.statusText || 'unknown error'}`);
  }

  const table8Total = table8Res.count;
  const table9Total = table9Res.count;
  const activeCompleted = activeCompletedRes.count;
  const activeZeroCount = activeZeroRes.count;
  const soldEligible = soldEligibleRes.count;
  const soldCompleted = soldCompletedRes.count;
  const soldZeroCount = soldZeroRes.count;
  const verificationEligible = verificationEligibleRes.count;
  const verificationCompleted = verificationCompletedRes.count;
  const confidenceHigh = confidenceHighRes.count;

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
    warnings: Array.from(new Set(warningBag)).slice(0, 12),
  };
}
