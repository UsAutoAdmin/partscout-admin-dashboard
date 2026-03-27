"use client";

import { useEffect, useState, useMemo } from "react";
import { MetricCard } from "@/components/MetricCard";
import SectionHeader from "@/components/SectionHeader";
import { fmtNum } from "@/lib/format";

interface ResearchPart {
  id: string;
  octoparse_id: string;
  year: string;
  make: string;
  model: string;
  part: string;
  active: number;
  sold: number;
  sell_through: number;
  sold_confidence: number;
  original_url: string;
  sold_link: string | null;
  sold_verified_at: string | null;
  created_at: string;
}

type SortKey = "year" | "make" | "model" | "part" | "active" | "sold" | "sell_through" | "sold_confidence";
type SortDir = "asc" | "desc";

export default function VideoResearchClient() {
  const [rows, setRows] = useState<ResearchPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    total: 0,
    avgSellThrough: 0,
    avgConfidence: 0,
    totalActive: 0,
    totalSold: 0,
  });

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sell_through");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    fetch("/api/video-research")
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setMetrics({
          total: data.total,
          avgSellThrough: data.avgSellThrough,
          avgConfidence: data.avgConfidence,
          totalActive: data.totalActive,
          totalSold: data.totalSold,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.year?.toLowerCase().includes(q) ||
        r.make?.toLowerCase().includes(q) ||
        r.model?.toLowerCase().includes(q) ||
        r.part?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = (a as unknown as Record<string, string | number>)[sortKey];
      let bv: string | number = (b as unknown as Record<string, string | number>)[sortKey];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Video Research Parts"
        subtitle="1,000-part sample — sell-through 80–150%, confidence > 80%. Verify each on eBay."
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard label="Total Parts" value={fmtNum(metrics.total)} color="brand" />
        <MetricCard label="Avg Sell-Through" value={`${metrics.avgSellThrough}%`} color="success" />
        <MetricCard label="Avg Confidence" value={`${metrics.avgConfidence}%`} color="info" />
        <MetricCard label="Total Active" value={fmtNum(metrics.totalActive)} />
        <MetricCard label="Total Sold" value={fmtNum(metrics.totalSold)} color="success" />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search year, make, model, part..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] py-2 pl-10 pr-4 text-sm text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {filtered.length} of {rows.length} parts
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="min-w-full">
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <Th>#</Th>
                <ThSort col="year" current={sortKey} dir={sortDir} toggle={toggleSort}>Year</ThSort>
                <ThSort col="make" current={sortKey} dir={sortDir} toggle={toggleSort}>Make</ThSort>
                <ThSort col="model" current={sortKey} dir={sortDir} toggle={toggleSort}>Model</ThSort>
                <ThSort col="part" current={sortKey} dir={sortDir} toggle={toggleSort}>Part</ThSort>
                <ThSort col="active" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Active</ThSort>
                <ThSort col="sold" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">Sold</ThSort>
                <ThSort col="sell_through" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">Sell Through</ThSort>
                <ThSort col="sold_confidence" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Confidence</ThSort>
                <Th align="center" border>Verify</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm text-gray-400">
                    <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-brand-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading parts...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm text-gray-400">
                    No parts match your search.
                  </td>
                </tr>
              ) : (
                sorted.map((row, i) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <Td className="text-gray-400 dark:text-gray-600 tabular-nums">{i + 1}</Td>
                    <Td className="font-medium">{row.year}</Td>
                    <Td>{row.make}</Td>
                    <Td>{row.model}</Td>
                    <Td className="font-medium max-w-[260px] truncate">{row.part}</Td>
                    <Td align="right" border className="tabular-nums">{row.active}</Td>
                    <Td align="right" className="tabular-nums">{row.sold}</Td>
                    <Td align="right">
                      <SellThroughPill value={row.sell_through} />
                    </Td>
                    <Td align="right" border>
                      <ConfidencePill value={row.sold_confidence} />
                    </Td>
                    <Td align="center" border>
                      <a
                        href={row.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-blue-light-50 dark:bg-blue-light-500/10 px-2.5 py-1 text-xs font-medium text-blue-light-600 dark:text-blue-light-400 hover:bg-blue-light-100 dark:hover:bg-blue-light-500/20 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Verify
                      </a>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Th({ children, align, border, className }: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  border?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${border ? "border-l border-gray-200 dark:border-gray-800" : ""} ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function ThSort({ children, col, current, dir, toggle, align, border }: {
  children: React.ReactNode;
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  toggle: (k: SortKey) => void;
  align?: "left" | "center" | "right";
  border?: boolean;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => toggle(col)}
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors hover:text-gray-900 dark:hover:text-gray-200 ${
        active ? "text-gray-900 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"
      } ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${
        border ? "border-l border-gray-200 dark:border-gray-800" : ""
      }`}
    >
      {children}
      {active ? (
        <span className="ml-1 text-brand-500 dark:text-brand-400">{dir === "asc" ? "↑" : "↓"}</span>
      ) : (
        <span className="ml-1 text-gray-300 dark:text-gray-700">↕</span>
      )}
    </th>
  );
}

function Td({ children, align, border, className }: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  border?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${border ? "border-l border-gray-200 dark:border-gray-800" : ""} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}

function SellThroughPill({ value }: { value: number }) {
  let bg: string;
  let text: string;
  if (value >= 120) {
    bg = "bg-success-50 dark:bg-success-500/10";
    text = "text-success-600 dark:text-success-400";
  } else if (value >= 100) {
    bg = "bg-success-50 dark:bg-success-500/10";
    text = "text-success-500 dark:text-success-400";
  } else {
    bg = "bg-warning-50 dark:bg-warning-500/10";
    text = "text-warning-600 dark:text-warning-400";
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${bg} ${text}`}>
      {value.toFixed(1)}%
    </span>
  );
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let bg: string;
  let text: string;
  if (pct >= 95) {
    bg = "bg-success-50 dark:bg-success-500/10";
    text = "text-success-600 dark:text-success-400";
  } else if (pct >= 85) {
    bg = "bg-blue-light-50 dark:bg-blue-light-500/10";
    text = "text-blue-light-600 dark:text-blue-light-400";
  } else {
    bg = "bg-warning-50 dark:bg-warning-500/10";
    text = "text-warning-600 dark:text-warning-400";
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${bg} ${text}`}>
      {pct}%
    </span>
  );
}
