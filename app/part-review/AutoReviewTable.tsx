"use client";

import { useMemo, useState } from "react";

export type AutoReviewPart = {
  scored_part_id: string;
  scrape_id: string;
  baseline_active: number | null;
  baseline_sold: number | null;
  baseline_sell_through: number | null;
  baseline_composite: number | null;
  baseline_tier: "T1" | "T2" | "T3" | "below" | null;
  new_active: number | null;
  new_sold: number | null;
  new_sell_through_raw: number | null;
  new_sell_through: number | null;
  new_composite: number | null;
  new_tier: "T1" | "T2" | "T3" | "below" | null;
  classification:
    | "improved"
    | "unchanged"
    | "degraded"
    | "dropped"
    | "suspicious"
    | "pending";
  active_error: string | null;
  sold_error: string | null;
  scraped_at: string | null;
};

export type AutoReviewSummary = {
  generatedAt: string | null;
  totalParts: number;
  rescraped: number;
  pending: number;
  classifications: Record<string, number>;
  tierMatrix: Record<string, number>;
  sellThroughCap?: number;
};

// Lookup table from manifest extras (make/model/part) — joined by scored_part_id
// for display only.
export type PartLookup = Record<
  string,
  {
    make: string;
    model: string;
    part_name: string;
    primary_year?: number | null;
    best_image_url?: string | null;
  }
>;

type Classification = AutoReviewPart["classification"];

const CLASS_COLORS: Record<Classification, string> = {
  improved: "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400",
  unchanged: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
  degraded: "bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400",
  dropped: "bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400",
  suspicious: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400",
  pending: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
};

function tierColor(t: string | null): string {
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

function deltaArrow(oldV: number | null, newV: number | null): {
  text: string;
  cls: string;
} {
  if (oldV == null || newV == null) return { text: "—", cls: "text-gray-400" };
  const d = newV - oldV;
  if (Math.abs(d) < 0.01) return { text: "0", cls: "text-gray-500" };
  const cls = d > 0 ? "text-success-600" : "text-error-600";
  const arrow = d > 0 ? "▲" : "▼";
  return { text: `${arrow} ${Math.abs(d) >= 1 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(3)}`, cls };
}

export default function AutoReviewTable({
  items,
  summary,
  lookup,
}: {
  items: AutoReviewPart[];
  summary: AutoReviewSummary | null;
  lookup: PartLookup;
}) {
  const [filter, setFilter] = useState<Classification | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [sortKey, setSortKey] = useState<"score_drop" | "score_gain" | "st_change" | "new_score">("score_drop");

  const counts = useMemo(() => {
    const c: Record<Classification, number> = {
      improved: 0,
      unchanged: 0,
      degraded: 0,
      dropped: 0,
      suspicious: 0,
      pending: 0,
    };
    for (const p of items) c[p.classification]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter((p) => filter === "all" || p.classification === filter)
      .filter((p) => {
        if (!search.trim()) return true;
        const meta = lookup[p.scored_part_id];
        if (!meta) return false;
        const q = search.toLowerCase();
        return (
          meta.make.toLowerCase().includes(q) ||
          meta.model.toLowerCase().includes(q) ||
          meta.part_name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        switch (sortKey) {
          case "score_gain":
            return ((b.new_composite ?? 0) - (b.baseline_composite ?? 0)) -
                   ((a.new_composite ?? 0) - (a.baseline_composite ?? 0));
          case "st_change": {
            const da = (a.new_sell_through ?? 0) - (a.baseline_sell_through ?? 0);
            const db = (b.new_sell_through ?? 0) - (b.baseline_sell_through ?? 0);
            return Math.abs(db) - Math.abs(da);
          }
          case "new_score":
            return (b.new_composite ?? -1) - (a.new_composite ?? -1);
          case "score_drop":
          default:
            return ((a.new_composite ?? a.baseline_composite ?? 0) - (a.baseline_composite ?? 0)) -
                   ((b.new_composite ?? b.baseline_composite ?? 0) - (b.baseline_composite ?? 0));
        }
      });
  }, [items, filter, search, sortKey, lookup]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const chip = (id: Classification | "all", label: string, n: number, color: string) => (
    <button
      key={id}
      onClick={() => {
        setFilter(id);
        setPage(0);
      }}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        filter === id
          ? `${color} border-transparent`
          : "bg-white dark:bg-[#111] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {label}
      <span className={`ml-1.5 text-xs ${filter === id ? "opacity-80" : "text-gray-400"}`}>
        {n.toLocaleString()}
      </span>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Summary card */}
      {summary && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] p-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 items-baseline">
            <div>
              <span className="text-xs text-gray-500">Rescraped</span>
              <span className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
                {summary.rescraped.toLocaleString()} / {summary.totalParts.toLocaleString()}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                ({((summary.rescraped / Math.max(summary.totalParts, 1)) * 100).toFixed(1)}%)
              </span>
            </div>
            {summary.generatedAt && (
              <div className="text-xs text-gray-400 ml-auto">
                Updated {new Date(summary.generatedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
          {Object.keys(summary.tierMatrix).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-500 uppercase tracking-wider">Tier movement:</span>
              {Object.entries(summary.tierMatrix)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([k, v]) => (
                  <span key={k} className="font-mono text-gray-700 dark:text-gray-300">
                    {k} <span className="text-gray-400">({v.toLocaleString()})</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Filters + search */}
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
          {chip("all", "All", items.length, "bg-brand-500 text-white")}
          {chip("improved", "Improved", counts.improved, "bg-success-500 text-white")}
          {chip("unchanged", "Unchanged", counts.unchanged, "bg-gray-500 text-white")}
          {chip("degraded", "Degraded", counts.degraded, "bg-warning-500 text-white")}
          {chip("dropped", "Dropped", counts.dropped, "bg-error-500 text-white")}
          {chip("suspicious", "Suspicious", counts.suspicious, "bg-purple-500 text-white")}
          {chip("pending", "Pending", counts.pending, "bg-blue-500 text-white")}
        </div>
        <div className="flex gap-2 items-center ml-auto">
          <label className="text-xs text-gray-500">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as typeof sortKey);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs"
          >
            <option value="score_drop">Biggest score drops</option>
            <option value="score_gain">Biggest score gains</option>
            <option value="st_change">Biggest sell-thru shifts</option>
            <option value="new_score">New score (high → low)</option>
          </select>
          <label className="text-xs text-gray-500 ml-2">Per page</label>
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
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Part</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Verify</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Drift</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sold</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">ST (old → new)</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Score (old → new)</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const meta = lookup[p.scored_part_id] ?? {
                make: "",
                model: "",
                part_name: p.scored_part_id.slice(0, 8) + "…",
              };
              const stDelta = deltaArrow(p.baseline_sell_through, p.new_sell_through);
              const scoreDelta = deltaArrow(p.baseline_composite, p.new_composite);
              return (
                <tr
                  key={p.scored_part_id}
                  className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2.5">
                      {meta.best_image_url && (
                        <img src={meta.best_image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate max-w-[260px]">
                          {meta.part_name}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[260px]">
                          {meta.make} {meta.model}
                          {meta.primary_year ? ` · ${meta.primary_year}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <a
                        href={buildEbaySearchUrl({
                          year: meta.primary_year,
                          make: meta.make,
                          model: meta.model,
                          part_name: meta.part_name,
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
                          year: meta.primary_year,
                          make: meta.make,
                          model: meta.model,
                          part_name: meta.part_name,
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
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${CLASS_COLORS[p.classification]}`}>
                      {p.classification}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {p.baseline_active ?? "—"}
                    <span className="text-gray-400"> → </span>
                    <span className={p.new_active != null ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                      {p.new_active ?? "…"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                    {p.baseline_sold ?? "—"}
                    <span className="text-gray-400"> → </span>
                    <span className={p.new_sold != null ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                      {p.new_sold ?? "…"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-medium">
                    <span className="text-gray-500">
                      {p.baseline_sell_through != null ? `${Math.round(p.baseline_sell_through)}%` : "—"}
                    </span>
                    <span className="text-gray-400"> → </span>
                    <span className={p.new_sell_through != null ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                      {p.new_sell_through != null ? `${Math.round(p.new_sell_through)}%` : "…"}
                    </span>
                    <span className={`ml-2 text-xs ${stDelta.cls}`}>{stDelta.text}</span>
                  </td>
                  <td className="py-2.5 px-3 text-sm font-mono">
                    <span className="text-gray-500">
                      {p.baseline_composite != null ? p.baseline_composite.toFixed(3) : "—"}
                    </span>
                    <span className="text-gray-400"> → </span>
                    <span className={p.new_composite != null ? "text-gray-900 dark:text-white" : "text-gray-400"}>
                      {p.new_composite != null ? p.new_composite.toFixed(3) : "…"}
                    </span>
                    <span className={`ml-2 text-xs ${scoreDelta.cls}`}>{scoreDelta.text}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${tierColor(p.baseline_tier)}`}>
                      {p.baseline_tier ?? "—"}
                    </span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${tierColor(p.new_tier)}`}>
                      {p.new_tier ?? "…"}
                    </span>
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
