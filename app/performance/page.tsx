"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Video {
  id: number;
  transcript: string;
  views: number | null;
  skip_rate: number | null;
  like_rate: number | null;
  share_rate: number | null;
  comment_rate: number | null;
  save_rate: number | null;
  retention_pct: number | null;
}

interface Stats {
  total: number | null;
  avg_views: number | null;
  avg_skip_rate: number | null;
  avg_like_rate: number | null;
  avg_retention: number | null;
}

interface ModalFields {
  id: number | null;
  transcript: string;
  views: string;
  skip_rate: string;
  like_rate: string;
  share_rate: string;
  comment_rate: string;
  save_rate: string;
  retention_pct: string;
}

const emptyFields: ModalFields = {
  id: null,
  transcript: "",
  views: "",
  skip_rate: "",
  like_rate: "",
  share_rate: "",
  comment_rate: "",
  save_rate: "",
  retention_pct: "",
};

function numOrNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export default function PerformancePage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [stats, setStats] = useState<Stats>({ total: null, avg_views: null, avg_skip_rate: null, avg_like_rate: null, avg_retention: null });
  const [search, setSearch] = useState("");
  const [backendOnline, setBackendOnline] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [fields, setFields] = useState<ModalFields>(emptyFields);
  const [replaceAll, setReplaceAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loadVideos = useCallback(async (q = "") => {
    try {
      const res = await fetch(`/api/content-machine/api/videos?search=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setVideos(data.videos || []);
      setBackendOnline(true);
    } catch {
      setBackendOnline(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/content-machine/api/stats");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStats(data);
    } catch { /* stats will show default */ }
  }, []);

  const loadAll = useCallback(() => { loadVideos(search); loadStats(); }, [loadVideos, loadStats, search]);

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = useCallback((val: string) => {
    setSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => loadVideos(val), 300);
  }, [loadVideos]);

  const openEdit = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/content-machine/api/videos/${id}`);
      const v = await res.json();
      setFields({
        id: v.id,
        transcript: v.transcript || "",
        views: v.views ?? "",
        skip_rate: v.skip_rate ?? "",
        like_rate: v.like_rate ?? "",
        share_rate: v.share_rate ?? "",
        comment_rate: v.comment_rate ?? "",
        save_rate: v.save_rate ?? "",
        retention_pct: v.retention_pct ?? "",
      });
      setModalOpen(true);
    } catch { /* ignore */ }
  }, []);

  const openAdd = useCallback(() => { setFields(emptyFields); setModalOpen(true); }, []);

  const saveVideo = useCallback(async () => {
    const body = {
      transcript: fields.transcript,
      views: numOrNull(String(fields.views)),
      skip_rate: numOrNull(String(fields.skip_rate)),
      like_rate: numOrNull(String(fields.like_rate)),
      share_rate: numOrNull(String(fields.share_rate)),
      comment_rate: numOrNull(String(fields.comment_rate)),
      save_rate: numOrNull(String(fields.save_rate)),
      retention_pct: numOrNull(String(fields.retention_pct)),
    };
    if (fields.id) {
      await fetch(`/api/content-machine/api/videos/${fields.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/content-machine/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setModalOpen(false);
    loadAll();
  }, [fields, loadAll]);

  const deleteVideo = useCallback(async () => {
    if (!fields.id || !confirm("Delete this record?")) return;
    await fetch(`/api/content-machine/api/videos/${fields.id}`, { method: "DELETE" });
    setModalOpen(false);
    loadAll();
  }, [fields.id, loadAll]);

  const handleImport = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("replace", replaceAll ? "true" : "false");
    try {
      const res = await fetch("/api/content-machine/api/import", { method: "POST", body: fd });
      const data = await res.json();
      alert(`Imported ${data.imported} videos.${data.errors?.length ? ` Errors: ${data.errors.join(", ")}` : ""}`);
      loadAll();
    } catch {
      alert("Import failed");
    }
  }, [replaceAll, loadAll]);

  const numCell = (val: number | null) =>
    val == null ? <span className="text-gray-400 dark:text-gray-600 italic text-xs">--</span> : String(val);

  return (
    <DashboardLayout title="Performance Tracker">
      {!backendOnline && (
        <div className="rounded-2xl border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50 dark:bg-yellow-900/10 p-4 mb-6">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            ContentMachine backend is offline. Start it with: <code className="font-mono bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">uvicorn app:app --reload</code>
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Videos", value: stats.total != null ? stats.total.toLocaleString() : "--" },
          { label: "Avg Views", value: stats.avg_views != null ? Math.round(stats.avg_views).toLocaleString() : "--" },
          { label: "Avg Skip Rate", value: stats.avg_skip_rate != null ? stats.avg_skip_rate.toFixed(1) + "%" : "--" },
          { label: "Avg Retention", value: stats.avg_retention != null ? stats.avg_retention.toFixed(1) + "%" : "--" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white/90 font-mono">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.656a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search transcripts..."
              className="w-60 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white/90 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{videos.length} rows</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Import CSV
          </button>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} className="accent-brand-500" />
            Replace all
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ""; }}
          />
          <button
            onClick={openAdd}
            className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600 transition-colors"
          >
            + Add Video
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-14">#</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 min-w-[280px]">Transcript</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Views</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-20">Skip %</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-20">Like %</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 w-24">Retention %</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v, i) => (
                <tr
                  key={v.id}
                  onClick={() => openEdit(v.id)}
                  className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors ${
                    i % 2 === 0 ? "" : "bg-gray-50/50 dark:bg-gray-800/20"
                  }`}
                >
                  <td className="px-3 py-2.5 text-center text-xs text-gray-400 dark:text-gray-500 font-mono">{v.id}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-300 truncate max-w-[420px]">
                    {(v.transcript || "").slice(0, 100)}{(v.transcript || "").length > 100 ? "..." : ""}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-gray-700 dark:text-gray-300">{v.views != null ? Number(v.views).toLocaleString() : numCell(null)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-gray-700 dark:text-gray-300">{numCell(v.skip_rate)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-gray-700 dark:text-gray-300">{numCell(v.like_rate)}</td>
                  <td className="px-3 py-2.5 text-right text-xs font-mono text-gray-700 dark:text-gray-300">{numCell(v.retention_pct)}</td>
                </tr>
              ))}
              {videos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    {backendOnline ? "No videos found" : "Backend offline"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white/90">
                {fields.id ? `Edit Video #${fields.id}` : "Add Video"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg">×</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Transcript</label>
                <textarea
                  value={fields.transcript}
                  onChange={(e) => setFields((p) => ({ ...p, transcript: e.target.value }))}
                  placeholder="Paste transcript..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: "views", label: "Views" },
                  { key: "skip_rate", label: "Skip Rate %" },
                  { key: "like_rate", label: "Like Rate %" },
                  { key: "share_rate", label: "Share Rate %" },
                  { key: "comment_rate", label: "Comment Rate %" },
                  { key: "save_rate", label: "Save Rate %" },
                  { key: "retention_pct", label: "Retention %" },
                ] as const).map((f) => (
                  <div key={f.key}>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={fields[f.key]}
                      onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder="--"
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs font-mono text-gray-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 p-5 border-t border-gray-200 dark:border-gray-800">
              {fields.id && (
                <button
                  onClick={deleteVideo}
                  className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors mr-auto"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ml-auto"
              >
                Cancel
              </button>
              <button
                onClick={saveVideo}
                className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
