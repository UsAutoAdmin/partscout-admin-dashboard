"use client";

import { useEffect, useState, useCallback } from "react";
import { MetricCard } from "@/components/MetricCard";
import SectionHeader from "@/components/SectionHeader";
import { fmtNum } from "@/lib/format";

interface ScoredPart {
  id: string;
  scrape_id: string;
  variation_id: string | null;
  search_term: string;
  variation_name: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
  part_name: string | null;
  avg_sell_price: number;
  median_sell_price: number;
  cog: number;
  profit_margin: number;
  profit_ratio: number;
  sell_through: number;
  sold_confidence: number;
  sold_volume: number;
  price_consistency: number;
  composite_score: number;
  best_image_url: string | null;
  best_listing_title: string | null;
  cog_matched_name: string | null;
  cog_match_score: number | null;
  status: string;
  approved: boolean;
  created_at: string;
}

interface Stats {
  totalScored: number;
  totalApproved: number;
  avgProfitRatio: number;
  avgSellPrice: number;
}

interface DetailData {
  part: ScoredPart;
  variations: Array<{
    id: string;
    variation_name: string;
    avg_price: number;
    median_price: number;
    min_price: number;
    max_price: number;
    listing_count: number;
    best_image_url: string;
    is_highest_value: boolean;
  }>;
  listings: Array<{
    id: string;
    title: string;
    price: number;
    image_url: string;
    sold_date: string;
  }>;
}

type SortKey =
  | "composite_score"
  | "profit_ratio"
  | "avg_sell_price"
  | "cog"
  | "profit_margin"
  | "sell_through"
  | "sold_volume"
  | "sold_confidence"
  | "price_consistency";
type SortDir = "asc" | "desc";

function buildSoldUrl(searchTerm: string): string {
  const nkw = encodeURIComponent(searchTerm).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc&LH_Sold=1`;
}

export default function PartFinderClient() {
  const [rows, setRows] = useState<ScoredPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ totalScored: 0, totalApproved: 0, avgProfitRatio: 0, avgSellPrice: 0 });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approvedFilter, setApprovedFilter] = useState(false);
  const [minRatio, setMinRatio] = useState(3);

  const loadRows = useCallback(async () => {
    const params = new URLSearchParams({
      limit: "500",
      sort: sortKey,
      dir: sortDir,
    });
    if (search) params.set("q", search);
    if (minRatio > 0) params.set("minRatio", String(minRatio));
    if (approvedFilter) params.set("approved", "true");

    const res = await fetch(`/api/part-finder?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setStats(data.stats ?? stats);
  }, [sortKey, sortDir, search, minRatio, approvedFilter]);

  useEffect(() => {
    loadRows().finally(() => setLoading(false));
  }, [loadRows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const toggleApprove = useCallback(async (id: string, current: boolean) => {
    const next = !current;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, approved: next } : r)));
    await fetch("/api/part-finder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approved: next }),
    });
  }, []);

  const expandRow = useCallback(async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetailData(null); return; }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/part-finder/${id}`);
      setDetailData(await res.json());
    } catch { setDetailData(null); }
    setDetailLoading(false);
  }, [expandedId]);

  return (
    <section className="space-y-6">
      <SectionHeader title="Part Finder" subtitle="Top profitable parts ranked by composite score. Click a row to expand details." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Total Scored" value={fmtNum(stats.totalScored)} color="brand" />
        <MetricCard label="Approved" value={fmtNum(stats.totalApproved)} color={stats.totalApproved > 0 ? "success" : "warning"} />
        <MetricCard label="Avg Profit Ratio" value={`${stats.avgProfitRatio}x`} color="success" />
        <MetricCard label="Avg Sell Price" value={`$${stats.avgSellPrice}`} color="info" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          Min Ratio
          <input
            type="number"
            value={minRatio}
            onChange={(e) => setMinRatio(Number(e.target.value))}
            className="w-14 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] px-2 py-1.5 text-xs text-gray-900 dark:text-gray-200 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            min={0}
            step={0.5}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={approvedFilter}
            onChange={(e) => setApprovedFilter(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500"
          />
          Approved only
        </label>
        <button
          onClick={() => loadRows()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <a
          href="/api/part-finder/export"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </a>
        <span className="text-xs text-gray-400 dark:text-gray-500">{rows.length} parts</span>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-hidden">
          <table className="w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "36px" }} />
              <col style={{ width: "32px" }} />
              <col />
              <col style={{ width: "12%" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "60px" }} />
              <col style={{ width: "58px" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "60px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "56px" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "50px" }} />
            </colgroup>
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <Th align="center">
                  <svg className="h-3.5 w-3.5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </Th>
                <Th></Th>
                <Th>#</Th>
                <ThSort col="composite_score" label="Part" current={sortKey} dir={sortDir} toggle={toggleSort} />
                <Th>Variation</Th>
                <ThSort col="avg_sell_price" label="Sell $" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border />
                <ThSort col="cog" label="COG $" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" />
                <ThSort col="profit_ratio" label="Ratio" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" />
                <ThSort col="profit_margin" label="Profit" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border />
                <ThSort col="sell_through" label="S/T" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" />
                <ThSort col="sold_volume" label="Vol" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" />
                <ThSort col="sold_confidence" label="Conf" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border />
                <ThSort col="composite_score" label="Score" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" />
                <Th align="center" border>Verify</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-sm text-gray-400">
                    <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-brand-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading scored parts...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={14} className="py-16 text-center text-sm text-gray-400">No scored parts found. Run the pipeline to generate scores.</td></tr>
              ) : rows.map((row, i) => (
                <PartRow
                  key={row.id}
                  row={row}
                  index={i}
                  expanded={expandedId === row.id}
                  onToggle={() => expandRow(row.id)}
                  onApprove={toggleApprove}
                  detailData={expandedId === row.id ? detailData : null}
                  detailLoading={expandedId === row.id && detailLoading}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Part Row ───────────────────── */

function PartRow({ row, index, expanded, onToggle, onApprove, detailData, detailLoading }: {
  row: ScoredPart;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onApprove: (id: string, current: boolean) => void;
  detailData: DetailData | null;
  detailLoading: boolean;
}) {
  return (
    <>
      <tr
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input, a, button")) return;
          onToggle();
        }}
        className={`cursor-pointer transition-colors ${
          expanded
            ? "bg-brand-50/50 dark:bg-brand-500/[0.06]"
            : row.approved
              ? "bg-success-50/30 dark:bg-success-500/[0.03] hover:bg-success-50/60 dark:hover:bg-success-500/[0.06]"
              : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"
        }`}
      >
        <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          <ApproveCheckbox checked={row.approved} onToggle={() => onApprove(row.id, row.approved)} />
        </td>
        <td className="px-1 py-2">
          {row.best_image_url ? (
            <img src={row.best_image_url} alt="" className="w-7 h-7 object-cover rounded border border-gray-200 dark:border-gray-700" />
          ) : (
            <div className="w-7 h-7 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-white/[0.04]" />
          )}
        </td>
        <Td className="text-gray-400 dark:text-gray-600 tabular-nums">
          <span className="flex items-center gap-1">
            <svg className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            {index + 1}
          </span>
        </Td>
        <td className="px-2 py-2">
          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{row.part_name || row.search_term}</div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{[row.year, row.make, row.model].filter(Boolean).join(" ")}</div>
        </td>
        <Td className="text-gray-500 dark:text-gray-400 truncate overflow-hidden">{row.variation_name || "—"}</Td>
        <Td align="right" border className="tabular-nums text-success-600 dark:text-success-400 font-medium">${row.avg_sell_price}</Td>
        <Td align="right" className="tabular-nums text-red-500 dark:text-red-400">${row.cog}</Td>
        <Td align="right"><RatioPill value={row.profit_ratio} /></Td>
        <Td align="right" border className="tabular-nums text-success-600 dark:text-success-400">${row.profit_margin}</Td>
        <Td align="right"><SellThroughPill value={row.sell_through} /></Td>
        <Td align="right" className="tabular-nums">{row.sold_volume}</Td>
        <Td align="right" border><ConfidencePill value={row.sold_confidence} /></Td>
        <Td align="right" className="tabular-nums font-semibold text-brand-600 dark:text-brand-400">{row.composite_score.toFixed(3)}</Td>
        <Td align="center" border>
          <a
            href={buildSoldUrl(row.search_term)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md bg-blue-light-50 dark:bg-blue-light-500/10 px-2 py-1 text-xs font-medium text-blue-light-600 dark:text-blue-light-400 hover:bg-blue-light-100 dark:hover:bg-blue-light-500/20 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            <span className="sr-only">Verify</span>
          </a>
        </Td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50 dark:bg-white/[0.015]">
          <td colSpan={14} className="px-6 py-5">
            {detailLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <svg className="animate-spin h-4 w-4 text-brand-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading details...
              </div>
            ) : detailData ? (
              <ExpandedDetail data={detailData} />
            ) : (
              <div className="text-sm text-gray-400">No detail data available.</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────────────────── Expanded Detail ───────────────────── */

function ExpandedDetail({ data }: { data: DetailData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">COG Match</p>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4 space-y-2">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Matched: <span className="font-medium text-gray-900 dark:text-gray-100">{data.part.cog_matched_name || "—"}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Score: <span className="font-semibold text-gray-700 dark:text-gray-300">{data.part.cog_match_score ?? "—"}/100</span></span>
              <span>Price: <span className="font-semibold text-red-500 dark:text-red-400">${data.part.cog}</span></span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Confidence: <ConfidencePill value={data.part.sold_confidence} /></span>
              <span>Consistency: <span className="font-semibold">{(data.part.price_consistency * 100).toFixed(0)}%</span></span>
            </div>
          </div>
        </div>

        {data.variations.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Variations ({data.variations.length})</p>
            <div className="space-y-1.5">
              {data.variations.map((v) => (
                <div
                  key={v.id}
                  className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-3 flex justify-between items-center ${
                    v.is_highest_value ? "ring-1 ring-warning-400/50 dark:ring-warning-500/30" : ""
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                    {v.variation_name}
                    {v.is_highest_value && (
                      <span className="ml-2 inline-block rounded-full bg-warning-50 dark:bg-warning-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-600 dark:text-warning-400">BEST</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    ${v.avg_price} avg · {v.listing_count} sold · ${v.min_price}–${v.max_price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.listings.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Sold Listings ({data.listings.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {data.listings.slice(0, 12).map((l) => (
              <div key={l.id} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
                {l.image_url && (
                  <img src={l.image_url} alt="" className="w-full h-24 object-cover" />
                )}
                <div className="p-2">
                  <div className="text-[11px] text-gray-600 dark:text-gray-300 truncate">{l.title}</div>
                  <div className="text-xs font-semibold tabular-nums text-success-600 dark:text-success-400">${l.price}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500">{l.sold_date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <a
        href={buildSoldUrl(data.part.search_term)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        View Sold Listings on eBay
      </a>
    </div>
  );
}

/* ───────────────────── Approve Checkbox ───────────────────── */

function ApproveCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className="group flex items-center justify-center">
      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
        checked
          ? "bg-success-500 border-success-500 dark:bg-success-500 dark:border-success-500"
          : "border-gray-300 dark:border-gray-600 group-hover:border-brand-500 dark:group-hover:border-brand-400"
      }`}>
        {checked && (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </button>
  );
}

/* ───────────────────── Shared Table Primitives ───────────────────── */

function Th({ children, align, border, className }: {
  children?: React.ReactNode;
  align?: "left" | "center" | "right";
  border?: boolean;
  className?: string;
}) {
  return (
    <th className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${border ? "border-l border-gray-200 dark:border-gray-800" : ""} ${className ?? ""}`}>
      {children}
    </th>
  );
}

function ThSort({ label, col, current, dir, toggle, align, border }: {
  label: string;
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
      className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors hover:text-gray-900 dark:hover:text-gray-200 ${active ? "text-gray-900 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"} ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`}
    >
      {label}
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
    <td className={`px-2 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${border ? "border-l border-gray-200 dark:border-gray-800" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

/* ───────────────────── Pills ───────────────────── */

function RatioPill({ value }: { value: number }) {
  let bg: string, text: string;
  if (value >= 8) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-600 dark:text-success-400"; }
  else if (value >= 5) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-500 dark:text-success-400"; }
  else { bg = "bg-warning-50 dark:bg-warning-500/10"; text = "text-warning-600 dark:text-warning-400"; }
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${bg} ${text}`}>{value}x</span>;
}

function SellThroughPill({ value }: { value: number }) {
  let bg: string, text: string;
  if (value >= 200) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-600 dark:text-success-400"; }
  else if (value >= 100) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-500 dark:text-success-400"; }
  else { bg = "bg-warning-50 dark:bg-warning-500/10"; text = "text-warning-600 dark:text-warning-400"; }
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${bg} ${text}`}>{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}%</span>;
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let bg: string, text: string;
  if (pct >= 95) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-600 dark:text-success-400"; }
  else if (pct >= 85) { bg = "bg-blue-light-50 dark:bg-blue-light-500/10"; text = "text-blue-light-600 dark:text-blue-light-400"; }
  else { bg = "bg-warning-50 dark:bg-warning-500/10"; text = "text-warning-600 dark:text-warning-400"; }
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${bg} ${text}`}>{pct}%</span>;
}
