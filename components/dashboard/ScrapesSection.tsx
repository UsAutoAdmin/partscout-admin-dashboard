"use client";

import { useState, useCallback } from "react";
import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { fmtNum } from "@/lib/format";
import ScraperFleetSection from "./scraper-fleet/ScraperFleetSection";
import { useFleetStatus } from "./scraper-fleet/useFleetStatus";

interface ScrapesSectionProps {
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
  topPipelineRows: unknown[];
  warnings: string[];
}

export default function ScrapesSection(props: ScrapesSectionProps) {
  const [metrics, setMetrics] = useState({
    table8Total: props.table8Total,
    table9Total: props.table9Total,
    activeCompleted: props.activeCompleted,
    activeCompletionPct: props.activeCompletionPct,
    soldEligible: props.soldEligible,
    soldCompleted: props.soldCompleted,
    soldCompletionPct: props.soldCompletionPct,
    verificationEligible: props.verificationEligible,
    verificationCompleted: props.verificationCompleted,
    verificationCompletionPct: props.verificationCompletionPct,
    confidenceHigh: props.confidenceHigh,
    confidenceHighPct: props.confidenceHighPct,
    activeZeroCount: props.activeZeroCount,
    soldZeroCount: props.soldZeroCount,
    warnings: props.warnings,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const refreshMetrics = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/scrapes/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics({
          table8Total: data.table8Total ?? metrics.table8Total,
          table9Total: data.table9Total ?? metrics.table9Total,
          activeCompleted: data.activeCompleted ?? metrics.activeCompleted,
          activeCompletionPct: data.activeCompletionPct ?? metrics.activeCompletionPct,
          soldEligible: data.soldEligible ?? metrics.soldEligible,
          soldCompleted: data.soldCompleted ?? metrics.soldCompleted,
          soldCompletionPct: data.soldCompletionPct ?? metrics.soldCompletionPct,
          verificationEligible: data.verificationEligible ?? metrics.verificationEligible,
          verificationCompleted: data.verificationCompleted ?? metrics.verificationCompleted,
          verificationCompletionPct: data.verificationCompletionPct ?? metrics.verificationCompletionPct,
          confidenceHigh: data.confidenceHigh ?? metrics.confidenceHigh,
          confidenceHighPct: data.confidenceHighPct ?? metrics.confidenceHighPct,
          activeZeroCount: data.activeZeroCount ?? metrics.activeZeroCount,
          soldZeroCount: data.soldZeroCount ?? metrics.soldZeroCount,
          warnings: data.warnings ?? metrics.warnings,
        });
        setLastRefreshed(
          new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
        );
      }
    } catch {}
    setRefreshing(false);
  }, [metrics]);

  const fleet = useFleetStatus();

  const soldRate = fleet.machines.reduce((sum, m) => sum + (m.metrics?.sold?.rateNum ?? 0), 0);
  const activeRate = fleet.machines.reduce((sum, m) => sum + (m.metrics?.active?.rateNum ?? 0), 0);
  const soldWrites5m = fleet.machines.reduce((sum, m) => sum + (m.metrics?.sold?.dbWritesWindow ?? 0), 0);
  const activeWrites5m = fleet.machines.reduce((sum, m) => sum + (m.metrics?.active?.dbWritesWindow ?? 0), 0);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader title="Scrape Pipeline" subtitle="Track table 8 → table 9 coverage, sold progression, verification quality, and local scraper control." />
        <div className="flex items-center gap-3 flex-shrink-0">
          {lastRefreshed && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Updated {lastRefreshed}
            </span>
          )}
          <button
            onClick={refreshMetrics}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <svg
              className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {metrics.warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">Metric warnings</div>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6">
            {metrics.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Sold writes / min" value={soldRate.toFixed(1)} color="brand" subtext="rolling 60s across all minis" />
        <MetricCard label="Active writes / min" value={activeRate.toFixed(1)} color="success" subtext="rolling 60s across all minis" />
        <MetricCard label="Sold writes (5 min)" value={fmtNum(soldWrites5m)} color="brand" subtext="cumulative last 5 minutes" />
        <MetricCard label="Active writes (5 min)" value={fmtNum(activeWrites5m)} color="success" subtext="cumulative last 5 minutes" />
        <MetricCard label="Table 8 Total" value={fmtNum(metrics.table8Total)} />
        <MetricCard label="Table 9 Rows" value={fmtNum(metrics.table9Total)} color="brand" subtext="materialized scrape records" />
        <MetricCard label="Active Captured" value={fmtNum(metrics.activeCompleted)} color="success" subtext={`${metrics.activeCompletionPct}% of table 8`} />
        <MetricCard label="Active = 0" value={fmtNum(metrics.activeZeroCount)} color="warning" subtext="searched but no active results" />
        <MetricCard label="Sold Eligible" value={fmtNum(metrics.soldEligible)} color="info" subtext="has sold_link / active > 0" />
        <MetricCard label="Sold Complete" value={fmtNum(metrics.soldCompleted)} color="success" subtext={`${metrics.soldCompletionPct}% of eligible`} />
        <MetricCard label="Sold = 0" value={fmtNum(metrics.soldZeroCount)} color="warning" subtext="scraped but no sold results" />
        <MetricCard label="Verification Eligible" value={fmtNum(metrics.verificationEligible)} color="brand" subtext="sell-through > 60%" />
        <MetricCard label="Verified" value={fmtNum(metrics.verificationCompleted)} color="success" subtext={`${metrics.verificationCompletionPct}% of eligible`} />
        <MetricCard label="Confidence > 80%" value={fmtNum(metrics.confidenceHigh)} color="success" subtext={`${metrics.confidenceHighPct}% of eligible`} />
      </div>

      <ScraperFleetSection fleet={fleet} />
    </section>
  );
}
