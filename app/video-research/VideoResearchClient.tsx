"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  sell_price: number | null;
  part_price: number | null;
  part_price_card_url: string | null;
  part_price_matched_name: string | null;
  part_price_approved: boolean;
  nickname: string | null;
  image_url: string | null;
  sold_screenshot_url: string | null;
  checked: boolean;
  original_url: string;
  sold_link: string | null;
  sold_verified_at: string | null;
  created_at: string;
}

type SortKey = "year" | "make" | "model" | "part" | "active" | "sold" | "sell_through" | "sold_confidence" | "sell_price" | "part_price" | "checked";
type SortDir = "asc" | "desc";

export default function VideoResearchClient() {
  const [rows, setRows] = useState<ResearchPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ total: 0, checkedCount: 0, avgSellThrough: 0, avgConfidence: 0, totalActive: 0, totalSold: 0 });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sell_through");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<{ matched: number; unmatched: number } | null>(null);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/video-research");
    const data = await res.json();
    setRows(data.rows ?? []);
    setMetrics({
      total: data.total,
      checkedCount: data.checkedCount ?? 0,
      avgSellThrough: data.avgSellThrough,
      avgConfidence: data.avgConfidence,
      totalActive: data.totalActive,
      totalSold: data.totalSold,
    });
    return data.rows ?? [];
  }, []);

  const runMatchPrices = useCallback(async (force: boolean) => {
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch("/api/video-research/match-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const result = await res.json();
      setMatchResult({ matched: result.matched ?? 0, unmatched: result.unmatched ?? 0 });
      await loadRows();
    } catch (err) {
      console.error("Match prices failed:", err);
    }
    setMatching(false);
  }, [loadRows]);

  useEffect(() => {
    loadRows()
      .then((rows) => {
        if (rows.some((r: ResearchPart) => r.sell_price != null && r.part_price == null)) {
          runMatchPrices(false);
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<ResearchPart>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.year?.toLowerCase().includes(q) || r.make?.toLowerCase().includes(q) || r.model?.toLowerCase().includes(q) || r.part?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const av = typeof aVal === "boolean" ? (aVal ? 1 : 0) : typeof aVal === "string" ? aVal.toLowerCase() : (aVal ?? 0);
      const bv = typeof bVal === "boolean" ? (bVal ? 1 : 0) : typeof bVal === "string" ? bVal.toLowerCase() : (bVal ?? 0);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function exportForScripting() {
    const ready = rows.filter((r) => r.sell_price != null);
    const payload = ready.map((r) => ({
      year: r.year,
      make: r.make,
      model: r.model,
      part: r.part,
      nickname: r.nickname || null,
      sell_price: r.sell_price,
      cost: r.part_price,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "video-research-parts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <SectionHeader title="Video Research Parts" subtitle="1,000-part sample — sell-through 80–150%, confidence > 80%. Click a row to expand, edit values inline." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
        <MetricCard label="Total Parts" value={fmtNum(metrics.total)} color="brand" />
        <MetricCard label="Checked" value={`${metrics.checkedCount} / ${metrics.total}`} color={metrics.checkedCount === metrics.total ? "success" : "warning"} subtext={`${metrics.total ? Math.round((metrics.checkedCount / metrics.total) * 100) : 0}% complete`} />
        <MetricCard label="Avg Sell-Through" value={`${metrics.avgSellThrough}%`} color="success" />
        <MetricCard label="Avg Confidence" value={`${metrics.avgConfidence}%`} color="info" />
        <MetricCard label="Total Active" value={fmtNum(metrics.totalActive)} />
        <MetricCard label="Total Sold" value={fmtNum(metrics.totalSold)} color="success" />
      </div>

      <div className="flex items-center gap-3">
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
        <button
          onClick={() => runMatchPrices(true)}
          disabled={matching}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
        >
          {matching ? (
            <svg className="animate-spin h-3.5 w-3.5 text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
          {matching ? "Matching..." : "Auto-Match Prices"}
        </button>
        <button
          onClick={exportForScripting}
          disabled={!rows.some((r) => r.sell_price != null)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export for Scripting
        </button>
        {matchResult && !matching && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {matchResult.matched} matched, {matchResult.unmatched} unmatched
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} of {rows.length} parts</span>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-hidden">
          <table className="w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "32px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col />
              <col style={{ width: "12%" }} />
              <col style={{ width: "50px" }} />
              <col style={{ width: "48px" }} />
              <col style={{ width: "64px" }} />
              <col style={{ width: "66px" }} />
              <col style={{ width: "62px" }} />
              <col style={{ width: "56px" }} />
              <col style={{ width: "56px" }} />
            </colgroup>
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <ThSort col="checked" current={sortKey} dir={sortDir} toggle={toggleSort} align="center">
                  <svg className="h-3.5 w-3.5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </ThSort>
                <Th>#</Th>
                <ThSort col="year" current={sortKey} dir={sortDir} toggle={toggleSort}>Year</ThSort>
                <ThSort col="make" current={sortKey} dir={sortDir} toggle={toggleSort}>Make</ThSort>
                <ThSort col="model" current={sortKey} dir={sortDir} toggle={toggleSort}>Model</ThSort>
                <ThSort col="part" current={sortKey} dir={sortDir} toggle={toggleSort}>Part</ThSort>
                <Th>Nickname</Th>
                <ThSort col="active" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Act</ThSort>
                <ThSort col="sold" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">Sold</ThSort>
                <ThSort col="sell_through" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">S/T</ThSort>
                <ThSort col="sell_price" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Sell $</ThSort>
                <ThSort col="part_price" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">Yard $</ThSort>
                <ThSort col="sold_confidence" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Conf</ThSort>
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
                    Loading parts...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={14} className="py-16 text-center text-sm text-gray-400">No parts match your search.</td></tr>
              ) : (
                sorted.map((row, i) => (
                  <PartRow
                    key={row.id}
                    row={row}
                    index={i}
                    expanded={expandedId === row.id}
                    onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    onUpdate={updateRow}
                    matching={matching}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Part Row ───────────────────── */

function PartRow({ row, index, expanded, onToggle, onUpdate, matching }: {
  row: ResearchPart;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: Partial<ResearchPart>) => void;
  matching: boolean;
}) {
  return (
    <>
      <tr
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input, a, button")) return;
          onToggle();
        }}
        className={`cursor-pointer transition-colors ${expanded ? "bg-brand-50/50 dark:bg-brand-500/[0.06]" : row.checked ? "bg-success-50/30 dark:bg-success-500/[0.03] hover:bg-success-50/60 dark:hover:bg-success-500/[0.06]" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"}`}
      >
        <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
          <CheckboxCell checked={row.checked} rowId={row.id} onUpdate={onUpdate} />
        </td>
        <Td className="text-gray-400 dark:text-gray-600 tabular-nums">
          <span className="flex items-center gap-1">
            <svg className={`h-3 w-3 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            {index + 1}
          </span>
        </Td>
        <Td className="font-medium">{row.year}</Td>
        <Td className="truncate overflow-hidden">{row.make}</Td>
        <Td className="truncate overflow-hidden">{row.model}</Td>
        <Td className="font-medium truncate overflow-hidden">{row.part}</Td>
        <EditableTextCell value={row.nickname} rowId={row.id} field="nickname" onUpdate={onUpdate} placeholder="Add nickname..." />
        <EditableNumCell value={row.active} rowId={row.id} field="active" border onUpdate={onUpdate} currentRow={row} />
        <EditableNumCell value={row.sold} rowId={row.id} field="sold" onUpdate={onUpdate} currentRow={row} />
        <Td align="right"><SellThroughPill value={row.sell_through} /></Td>
        <EditablePriceCell value={row.sell_price} rowId={row.id} onUpdate={onUpdate} border />
        <Td align="right">
          {row.part_price != null ? (
            <span className={`tabular-nums ${row.part_price_approved ? "text-success-600 dark:text-success-400 font-semibold" : ""}`}>
              ${row.part_price.toFixed(0)}
            </span>
          ) : matching ? (
            <svg className="animate-spin h-3 w-3 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          ) : (
            <span className="text-gray-300 dark:text-gray-700">&mdash;</span>
          )}
        </Td>
        <Td align="right" border><ConfidencePill value={row.sold_confidence} /></Td>
        <Td align="center" border>
          <a
            href={row.original_url}
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
      {expanded && <ExpandedRow row={row} onUpdate={onUpdate} />}
    </>
  );
}

/* ───────────────────── Expanded Row ───────────────────── */

function ExpandedRow({ row, onUpdate }: { row: ResearchPart; onUpdate: (id: string, u: Partial<ResearchPart>) => void }) {
  async function toggleApproval() {
    const next = !row.part_price_approved;
    onUpdate(row.id, { part_price_approved: next });
    await fetch("/api/video-research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, part_price_approved: next }),
    });
  }

  return (
    <tr className="bg-gray-50/50 dark:bg-white/[0.015]">
      <td colSpan={14} className="px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ImageUploadCard
            label="Part Photo"
            field="image_url"
            currentUrl={row.image_url}
            rowId={row.id}
            onUploaded={(url) => onUpdate(row.id, { image_url: url })}
          />
          <ImageUploadCard
            label="Sold Listings Screenshot"
            field="sold_screenshot_url"
            currentUrl={row.sold_screenshot_url}
            rowId={row.id}
            onUploaded={(url) => onUpdate(row.id, { sold_screenshot_url: url })}
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Part Price Card</p>
            {row.part_price_card_url ? (
              <div className="relative group">
                <img
                  src={row.part_price_card_url}
                  alt="Part Price Card"
                  className="rounded-xl border border-gray-200 dark:border-gray-800 max-h-64 w-full object-contain bg-white dark:bg-black/20"
                />
                <ImageUploadCard
                  label=""
                  field="part_price_card_url"
                  currentUrl={null}
                  rowId={row.id}
                  onUploaded={(url) => onUpdate(row.id, { part_price_card_url: url })}
                  replaceOnly
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 py-10 px-4">
                <svg className="h-8 w-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-gray-400 dark:text-gray-500">No price match found</p>
              </div>
            )}
            {row.part_price_matched_name && (
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 truncate" title={row.part_price_matched_name}>
                Matched: <span className="font-medium text-gray-700 dark:text-gray-300">{row.part_price_matched_name}</span>
                {row.part_price != null && <span className="ml-1 text-brand-600 dark:text-brand-400">(${row.part_price.toFixed(2)})</span>}
              </p>
            )}
            <button
              onClick={toggleApproval}
              className="mt-3 inline-flex items-center gap-2 group"
            >
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                row.part_price_approved
                  ? "bg-success-500 border-success-500"
                  : "border-gray-300 dark:border-gray-600 group-hover:border-brand-500 dark:group-hover:border-brand-400"
              }`}>
                {row.part_price_approved && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-xs font-medium ${row.part_price_approved ? "text-success-600 dark:text-success-400" : "text-gray-500 dark:text-gray-400"}`}>
                {row.part_price_approved ? "Price Approved" : "Approve Price Match"}
              </span>
            </button>
          </div>
        </div>
        {row.sold_link && (
          <div className="mt-4">
            <a
              href={row.sold_link}
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
        )}
      </td>
    </tr>
  );
}

/* ───────────────────── Image Upload Card ───────────────────── */

function ImageUploadCard({ label, field, currentUrl, rowId, onUploaded, replaceOnly }: {
  label: string;
  field: "image_url" | "sold_screenshot_url" | "part_price_card_url";
  currentUrl: string | null;
  rowId: string;
  onUploaded: (url: string) => void;
  replaceOnly?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("id", rowId);
    form.append("field", field);
    try {
      const res = await fetch("/api/video-research/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.url) onUploaded(data.url);
    } catch (e) {
      console.error("Upload failed:", e);
    }
    setUploading(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFile(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) { handleFile(file); break; }
      }
    }
  }

  if (replaceOnly) {
    return (
      <>
        <button
          onClick={() => inputRef.current?.click()}
          className="absolute top-2 right-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {uploading ? "Uploading..." : "Replace"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </>
    );
  }

  return (
    <div>
      {label && <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{label}</p>}
      {currentUrl ? (
        <div className="relative group">
          <img
            src={currentUrl}
            alt={label}
            className="rounded-xl border border-gray-200 dark:border-gray-800 max-h-64 w-full object-contain bg-white dark:bg-black/20"
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute top-2 right-2 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Replace
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={handlePaste}
          tabIndex={0}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 py-10 px-4 cursor-pointer hover:border-brand-500 dark:hover:border-brand-400 hover:bg-brand-50/30 dark:hover:bg-brand-500/[0.04] transition-colors focus:outline-none focus:border-brand-500"
        >
          {uploading ? (
            <svg className="animate-spin h-6 w-6 text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-8 w-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5z" />
            </svg>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {uploading ? "Uploading..." : "Click, drop, or paste an image"}
          </p>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

/* ───────────────────── Checkbox Cell ───────────────────── */

function CheckboxCell({ checked, rowId, onUpdate }: {
  checked: boolean;
  rowId: string;
  onUpdate: (id: string, u: Partial<ResearchPart>) => void;
}) {
  async function toggle() {
    const next = !checked;
    onUpdate(rowId, { checked: next });
    await fetch("/api/video-research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rowId, checked: next }),
    });
  }

  return (
    <button onClick={toggle} className="group flex items-center justify-center">
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

/* ───────────────────── Editable Cells ───────────────────── */

function EditableNumCell({ value, rowId, field, border, onUpdate, currentRow }: {
  value: number;
  rowId: string;
  field: "active" | "sold";
  border?: boolean;
  onUpdate: (id: string, u: Partial<ResearchPart>) => void;
  currentRow: ResearchPart;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(String(value));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    setEditing(false);
    const num = parseInt(draft) || 0;
    if (num === value) return;

    const newActive = field === "active" ? num : currentRow.active;
    const newSold = field === "sold" ? num : currentRow.sold;
    const newSellThrough = newActive > 0 ? Math.round((newSold / newActive) * 10000) / 100 : 0;

    onUpdate(rowId, { [field]: num, sell_through: newSellThrough });

    await fetch("/api/video-research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rowId, [field]: num }),
    });
  }

  if (editing) {
    return (
      <td className={`px-1 py-1 ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-14 rounded border border-brand-500 bg-white dark:bg-gray-900 px-1 py-0.5 text-xs text-right tabular-nums text-gray-900 dark:text-gray-100 outline-none"
        />
      </td>
    );
  }

  return (
    <td
      onClick={startEdit}
      className={`px-2 py-2 text-xs text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-500/[0.06] transition-colors ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`}
      title="Click to edit"
    >
      {value}
    </td>
  );
}

function EditablePriceCell({ value, rowId, onUpdate, border }: {
  value: number | null;
  rowId: string;
  onUpdate: (id: string, u: Partial<ResearchPart>) => void;
  border?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(value != null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    setEditing(false);
    const num = draft === "" ? null : parseFloat(draft) || 0;
    if (num === value) return;

    const updates: Partial<ResearchPart> = { sell_price: num };
    if (num != null) updates.checked = true;
    onUpdate(rowId, updates);

    await fetch("/api/video-research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rowId, sell_price: num }),
    });
  }

  if (editing) {
    return (
      <td className={`px-1 py-1 ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          <span className="text-[11px] text-gray-400">$</span>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            className="w-16 rounded border border-brand-500 bg-white dark:bg-gray-900 px-1 py-0.5 text-xs text-right tabular-nums text-gray-900 dark:text-gray-100 outline-none"
          />
        </div>
      </td>
    );
  }

  return (
    <td
      onClick={startEdit}
      className={`px-2 py-2 text-xs text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-500/[0.06] transition-colors ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`}
      title="Click to edit"
    >
      {value != null ? `$${value.toFixed(0)}` : <span className="text-gray-300 dark:text-gray-700">—</span>}
    </td>
  );
}

function EditableTextCell({ value, rowId, field, onUpdate, placeholder }: {
  value: string | null;
  rowId: string;
  field: "nickname";
  onUpdate: (id: string, u: Partial<ResearchPart>) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(value ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    onUpdate(rowId, { [field]: trimmed || null });
    await fetch("/api/video-research", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rowId, [field]: trimmed }),
    });
  }

  if (editing) {
    return (
      <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          className="w-full rounded border border-brand-500 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-xs text-gray-900 dark:text-gray-100 outline-none"
        />
      </td>
    );
  }

  return (
    <td
      onClick={startEdit}
      className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400 truncate overflow-hidden cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-500/[0.06] transition-colors"
      title={value ? `Nickname: ${value}` : "Click to add nickname"}
    >
      {value || <span className="text-gray-300 dark:text-gray-700 italic">{placeholder}</span>}
    </td>
  );
}

/* ───────────────────── Shared UI ───────────────────── */

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
      className={`px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none transition-colors hover:text-gray-900 dark:hover:text-gray-200 ${active ? "text-gray-900 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"} ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${border ? "border-l border-gray-200 dark:border-gray-800" : ""}`}
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
    <td className={`px-2 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${border ? "border-l border-gray-200 dark:border-gray-800" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function SellThroughPill({ value }: { value: number }) {
  let bg: string, text: string;
  if (value >= 120) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-600 dark:text-success-400"; }
  else if (value >= 100) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-500 dark:text-success-400"; }
  else { bg = "bg-warning-50 dark:bg-warning-500/10"; text = "text-warning-600 dark:text-warning-400"; }
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${bg} ${text}`}>{value.toFixed(0)}%</span>;
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  let bg: string, text: string;
  if (pct >= 95) { bg = "bg-success-50 dark:bg-success-500/10"; text = "text-success-600 dark:text-success-400"; }
  else if (pct >= 85) { bg = "bg-blue-light-50 dark:bg-blue-light-500/10"; text = "text-blue-light-600 dark:text-blue-light-400"; }
  else { bg = "bg-warning-50 dark:bg-warning-500/10"; text = "text-warning-600 dark:text-warning-400"; }
  return <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${bg} ${text}`}>{pct}%</span>;
}
