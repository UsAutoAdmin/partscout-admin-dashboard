"use client";

import { useMemo, useState } from "react";

export type ReleasePart = {
  scored_part_id: string;
  scrape_id: string;
  make: string;
  model: string;
  part_name: string;
  variation: string | null;
  primary_year: number | null;
  year_start: number;
  year_end: number;
  all_years: number[];
  best_image_url: string | null;
  avg_sell_price: number;
  cog: number | null;
  profit_margin: number | null;
  profit_ratio: number | null;
  active_count: number | null;
  sold_count: number | null;
  sell_through: number;
  sold_volume: number | null;
  sold_confidence: number | null;
  price_consistency: number | null;
  baseline_composite: number | null;
  composite_score: number;
  baseline_tier: "T1" | "T2" | "T3" | "below" | null;
  tier: "T1" | "T2" | "T3" | "below";
  drift: "unchanged" | "improved" | "degraded" | "dropped" | "suspicious" | "pending";
  rescraped_at: string | null;
};

export type ReleaseQueuePayload = {
  generatedAt: string | null;
  target: number;
  criteria: {
    baselineTiers: string[];
    newTiers: string[];
    classifications: string[];
    newSellThroughMin: number;
    newSellThroughMax: number;
    minNewActive: number;
    minBaselineSold: number;
    minNewComposite: number;
  } | null;
  stats: {
    total: number;
    eligible: number;
    candidatePool: number;
    tierCounts: Record<string, number>;
    driftCounts: Record<string, number>;
    topMakes: { make: string; count: number }[];
    avgComposite: number;
    avgSellThrough: number;
    avgProfit: number;
    minComposite: number;
    maxComposite: number;
  } | null;
  parts: ReleasePart[];
};

function tierColor(t: string): string {
  if (t === "T1") return "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300";
  if (t === "T2") return "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (t === "T3") return "bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-300";
  return "bg-gray-100 dark:bg-gray-800 text-gray-500";
}

function buildEbaySearchUrl(args: {
  year?: number | null;
  make: string;
  model: string;
  part_name: string;
  sold?: boolean;
}): string {
  const yearPart = args.year ? `${args.year} ` : "";
  const nkw = encodeURIComponent(
    `${yearPart}${args.make} ${args.model} ${args.part_name}`,
  ).replace(/%20/g, "+");
  const soldParams = args.sold ? "&LH_Sold=1&LH_Complete=1" : "";
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc${soldParams}`;
}

type SortKey = "score" | "sell_through" | "profit" | "active";

export default function ReleaseQueueTable({ payload }: { payload: ReleaseQueuePayload }) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "T1" | "T2" | "T3">("all");
  const [makeFilter, setMakeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const parts = payload.parts;
  const stats = payload.stats;

  const makeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of parts) counts.set(p.make, (counts.get(p.make) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [parts]);

  const filtered = useMemo(() => {
    return parts
      .filter((p) => tierFilter === "all" || p.tier === tierFilter)
      .filter((p) => makeFilter === "all" || p.make === makeFilter)
      .filter((p) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          p.make.toLowerCase().includes(q) ||
          p.model.toLowerCase().includes(q) ||
          p.part_name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "sell_through":
            return b.sell_through - a.sell_through;
          case "profit":
            return (b.profit_margin ?? 0) - (a.profit_margin ?? 0);
          case "active":
            return (b.active_count ?? 0) - (a.active_count ?? 0);
          case "score":
          default:
            return b.composite_score - a.composite_score;
        }
      });
  }, [parts, tierFilter, makeFilter, search, sortKey]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const StatPill = ({ label, value, color = "text-gray-700 dark:text-gray-300" }: {
    label: string;
    value: string | number;
    color?: string;
  }) => (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-base font-semibold ${color}`}>{value}</span>
    </div>
  );

  const tierChip = (id: "all" | "T1" | "T2" | "T3", label: string, n: number, cls: string) => (
    <button
      key={id}
      onClick={() => {
        setTierFilter(id);
        setPage(0);
      }}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        tierFilter === id
          ? `${cls} border-transparent`
          : "bg-white dark:bg-[#111] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {label}
      <span className={`ml-1.5 text-xs ${tierFilter === id ? "opacity-80" : "text-gray-400"}`}>
        {n.toLocaleString()}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Hero summary */}
      {stats && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-500/30 bg-gradient-to-br from-brand-50 to-white dark:from-brand-500/5 dark:to-[#0a0a0a] p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Release Preview
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {stats.total.toLocaleString()} parts queued for the admin user dashboard ·
                <span className="ml-1 text-gray-500">
                  picked from {stats.eligible.toLocaleString()} eligible /{" "}
                  {stats.candidatePool.toLocaleString()} ship-ready
                </span>
              </p>
              {payload.generatedAt && (
                <p className="text-xs text-gray-400 mt-1">
                  Generated {new Date(payload.generatedAt).toLocaleString()}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled
              title="Wire this up to the admin user dashboard write path when ready"
              className="rounded-lg bg-brand-500/40 dark:bg-brand-500/30 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
            >
              Promote to Admin Dashboard →
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatPill label="T1" value={stats.tierCounts.T1 ?? 0} color="text-success-600 dark:text-success-400" />
            <StatPill label="T2" value={stats.tierCounts.T2 ?? 0} color="text-blue-600 dark:text-blue-400" />
            <StatPill label="T3" value={stats.tierCounts.T3 ?? 0} color="text-warning-600 dark:text-warning-400" />
            <StatPill label="Avg sell-thru" value={`${stats.avgSellThrough.toFixed(0)}%`} />
            <StatPill label="Avg profit" value={`$${stats.avgProfit.toFixed(0)}`} color="text-success-600 dark:text-success-400" />
            <StatPill
              label="Composite range"
              value={`${stats.minComposite.toFixed(2)} – ${stats.maxComposite.toFixed(2)}`}
            />
          </div>

          {/* Eligibility criteria */}
          {payload.criteria && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                Eligibility filter
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-gray-700 dark:text-gray-300">
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  baseline tier ∈ {payload.criteria.baselineTiers.join(", ")}
                </span>
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  new tier ∈ {payload.criteria.newTiers.join(", ")}
                </span>
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  drift ∈ {payload.criteria.classifications.join(", ")}
                </span>
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  sell-thru {payload.criteria.newSellThroughMin}–{payload.criteria.newSellThroughMax}%
                </span>
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  active ≥ {payload.criteria.minNewActive}
                </span>
                <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5">
                  baseline sold ≥ {payload.criteria.minBaselineSold}
                </span>
              </div>
            </div>
          )}

          {/* Top makes */}
          {stats.topMakes.length > 0 && (
            <div className="mt-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-500">Top makes</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {stats.topMakes.map((m) => (
                  <button
                    key={m.make}
                    onClick={() => {
                      setMakeFilter(m.make);
                      setPage(0);
                    }}
                    className="text-xs rounded-full bg-white dark:bg-[#111] border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {m.make} <span className="text-gray-400 ml-0.5">{m.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search make, model, or part..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full sm:max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {tierChip("all", "All", parts.length, "bg-brand-500 text-white")}
          {tierChip("T1", "T1", stats?.tierCounts.T1 ?? 0, "bg-success-500 text-white")}
          {tierChip("T2", "T2", stats?.tierCounts.T2 ?? 0, "bg-blue-500 text-white")}
          {tierChip("T3", "T3", stats?.tierCounts.T3 ?? 0, "bg-warning-500 text-white")}
        </div>
        <div className="flex gap-2 items-center ml-auto">
          {makeFilter !== "all" && (
            <button
              onClick={() => {
                setMakeFilter("all");
                setPage(0);
              }}
              className="text-xs rounded border border-gray-200 dark:border-gray-700 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {makeFilter} ✕
            </button>
          )}
          <select
            value={makeFilter}
            onChange={(e) => {
              setMakeFilter(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs"
          >
            <option value="all">All makes</option>
            {makeOptions.map(([m, n]) => (
              <option key={m} value={m}>
                {m} ({n})
              </option>
            ))}
          </select>
          <label className="text-xs text-gray-500">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs"
          >
            <option value="score">Composite score</option>
            <option value="sell_through">Sell-through</option>
            <option value="profit">Profit ($)</option>
            <option value="active">Active count</option>
          </select>
          <label className="text-xs text-gray-500">Per page</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Part</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Verify</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Make</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Years</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">COG</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Profit</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sold</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sell-Thru</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, idx) => {
              const yearRange =
                p.year_start === p.year_end ? String(p.year_start) : `${p.year_start}–${p.year_end}`;
              const profit = p.profit_margin ?? null;
              return (
                <tr
                  key={p.scored_part_id}
                  className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3 text-xs font-mono text-gray-400">
                    {page * pageSize + idx + 1}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      {p.best_image_url && (
                        <img
                          src={p.best_image_url}
                          alt=""
                          className="w-10 h-10 rounded object-cover flex-shrink-0"
                        />
                      )}
                      <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate max-w-[260px]">
                        {p.part_name}
                      </p>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <a
                        href={buildEbaySearchUrl({
                          year: p.primary_year,
                          make: p.make,
                          model: p.model,
                          part_name: p.part_name,
                          sold: true,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-success-50 dark:bg-success-500/10 px-2 py-1 text-xs font-medium text-success-700 dark:text-success-400 hover:bg-success-100"
                      >
                        Sold
                      </a>
                      <a
                        href={buildEbaySearchUrl({
                          year: p.primary_year,
                          make: p.make,
                          model: p.model,
                          part_name: p.part_name,
                          sold: false,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100"
                      >
                        Active
                      </a>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                      {p.make}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300">
                      {p.model}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-medium text-brand-600 dark:text-brand-400">
                    {yearRange}
                  </td>
                  <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 dark:text-white/90">
                    ${Math.round(p.avg_sell_price)}
                  </td>
                  <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
                    ${p.cog ? Math.round(p.cog) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm font-medium text-success-600 dark:text-success-400">
                    {profit !== null ? `$${Math.round(profit)}` : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {p.active_count ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {p.sold_count ?? "—"}
                  </td>
                  <td className="py-2.5 px-3 text-sm font-medium text-success-600 dark:text-success-400">
                    {Math.round(p.sell_through)}%
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${tierColor(p.tier)}`}>
                      {p.tier}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {p.composite_score.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length.toLocaleString()}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
