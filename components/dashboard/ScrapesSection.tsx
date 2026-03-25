"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../Table";
import { fmtNum } from "@/lib/format";
import LocalScraperControl from "./LocalScraperControl";

interface PipelineRow {
  original_url: string;
  active: string | null;
  sold: string | null;
  sell_through: number | null;
  sold_confidence: number | null;
  active_lastscraped: string | null;
  sold_lastscraped: string | null;
  sold_verified_at: string | null;
}

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
  topPipelineRows: PipelineRow[];
  warnings: string[];
}

export default function ScrapesSection(props: ScrapesSectionProps) {
  const {
    table8Total,
    table9Total,
    activeCompleted,
    activeCompletionPct,
    soldEligible,
    soldCompleted,
    soldCompletionPct,
    verificationEligible,
    verificationCompleted,
    verificationCompletionPct,
    confidenceHigh,
    confidenceHighPct,
    activeZeroCount,
    soldZeroCount,
    topPipelineRows,
    warnings,
  } = props;

  return (
    <section className="space-y-6">
      <SectionHeader title="Scrape Pipeline" subtitle="Track table 8 → table 9 coverage, sold progression, verification quality, and local scraper control." />

      {warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">Metric warnings</div>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6">
            {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Table 8 Total" value={fmtNum(table8Total)} />
        <MetricCard label="Table 9 Rows" value={fmtNum(table9Total)} color="brand" subtext="materialized scrape records" />
        <MetricCard label="Active Captured" value={fmtNum(activeCompleted)} color="success" subtext={`${activeCompletionPct}% of table 8`} />
        <MetricCard label="Active = 0" value={fmtNum(activeZeroCount)} color="warning" subtext="searched but no active results" />
        <MetricCard label="Sold Eligible" value={fmtNum(soldEligible)} color="info" subtext="has sold_link / active > 0" />
        <MetricCard label="Sold Complete" value={fmtNum(soldCompleted)} color="success" subtext={`${soldCompletionPct}% of eligible`} />
        <MetricCard label="Sold = 0" value={fmtNum(soldZeroCount)} color="warning" subtext="scraped but no sold results" />
        <MetricCard label="Verification Eligible" value={fmtNum(verificationEligible)} color="brand" subtext="sell-through > 60%" />
        <MetricCard label="Verified" value={fmtNum(verificationCompleted)} color="success" subtext={`${verificationCompletionPct}% of eligible`} />
        <MetricCard label="Confidence > 80%" value={fmtNum(confidenceHigh)} color="success" subtext={`${confidenceHighPct}% of eligible`} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Pipeline quality sample</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Highest sell-through records with active, sold, and confidence visibility.</p>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">URL</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Active</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Sold</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Sell-Through</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Confidence</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPipelineRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-3 max-w-xs"><p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{row.original_url}</p></TableCell>
                    <TableCell className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white/90">{row.active ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">{row.sold ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3 text-right">{row.sell_through != null ? <span className={`font-semibold ${row.sell_through >= 60 ? "text-success-600 dark:text-success-400" : row.sell_through >= 25 ? "text-warning-600 dark:text-warning-400" : "text-error-600 dark:text-error-400"}`}>{row.sell_through}%</span> : "—"}</TableCell>
                    <TableCell className="px-5 py-3 text-right">{row.sold_confidence != null ? <span className={`font-semibold ${row.sold_confidence > 0.8 ? "text-success-600 dark:text-success-400" : "text-warning-600 dark:text-warning-400"}`}>{Math.round(row.sold_confidence * 100)}%</span> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Pipeline definitions</p>
          <div className="mt-4 space-y-4 text-sm text-gray-600 dark:text-gray-300">
            <div><strong className="text-gray-900 dark:text-white/90">Active completion</strong><div>Rows in table 9 where <code>active</code> has been written, compared against all rows in table 8.</div></div>
            <div><strong className="text-gray-900 dark:text-white/90">Sold completion</strong><div>Rows with a generated <code>sold_link</code> that also have <code>sold_scraped = true</code>.</div></div>
            <div><strong className="text-gray-900 dark:text-white/90">Verification eligibility</strong><div>Rows where <code>sell_through &gt; 60</code>, matching the local scraper’s Haiku trigger.</div></div>
            <div><strong className="text-gray-900 dark:text-white/90">Strong confidence</strong><div>Rows where <code>sold_confidence &gt; 0.8</code>.</div></div>
          </div>
        </div>
      </div>

      <LocalScraperControl />
    </section>
  );
}
