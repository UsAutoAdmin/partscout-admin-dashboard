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
  image_url: string | null;
  sold_screenshot_url: string | null;
  original_url: string;
  sold_link: string | null;
  sold_verified_at: string | null;
  created_at: string;
}

type SortKey = "year" | "make" | "model" | "part" | "active" | "sold" | "sell_through" | "sold_confidence" | "sell_price";
type SortDir = "asc" | "desc";

export default function VideoResearchClient() {
  const [rows, setRows] = useState<ResearchPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ total: 0, avgSellThrough: 0, avgConfidence: 0, totalActive: 0, totalSold: 0 });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sell_through");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const av = typeof aVal === "string" ? aVal.toLowerCase() : (aVal ?? 0);
      const bv = typeof bVal === "string" ? bVal.toLowerCase() : (bVal ?? 0);
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
      <SectionHeader title="Video Research Parts" subtitle="1,000-part sample — sell-through 80–150%, confidence > 80%. Click a row to expand, edit values inline." />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard label="Total Parts" value={fmtNum(metrics.total)} color="brand" />
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
        <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} of {rows.length} parts</span>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-hidden">
          <table className="w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "36px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col />
              <col style={{ width: "56px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "62px" }} />
              <col style={{ width: "62px" }} />
            </colgroup>
            <thead className="border-b border-gray-200 dark:border-gray-800">
              <tr>
                <Th>#</Th>
                <ThSort col="year" current={sortKey} dir={sortDir} toggle={toggleSort}>Year</ThSort>
                <ThSort col="make" current={sortKey} dir={sortDir} toggle={toggleSort}>Make</ThSort>
                <ThSort col="model" current={sortKey} dir={sortDir} toggle={toggleSort}>Model</ThSort>
                <ThSort col="part" current={sortKey} dir={sortDir} toggle={toggleSort}>Part</ThSort>
                <ThSort col="active" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Act</ThSort>
                <ThSort col="sold" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">Sold</ThSort>
                <ThSort col="sell_through" current={sortKey} dir={sortDir} toggle={toggleSort} align="right">S/T</ThSort>
                <ThSort col="sell_price" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Price</ThSort>
                <ThSort col="sold_confidence" current={sortKey} dir={sortDir} toggle={toggleSort} align="right" border>Conf</ThSort>
                <Th align="center" border>Verify</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-sm text-gray-400">
                    <svg className="animate-spin h-5 w-5 mx-auto mb-2 text-brand-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading parts...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={11} className="py-16 text-center text-sm text-gray-400">No parts match your search.</td></tr>
              ) : (
                sorted.map((row, i) => (
                  <PartRow
                    key={row.id}
                    row={row}
                    index={i}
                    expanded={expandedId === row.id}
                    onToggle={() => setExpandedId(expandedId === row.id ? null : row.id)}
                    onUpdate={updateRow}
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

function PartRow({ row, index, expanded, onToggle, onUpdate }: {
  row: ResearchPart;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: Partial<ResearchPart>) => void;
}) {
  return (
    <>
      <tr
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("input, a, button")) return;
          onToggle();
        }}
        className={`cursor-pointer transition-colors ${expanded ? "bg-brand-50/50 dark:bg-brand-500/[0.06]" : "hover:bg-gray-50 dark:hover:bg-white/[0.02]"}`}
      >
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
        <EditableNumCell value={row.active} rowId={row.id} field="active" border onUpdate={onUpdate} currentRow={row} />
        <EditableNumCell value={row.sold} rowId={row.id} field="sold" onUpdate={onUpdate} currentRow={row} />
        <Td align="right"><SellThroughPill value={row.sell_through} /></Td>
        <EditablePriceCell value={row.sell_price} rowId={row.id} onUpdate={onUpdate} border />
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
  return (
    <tr className="bg-gray-50/50 dark:bg-white/[0.015]">
      <td colSpan={11} className="px-6 py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

function ImageUploadCard({ label, field, currentUrl, rowId, onUploaded }: {
  label: string;
  field: "image_url" | "sold_screenshot_url";
  currentUrl: string | null;
  rowId: string;
  onUploaded: (url: string) => void;
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

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{label}</p>
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

    onUpdate(rowId, { sell_price: num });

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
