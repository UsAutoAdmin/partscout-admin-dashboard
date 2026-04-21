"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AutoReviewTable, {
  type AutoReviewPart,
  type AutoReviewSummary,
  type PartLookup,
} from "./AutoReviewTable";
import ReleaseQueueTable, {
  type ReleaseQueuePayload,
} from "./ReleaseQueueTable";

type QueueItem = {
  queue_position: number;
  scored_part_id: string;
  year: number;
  make: string;
  model: string;
  part_name: string;
  variation_name: string | null;
  avg_sell_price: number;
  original_sell_through: number;
  original_sold_volume: number;
  sold_confidence: number;
  profit_margin: number;
  cog: number | null;
  price_consistency: number | null;
  best_image_url: string | null;
  ebay_url: string | null;
  status: "pending" | "scraped" | "removed";
  new_active_count: number | null;
  new_sold_count: number | null;
  new_sell_through: number | null;
  st_change_pct: number | null;
  removed: boolean;
  remove_reason: string | null;
  scraped_at: string | null;
};

type CrossCompat = {
  scored_part_id: string;
  base_year: number | null;
  base_make: string;
  base_model: string;
  base_part: string;
  compatible_year_start: number | null;
  compatible_year_end: number | null;
  compatible_makes: string[];
  compatible_models: string[];
  trims: string[];
  confidence: number;
  title_count: number;
  source_titles: string[];
};

type CrossCompatStats = {
  total: number;
  withYearRange: number;
  withCrossMakes: number;
  withCrossModels: number;
  avgConfidence: number;
};

function buildSoldUrl(item: QueueItem): string {
  if (item.ebay_url) {
    let url = item.ebay_url;
    if (!url.includes("LH_Sold=1")) url += "&LH_Sold=1";
    if (!url.includes("LH_Complete=1")) url += "&LH_Complete=1";
    return url;
  }
  const nkw = encodeURIComponent(
    `${item.year} ${item.make} ${item.model} ${item.part_name}`
  ).replace(/%20/g, "+");
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc&LH_Sold=1&LH_Complete=1`;
}

function buildEbaySearchUrl(args: {
  year?: number | null;
  make: string;
  model: string;
  part_name: string;
  sold?: boolean;
}): string {
  const yearPart = args.year ? `${args.year} ` : "";
  const nkw = encodeURIComponent(`${yearPart}${args.make} ${args.model} ${args.part_name}`)
    .replace(/%20/g, "+");
  const soldParams = args.sold ? "&LH_Sold=1&LH_Complete=1" : "";
  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&_sacat=0&_from=R40&LH_ItemCondition=3000&rt=nc${soldParams}`;
}

type Stats = {
  total: number;
  pending: number;
  completed: number;
  removed: number;
  progress: number;
};

type NormalizedPart = {
  make: string;
  model: string;
  all_models: string[];
  part_name: string;
  variation: string | null;
  avg_sell_price: number;
  median_sell_price: number | null;
  cog: number | null;
  sell_through: number | null;
  sold_volume: number | null;
  active_count: number | null;
  profit_margin: number | null;
  profit_ratio?: number | null;
  sold_confidence?: number | null;
  price_consistency: number | null;
  best_image_url: string | null;
  primary_year: number;
  all_years: number[];
  year_start: number;
  year_end: number;
  compatible_makes: string[];
  compatible_models: string[];
  source_count: number;
  rank_score: number;
  composite_score?: number;
  tier?: "T1" | "T2" | "T3" | "below";
  scrape_id?: string;
  scored_part_id?: string;
};

type SuspiciousPart = NormalizedPart & {
  new_active?: number | null;
  new_sell_through?: number | null;
};

type NormalizedStats = {
  total: number;
  withCompat: number;
  withImage: number;
  withCog: number;
  multiYear: number;
};

type SuspiciousStats = {
  total: number;
  rescraped: number;
  pending: number;
  bySellThrough: Record<string, number>;
};

type TabId =
  | "queue"
  | "database"
  | "removed"
  | "cross-compat"
  | "ready-to-ship"
  | "auto-review"
  | "release-preview"
  | "suspicious";

function StatCard({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number | string;
  color?: "default" | "success" | "error" | "warning" | "brand";
}) {
  const cls = {
    default: "text-gray-900 dark:text-white/90",
    success: "text-success-600 dark:text-success-400",
    error: "text-error-600 dark:text-error-400",
    warning: "text-warning-600 dark:text-warning-400",
    brand: "text-brand-600 dark:text-brand-400",
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] p-4">
      <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${cls[color]}`}>{value}</p>
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500 bg-brand-500"
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

function PartRow({ item, showNew }: { item: QueueItem; showNew: boolean }) {
  const stColor =
    item.original_sell_through >= 100
      ? "text-success-600 dark:text-success-400"
      : "text-blue-600 dark:text-blue-400";

  const changeColor =
    item.st_change_pct !== null
      ? Math.abs(item.st_change_pct) <= 20
        ? "text-success-600 dark:text-success-400"
        : Math.abs(item.st_change_pct) <= 40
        ? "text-warning-600 dark:text-warning-400"
        : "text-error-600 dark:text-error-400"
      : "";

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors">
      <td className="py-2.5 px-3 text-xs text-gray-400 font-mono">
        {item.queue_position}
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2.5">
          {item.best_image_url && (
            <img
              src={item.best_image_url}
              alt=""
              className="w-8 h-8 rounded object-cover flex-shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">
              {item.part_name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
              {item.year} {item.make} {item.model}
            </p>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3 text-sm font-medium text-gray-900 dark:text-white/90">
        ${Math.round(item.avg_sell_price)}
      </td>
      <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
        ${item.cog ? Math.round(item.cog) : "—"}
      </td>
      <td className={`py-2.5 px-3 text-sm font-medium ${stColor}`}>
        {Math.round(item.original_sell_through)}%
      </td>
      <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
        {item.original_sold_volume}
      </td>
      <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
        {(item.sold_confidence * 100).toFixed(0)}%
      </td>
      {showNew && (
        <>
          <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
            {item.new_active_count ?? "—"} / {item.new_sold_count ?? "—"}
          </td>
          <td className="py-2.5 px-3 text-sm font-medium">
            {item.new_sell_through !== null ? (
              <span
                className={
                  item.new_sell_through >= 80
                    ? "text-success-600 dark:text-success-400"
                    : "text-warning-600 dark:text-warning-400"
                }
              >
                {Math.round(item.new_sell_through)}%
              </span>
            ) : (
              "—"
            )}
          </td>
          <td className={`py-2.5 px-3 text-sm font-medium ${changeColor}`}>
            {item.st_change_pct !== null
              ? `${item.st_change_pct > 0 ? "+" : ""}${Math.round(item.st_change_pct)}%`
              : "—"}
          </td>
        </>
      )}
      {item.removed && (
        <td className="py-2.5 px-3 text-xs text-error-600 dark:text-error-400">
          {item.remove_reason}
        </td>
      )}
      <td className="py-2.5 px-3 text-center">
        <a
          href={buildSoldUrl(item)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Verify
        </a>
      </td>
    </tr>
  );
}

function PartsTable({
  items,
  showNew,
  showRemoveReason,
}: {
  items: QueueItem[];
  showNew: boolean;
  showRemoveReason: boolean;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const totalPages = Math.ceil(items.length / pageSize);
  const visible = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                #
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Part
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Price
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                COG
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sell Thru
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sold
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conf
              </th>
              {showNew && (
                <>
                  <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    New A/S
                  </th>
                  <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    New ST
                  </th>
                  <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Change
                  </th>
                </>
              )}
              {showRemoveReason && (
                <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Reason
                </th>
              )}
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                Verify
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <PartRow
                key={item.scored_part_id}
                item={item}
                showNew={showNew}
              />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-500">
            {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, items.length)} of {items.length}
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

function CrossCompatRow({ cc }: { cc: CrossCompat }) {
  const [expanded, setExpanded] = useState(false);
  const yearRange =
    cc.compatible_year_start && cc.compatible_year_end
      ? `${cc.compatible_year_start}–${cc.compatible_year_end}`
      : "—";
  const span =
    cc.compatible_year_start && cc.compatible_year_end
      ? cc.compatible_year_end - cc.compatible_year_start + 1
      : 0;

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <td className="py-2.5 px-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">
              {cc.base_part}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {cc.base_year} {cc.base_make} {cc.base_model}
            </p>
          </div>
        </td>
        <td className="py-2.5 px-3 text-sm font-medium text-brand-600 dark:text-brand-400">
          {yearRange}
          {span > 1 && (
            <span className="ml-1 text-xs text-gray-400">({span}yr)</span>
          )}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex flex-wrap gap-1">
            {cc.compatible_makes.length > 0
              ? cc.compatible_makes.map((m) => (
                  <span
                    key={m}
                    className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  >
                    {m}
                  </span>
                ))
              : <span className="text-xs text-gray-400">—</span>}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex flex-wrap gap-1">
            {cc.compatible_models.length > 0
              ? cc.compatible_models.slice(0, 4).map((m) => (
                  <span
                    key={m}
                    className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  >
                    {m}
                  </span>
                ))
              : <span className="text-xs text-gray-400">—</span>}
            {cc.compatible_models.length > 4 && (
              <span className="text-xs text-gray-400">
                +{cc.compatible_models.length - 4}
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
          {cc.title_count}
        </td>
        <td className="py-2.5 px-3">
          <span
            className={`text-sm font-medium ${
              cc.confidence >= 0.8
                ? "text-success-600 dark:text-success-400"
                : cc.confidence >= 0.5
                ? "text-warning-600 dark:text-warning-400"
                : "text-gray-400"
            }`}
          >
            {(cc.confidence * 100).toFixed(0)}%
          </span>
        </td>
        <td className="py-2.5 px-3 text-gray-400">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 dark:border-gray-800/50">
          <td colSpan={7} className="py-3 px-6 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="space-y-2">
              {cc.trims.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trims/Variants:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {cc.trims.map((t) => (
                      <span
                        key={t}
                        className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sample Titles ({cc.title_count} total):
                </span>
                <ul className="mt-1 space-y-0.5">
                  {cc.source_titles.map((t, i) => (
                    <li
                      key={i}
                      className="text-xs text-gray-500 dark:text-gray-500 truncate"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CrossCompatTable({ items }: { items: CrossCompat[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const totalPages = Math.ceil(items.length / pageSize);
  const visible = items.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Part
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Year Range
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Compatible Makes
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Compatible Models
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Titles
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Conf
              </th>
              <th className="py-2.5 px-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {visible.map((cc) => (
              <CrossCompatRow key={cc.scored_part_id} cc={cc} />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-500">
            {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, items.length)} of {items.length}
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

function TierBadge({ tier }: { tier: "T1" | "T2" | "T3" | "below" }) {
  const cls =
    tier === "T1"
      ? "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-300"
      : tier === "T2"
      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : tier === "T3"
      ? "bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-300"
      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{tier}</span>
  );
}

function NormalizedPartRow({ item }: { item: NormalizedPart }) {
  const [expanded, setExpanded] = useState(false);
  const yearRange =
    item.year_start === item.year_end
      ? String(item.year_start)
      : `${item.year_start}–${item.year_end}`;
  const yearSpan = item.year_end - item.year_start + 1;
  const stColor =
    (item.sell_through ?? 0) >= 100
      ? "text-success-600 dark:text-success-400"
      : "text-blue-600 dark:text-blue-400";
  const profit =
    item.avg_sell_price && item.cog
      ? Math.round(item.avg_sell_price - item.cog)
      : null;

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        {/* Image + Part Name */}
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-2.5">
            {item.best_image_url && (
              <img
                src={item.best_image_url}
                alt=""
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
            )}
            <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">
              {item.part_name}
            </p>
          </div>
        </td>
        {/* Verify (Sold + Active eBay links) — placed early so it's visible without horizontal scroll */}
        <td className="py-2.5 px-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="inline-flex items-center gap-1">
            <a
              href={buildEbaySearchUrl({
                year: item.primary_year,
                make: item.make,
                model: item.model,
                part_name: item.part_name,
                sold: true,
              })}
              target="_blank"
              rel="noopener noreferrer"
              title="Open eBay sold listings"
              className="inline-flex items-center gap-1 rounded-md bg-success-50 dark:bg-success-500/10 px-2 py-1 text-xs font-medium text-success-700 dark:text-success-400 hover:bg-success-100 dark:hover:bg-success-500/20 transition-colors"
            >
              Sold
            </a>
            <a
              href={buildEbaySearchUrl({
                year: item.primary_year,
                make: item.make,
                model: item.model,
                part_name: item.part_name,
                sold: false,
              })}
              target="_blank"
              rel="noopener noreferrer"
              title="Open eBay active listings"
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              Active
            </a>
          </div>
        </td>
        {/* Make */}
        <td className="py-2.5 px-3">
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            {item.make}
          </span>
        </td>
        {/* Model(s) */}
        <td className="py-2.5 px-3">
          <div className="flex flex-wrap gap-1">
            {item.all_models.map((m) => (
              <span
                key={m}
                className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300"
              >
                {m}
              </span>
            ))}
          </div>
        </td>
        {/* Years */}
        <td className="py-2.5 px-3 text-sm font-medium text-brand-600 dark:text-brand-400">
          {yearRange}
          {yearSpan > 1 && (
            <span className="ml-1 text-xs text-gray-400">({yearSpan}yr)</span>
          )}
        </td>
        {/* Price */}
        <td className="py-2.5 px-3 text-sm font-semibold text-gray-900 dark:text-white/90">
          ${Math.round(item.avg_sell_price)}
        </td>
        {/* COG */}
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
          ${item.cog ? Math.round(item.cog) : "—"}
        </td>
        {/* Profit */}
        <td className="py-2.5 px-3 text-sm font-medium text-success-600 dark:text-success-400">
          {profit !== null ? `$${profit}` : "—"}
        </td>
        {/* Sell-through */}
        <td className={`py-2.5 px-3 text-sm font-medium ${stColor}`}>
          {item.sell_through ? `${Math.round(item.sell_through)}%` : "—"}
        </td>
        {/* Sold */}
        <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">
          {item.sold_volume ?? "—"}
        </td>
        {/* Sources merged */}
        <td className="py-2.5 px-3">
          {item.source_count > 1 ? (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
              {item.source_count} merged
            </span>
          ) : (
            <span className="text-xs text-gray-400">1</span>
          )}
        </td>
        {/* Tier */}
        <td className="py-2.5 px-3">
          <TierBadge tier={tierOf(item.composite_score ?? item.rank_score)} />
        </td>
        {/* Composite score */}
        <td className="py-2.5 px-3 text-sm font-mono text-gray-600 dark:text-gray-400">
          {(item.composite_score ?? item.rank_score ?? 0).toFixed(3)}
        </td>
        {/* Expand chevron */}
        <td className="py-2.5 px-3 text-gray-400">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 dark:border-gray-800/50">
          <td colSpan={14} className="py-3 px-6 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Image + Pricing */}
              <div className="flex gap-3">
                {item.best_image_url && (
                  <img
                    src={item.best_image_url}
                    alt=""
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white/90">
                    {item.part_name}
                  </p>
                  {item.variation && (
                    <p className="text-xs text-gray-400">Variation: {item.variation}</p>
                  )}
                  <div className="flex gap-3 text-xs">
                    <span className="text-gray-900 dark:text-white/90 font-medium">
                      Sell: ${Math.round(item.avg_sell_price)}
                    </span>
                    {item.cog && (
                      <span className="text-gray-500">COG: ${Math.round(item.cog)}</span>
                    )}
                    {profit !== null && (
                      <span className="text-success-600 dark:text-success-400 font-medium">
                        Profit: ${profit}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Year + Model Compatibility */}
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Compatibility
                </span>
                <div className="mt-1.5 space-y-2">
                  <div>
                    <span className="text-xs text-gray-400">Years</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.all_years.map((y) => (
                        <span
                          key={y}
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                            y === item.primary_year
                              ? "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                          }`}
                        >
                          {y}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Models</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.all_models.map((m) => (
                        <span
                          key={m}
                          className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cross-Compatibility */}
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cross-Compatibility
                </span>
                {item.compatible_makes.length > 0 || item.compatible_models.length > 0 ? (
                  <div className="space-y-1.5 mt-1">
                    {item.compatible_makes.length > 0 && (
                      <div>
                        <span className="text-xs text-gray-400">Makes</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.compatible_makes.map((m) => (
                            <span
                              key={m}
                              className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {item.compatible_models.length > 0 && (
                      <div>
                        <span className="text-xs text-gray-400">Models</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.compatible_models.map((m) => (
                            <span
                              key={m}
                              className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Same vehicle only</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

type TierFilter = "all" | "T1" | "T2" | "T3";
type SortKey = "score" | "sell_through" | "profit" | "sold";

function tierOf(score: number | undefined): "T1" | "T2" | "T3" | "below" {
  const s = score ?? 0;
  if (s >= 0.7) return "T1";
  if (s >= 0.5) return "T2";
  if (s >= 0.3) return "T3";
  return "below";
}

function NormalizedPartsTable({ items }: { items: NormalizedPart[] }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [pageSize, setPageSize] = useState(50);

  const tierCounts = {
    T1: items.filter((p) => tierOf(p.composite_score ?? p.rank_score) === "T1").length,
    T2: items.filter((p) => tierOf(p.composite_score ?? p.rank_score) === "T2").length,
    T3: items.filter((p) => tierOf(p.composite_score ?? p.rank_score) === "T3").length,
  };

  const filtered = items
    .filter((p) => {
      if (tierFilter === "all") return true;
      return tierOf(p.composite_score ?? p.rank_score) === tierFilter;
    })
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
          return (b.sell_through ?? 0) - (a.sell_through ?? 0);
        case "profit": {
          const pa = (a.avg_sell_price ?? 0) - (a.cog ?? 0);
          const pb = (b.avg_sell_price ?? 0) - (b.cog ?? 0);
          return pb - pa;
        }
        case "sold":
          return (b.sold_volume ?? 0) - (a.sold_volume ?? 0);
        case "score":
        default:
          return (b.rank_score ?? 0) - (a.rank_score ?? 0);
      }
    });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const chip = (id: TierFilter, label: string, n: number, color: string) => (
    <button
      key={id}
      onClick={() => {
        setTierFilter(id);
        setPage(0);
      }}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        tierFilter === id
          ? `${color} border-transparent`
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
    <div>
      <div className="mb-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search make, model, or part..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="w-full sm:max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {chip("all", "All", items.length, "bg-brand-500 text-white")}
          {chip("T1", "T1 (≥0.70)", tierCounts.T1, "bg-success-500 text-white")}
          {chip("T2", "T2 (0.50–0.70)", tierCounts.T2, "bg-blue-500 text-white")}
          {chip("T3", "T3 (0.30–0.50)", tierCounts.T3, "bg-warning-500 text-white")}
        </div>
        <div className="flex gap-2 items-center ml-auto">
          <label className="text-xs text-gray-500">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs text-gray-900 dark:text-white"
          >
            <option value="score">Composite score</option>
            <option value="sell_through">Sell-through</option>
            <option value="profit">Profit ($)</option>
            <option value="sold">Sold volume</option>
          </select>
          <label className="text-xs text-gray-500 ml-2">Per page</label>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(0);
            }}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1.5 text-xs text-gray-900 dark:text-white"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Part
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Verify
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Make
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Model
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Years
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Price
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                COG
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Profit
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sell Thru
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sold
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sources
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tier
              </th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Score
              </th>
              <th className="py-2.5 px-3 w-8" />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <NormalizedPartRow
                key={item.scored_part_id ?? `${item.make}-${item.model}-${item.part_name}`}
                item={item}
              />
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
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

function SuspiciousPartsTable({
  items,
  stats,
}: {
  items: SuspiciousPart[];
  stats: SuspiciousStats | null;
}) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<"all" | "500-1000" | "1000-2000" | "2000-5000" | "5000+">("all");
  const pageSize = 100;

  const inBucket = (st: number) => {
    switch (bucket) {
      case "500-1000": return st >= 500 && st < 1000;
      case "1000-2000": return st >= 1000 && st < 2000;
      case "2000-5000": return st >= 2000 && st < 5000;
      case "5000+": return st >= 5000;
      default: return true;
    }
  };

  const filtered = items
    .filter((p) => inBucket(p.sell_through ?? 0))
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.make.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.part_name.toLowerCase().includes(q)
      );
    });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const bucketChip = (id: typeof bucket, label: string, n: number) => (
    <button
      key={id}
      onClick={() => { setBucket(id); setPage(0); }}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        bucket === id
          ? "bg-error-500 text-white border-transparent"
          : "bg-white dark:bg-[#111] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {label}<span className={`ml-1.5 text-xs ${bucket === id ? "opacity-80" : "text-gray-400"}`}>{n.toLocaleString()}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning-200 dark:border-warning-500/30 bg-warning-50/40 dark:bg-warning-500/5 p-4">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 text-warning-600 dark:text-warning-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          <div className="text-sm text-warning-900 dark:text-warning-200">
            <p className="font-medium mb-0.5">Suspicious sell-through (over 500%)</p>
            <p className="text-xs text-warning-800/80 dark:text-warning-300/80">
              These {items.length.toLocaleString()} parts were excluded from Ready-to-Ship pending an active-listings re-scrape.
              {stats && stats.rescraped > 0 && (
                <> So far <span className="font-semibold">{stats.rescraped.toLocaleString()}</span> have been re-scraped — see the &ldquo;New ST&rdquo; column.</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search make, model, or part..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="w-full sm:max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <div className="flex flex-wrap gap-2 items-center">
          {bucketChip("all", "All", items.length)}
          {bucketChip("500-1000", "500–1000%", stats?.bySellThrough["500-1000"] ?? 0)}
          {bucketChip("1000-2000", "1000–2000%", stats?.bySellThrough["1000-2000"] ?? 0)}
          {bucketChip("2000-5000", "2000–5000%", stats?.bySellThrough["2000-5000"] ?? 0)}
          {bucketChip("5000+", "5000%+", stats?.bySellThrough["5000+"] ?? 0)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Part</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Make</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Model</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Year</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sold</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Old ST</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New Active</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">New ST</th>
              <th className="py-2.5 px-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">Verify</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.scored_part_id ?? `${p.make}-${p.model}-${p.part_name}-${p.primary_year}`}
                  className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2.5">
                    {p.best_image_url && (
                      <img src={p.best_image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    )}
                    <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate max-w-xs">
                      {p.part_name}
                    </p>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">{p.make}</td>
                <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">{p.model}</td>
                <td className="py-2.5 px-3 text-sm text-gray-600 dark:text-gray-400">{p.primary_year}</td>
                <td className="py-2.5 px-3 text-sm text-gray-700 dark:text-gray-300">${Math.round(p.avg_sell_price)}</td>
                <td className="py-2.5 px-3 text-sm text-gray-700 dark:text-gray-300">{p.sold_volume ?? "—"}</td>
                <td className="py-2.5 px-3 text-sm font-medium text-error-600 dark:text-error-400">
                  {Math.round(p.sell_through ?? 0).toLocaleString()}%
                </td>
                <td className="py-2.5 px-3 text-sm font-mono text-gray-700 dark:text-gray-300">
                  {p.new_active != null ? p.new_active : <span className="text-gray-400">pending</span>}
                </td>
                <td className="py-2.5 px-3 text-sm font-medium">
                  {p.new_sell_through != null ? (
                    <span className={
                      p.new_sell_through <= 300
                        ? "text-success-600 dark:text-success-400"
                        : p.new_sell_through <= 500
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-error-600 dark:text-error-400"
                    }>
                      {Math.round(p.new_sell_through).toLocaleString()}%
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center">
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
                      title="Open eBay sold listings"
                      className="inline-flex items-center gap-1 rounded-md bg-success-50 dark:bg-success-500/10 px-2 py-1 text-xs font-medium text-success-700 dark:text-success-400 hover:bg-success-100 dark:hover:bg-success-500/20"
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
                      title="Open eBay active listings"
                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                    >
                      Active
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-xs text-gray-500">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800">
              Prev
            </button>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PartReviewClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [scraped, setScraped] = useState<QueueItem[]>([]);
  const [removed, setRemoved] = useState<QueueItem[]>([]);
  const [crossCompat, setCrossCompat] = useState<CrossCompat[]>([]);
  const [ccStats, setCcStats] = useState<CrossCompatStats | null>(null);
  const [normalizedParts, setNormalizedParts] = useState<NormalizedPart[]>([]);
  const [normalizedStats, setNormalizedStats] = useState<NormalizedStats | null>(null);
  const [suspiciousParts, setSuspiciousParts] = useState<SuspiciousPart[]>([]);
  const [suspiciousStats, setSuspiciousStats] = useState<SuspiciousStats | null>(null);
  const [autoReviewParts, setAutoReviewParts] = useState<AutoReviewPart[]>([]);
  const [autoReviewSummary, setAutoReviewSummary] = useState<AutoReviewSummary | null>(null);
  const [releaseQueue, setReleaseQueue] = useState<ReleaseQueuePayload | null>(null);
  const [tab, setTab] = useState<TabId>("release-preview");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [prRes, ccRes, normRes, susRes, arRes, rqRes] = await Promise.all([
        fetch("/api/part-review"),
        fetch("/api/part-review/cross-compat"),
        fetch("/api/part-review/normalized"),
        fetch("/api/part-review/suspicious"),
        fetch("/api/part-review/auto-review"),
        fetch("/api/release-queue"),
      ]);
      const prData = await prRes.json();
      setStats(prData.stats);
      setPending(prData.pending);
      setScraped(prData.scraped);
      setRemoved(prData.removed);

      if (ccRes.ok) {
        const ccData = await ccRes.json();
        setCrossCompat(ccData.results ?? []);
        setCcStats(ccData.stats ?? null);
      }

      if (normRes.ok) {
        const normData = await normRes.json();
        setNormalizedParts(normData.parts ?? []);
        setNormalizedStats(normData.stats ?? null);
      }

      if (susRes.ok) {
        const susData = await susRes.json();
        setSuspiciousParts(susData.parts ?? []);
        setSuspiciousStats(susData.stats ?? null);
      }

      if (arRes.ok) {
        const arData = await arRes.json();
        setAutoReviewParts(arData.parts ?? []);
        setAutoReviewSummary(arData.summary ?? null);
      }

      if (rqRes.ok) {
        const rqData = await rqRes.json();
        setReleaseQueue(rqData);
      }
    } catch {
      /* keep existing */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const autoReviewLookup: PartLookup = useMemo(() => {
    const map: PartLookup = {};
    for (const p of normalizedParts) {
      if (!p.scored_part_id) continue;
      map[p.scored_part_id] = {
        make: p.make,
        model: p.model,
        part_name: p.part_name,
        primary_year: p.primary_year,
        best_image_url: p.best_image_url,
      };
    }
    for (const p of suspiciousParts) {
      if (!p.scored_part_id) continue;
      if (map[p.scored_part_id]) continue;
      map[p.scored_part_id] = {
        make: p.make,
        model: p.model,
        part_name: p.part_name,
        primary_year: p.primary_year,
        best_image_url: p.best_image_url,
      };
    }
    return map;
  }, [normalizedParts, suspiciousParts]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    {
      id: "release-preview",
      label: "Release Preview",
      count: releaseQueue?.parts.length ?? 0,
    },
    { id: "ready-to-ship", label: "Ready to Ship", count: normalizedParts.length },
    {
      id: "auto-review",
      label: "Auto-Review",
      count: autoReviewSummary?.rescraped ?? autoReviewParts.length,
    },
    { id: "suspicious", label: "Suspicious (>500%)", count: suspiciousParts.length },
    { id: "queue", label: "Queue", count: stats?.pending ?? 0 },
    { id: "database", label: "Verified Parts", count: stats?.completed ?? 0 },
    { id: "removed", label: "Removed", count: stats?.removed ?? 0 },
    { id: "cross-compat", label: "Cross-Compatibility", count: crossCompat.length },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total Parts" value={stats?.total ?? 0} />
        <StatCard label="In Queue" value={stats?.pending ?? 0} color="warning" />
        <StatCard
          label="Verified"
          value={stats?.completed ?? 0}
          color="success"
        />
        <StatCard label="Removed" value={stats?.removed ?? 0} color="error" />
        <StatCard
          label="Progress"
          value={`${stats?.progress ?? 0}%`}
          color="brand"
        />
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Rescrape Progress</span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {(stats?.completed ?? 0) + (stats?.removed ?? 0)} /{" "}
            {stats?.total ?? 0}
          </span>
        </div>
        <ProgressBar progress={stats?.progress ?? 0} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-600">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "ready-to-ship" && (
        <div className="space-y-4">
          {normalizedStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <StatCard label="Unique Parts" value={normalizedStats.total} color="brand" />
              <StatCard label="With Image" value={normalizedStats.withImage} color="success" />
              <StatCard label="With COG" value={normalizedStats.withCog} color="success" />
              <StatCard label="With Compatibility" value={normalizedStats.withCompat} />
              <StatCard label="Multi-Year Merged" value={normalizedStats.multiYear} color="warning" />
            </div>
          )}
          {normalizedParts.length > 0 ? (
            <NormalizedPartsTable items={normalizedParts} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Run the normalization script to generate ready-to-ship parts
            </div>
          )}
        </div>
      )}

      {tab === "release-preview" && (
        <div>
          {releaseQueue && releaseQueue.parts.length > 0 ? (
            <ReleaseQueueTable payload={releaseQueue} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Run <code className="text-xs">node scripts/build-release-queue.mjs 5000</code> to
              build the release queue.
            </div>
          )}
        </div>
      )}

      {tab === "auto-review" && (
        <div>
          {autoReviewParts.length > 0 ? (
            <AutoReviewTable
              items={autoReviewParts}
              summary={autoReviewSummary}
              lookup={autoReviewLookup}
            />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Run <code className="text-xs">node scripts/aggregate-auto-review.mjs</code> to populate
              the auto-review tab.
            </div>
          )}
        </div>
      )}

      {tab === "suspicious" && (
        <div>
          {suspiciousParts.length > 0 ? (
            <SuspiciousPartsTable items={suspiciousParts} stats={suspiciousStats} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              No suspicious parts. Run scripts/expand-clean-direct.mjs to refresh.
            </div>
          )}
        </div>
      )}

      {tab === "queue" && (
        <div>
          {pending.length > 0 ? (
            <PartsTable items={pending} showNew={false} showRemoveReason={false} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              {(stats?.completed ?? 0) > 0
                ? "Queue complete — all parts have been rescraped"
                : "No parts in queue"}
            </div>
          )}
        </div>
      )}

      {tab === "database" && (
        <div>
          {scraped.length > 0 ? (
            <PartsTable items={scraped} showNew={true} showRemoveReason={false} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Verified parts will appear here once rescraping completes
            </div>
          )}
        </div>
      )}

      {tab === "removed" && (
        <div>
          {removed.length > 0 ? (
            <PartsTable items={removed} showNew={true} showRemoveReason={true} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Parts removed due to data inconsistency will appear here
            </div>
          )}
        </div>
      )}

      {tab === "cross-compat" && (
        <div className="space-y-4">
          {ccStats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <StatCard label="Parts Analyzed" value={ccStats.total} />
              <StatCard label="With Year Range" value={ccStats.withYearRange} color="brand" />
              <StatCard label="Cross-Make" value={ccStats.withCrossMakes} color="success" />
              <StatCard label="Cross-Model" value={ccStats.withCrossModels} color="warning" />
              <StatCard
                label="Avg Confidence"
                value={`${(ccStats.avgConfidence * 100).toFixed(0)}%`}
              />
            </div>
          )}
          {crossCompat.length > 0 ? (
            <CrossCompatTable items={crossCompat} />
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-600">
              Cross-compatibility data will appear here once extraction completes
            </div>
          )}
        </div>
      )}
    </div>
  );
}
