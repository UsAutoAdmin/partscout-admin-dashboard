"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "../Table";
import { fmtNum } from "@/lib/format";

interface ScrapeRow {
  original_url: string;
  active: number;
  sold: number | null;
  sell_through: number | null;
}

interface ScrapesSectionProps {
  totalScrapes: number;
  activeScrapes: number;
  dirTotal: number;
  dirVerified: number;
  topScrapes: ScrapeRow[];
}

export default function ScrapesSection({
  totalScrapes, activeScrapes, dirTotal, dirVerified, topScrapes,
}: ScrapesSectionProps) {
  return (
    <section>
      <SectionHeader title="Octoparse Scrapes" subtitle="eBay market data" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <MetricCard label="Total Records" value={fmtNum(totalScrapes)} />
        <MetricCard label="Active > 0" value={fmtNum(activeScrapes)} color="success" subtext="has eBay listings" />
        <MetricCard label="Coverage" value={`${totalScrapes ? Math.round((activeScrapes / totalScrapes) * 100) : 0}%`} color="info" />
        <MetricCard label="Junkyard Locations" value={fmtNum(dirTotal)} subtext={`${dirVerified} verified`} />
      </div>

      {topScrapes.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Top Active Parts (by eBay Listings)</h4>
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">URL</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Active</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Sold</TableCell>
                  <TableCell isHeader className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Sell-Through</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topScrapes.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-3 max-w-xs">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">{row.original_url}</p>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white/90">{row.active}</TableCell>
                    <TableCell className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">{row.sold ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3 text-right">
                      {row.sell_through != null ? (
                        <span className={`font-semibold ${row.sell_through >= 50 ? "text-success-600 dark:text-success-400" : row.sell_through >= 25 ? "text-warning-600 dark:text-warning-400" : "text-error-600 dark:text-error-400"}`}>
                          {row.sell_through}%
                        </span>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}
