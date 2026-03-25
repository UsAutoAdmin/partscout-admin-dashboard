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

type Table8Row = { id: string };
type Table9Row = {
  original_url: string;
  active: string | null;
  sold_link: string | null;
  sold_scraped: string | null;
  sold: string | null;
  sell_through: number | null;
  sold_confidence: number | null;
  active_lastscraped: string | null;
  sold_lastscraped: string | null;
  sold_verified_at: string | null;
};

function toNum(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function fetchScrapePipelineMetrics(): Promise<ScrapePipelineMetrics> {
  const [table8Res, table9Res, topRowsRes] = await Promise.all([
    supabase().from("8_Research_Assistant").select("id"),
    supabase().from("9_Octoparse_Scrapes").select("original_url, active, sold_link, sold_scraped, sold, sell_through, sold_confidence, active_lastscraped, sold_lastscraped, sold_verified_at"),
    supabase().from("9_Octoparse_Scrapes").select("original_url, active, sold, sell_through, sold_confidence, active_lastscraped, sold_lastscraped, sold_verified_at").order("sell_through", { ascending: false, nullsFirst: false }).limit(15),
  ]);

  if (table8Res.error) throw new Error(`Table 8 query failed: ${table8Res.error.message}`);
  if (table9Res.error) throw new Error(`Table 9 query failed: ${table9Res.error.message}`);
  if (topRowsRes.error) throw new Error(`Top pipeline rows query failed: ${topRowsRes.error.message}`);

  const table8 = (table8Res.data ?? []) as Table8Row[];
  const table9 = (table9Res.data ?? []) as Table9Row[];
  const topPipelineRows = (topRowsRes.data ?? []) as ScrapePipelineMetrics["topPipelineRows"];

  const activeCompleted = table9.filter((row) => row.active != null).length;
  const activeZeroCount = table9.filter((row) => toNum(row.active) === 0).length;
  const soldEligible = table9.filter((row) => !!row.sold_link).length;
  const soldCompleted = table9.filter((row) => row.sold_scraped === "true").length;
  const soldZeroCount = table9.filter((row) => toNum(row.sold) === 0).length;
  const verificationEligible = table9.filter((row) => (row.sell_through ?? -Infinity) > 60).length;
  const verificationCompleted = table9.filter((row) => row.sold_verified_at != null).length;
  const confidenceHigh = table9.filter((row) => (row.sold_confidence ?? -Infinity) > 0.8).length;

  const table8Total = table8.length;
  const table9Total = table9.length;

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
    topPipelineRows,
  };
}
