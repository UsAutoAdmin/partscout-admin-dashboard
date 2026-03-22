"use client";

import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

type Tab = "single" | "bulk";

interface Insights {
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
}

interface BulkEvent {
  type: string;
  message: string;
  current?: number;
  total?: number;
  url?: string;
  transcript?: string;
  video_id?: number;
  views?: number;
  similarity?: number;
  matched_id?: number;
  transcribed?: number;
}

function formatCount(v: number | null | undefined) {
  if (v == null) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}

const MODELS = [
  { value: "tiny", label: "Tiny (fastest)" },
  { value: "base", label: "Base" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large-v2", label: "Large v2" },
  { value: "large-v3", label: "Large v3 (most accurate)" },
];

export default function TranscriberPage() {
  const [tab, setTab] = useState<Tab>("single");

  return (
    <DashboardLayout title="Transcriber">
      <div className="max-w-3xl mx-auto">
        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 mb-6 w-fit">
          {(["single", "bulk"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t === "single" ? "Single Reel" : "Bulk Transcribe"}
            </button>
          ))}
        </div>

        {tab === "single" ? <SingleTranscriber /> : <BulkTranscriber />}
      </div>
    </DashboardLayout>
  );
}

function SingleTranscriber() {
  const [url, setUrl] = useState("");
  const [model, setModel] = useState("base");
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [trackerFields, setTrackerFields] = useState({ views: "", skip_rate: "", like_rate: "", retention_pct: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setTranscription("");
    setInsights(null);
    setSaveMsg("");

    try {
      const fd = new FormData();
      fd.append("url", url.trim());
      fd.append("model_size", model);
      const res = await fetch("/api/content-machine/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.success) {
        setTranscription(data.transcription);
        setInsights(data.insights);
        setTrackerFields({ views: "", skip_rate: "", like_rate: "", retention_pct: "" });
      } else {
        setError(data.detail || data.error || "Transcription failed");
      }
    } catch {
      setError("Failed to connect. Is ContentMachine running?");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToTracker = async () => {
    if (!transcription) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const payload: Record<string, unknown> = { transcript: transcription };
      if (trackerFields.views) payload.views = parseInt(trackerFields.views);
      if (trackerFields.skip_rate) payload.skip_rate = parseFloat(trackerFields.skip_rate);
      if (trackerFields.like_rate) payload.like_rate = parseFloat(trackerFields.like_rate);
      if (trackerFields.retention_pct) payload.retention_pct = parseFloat(trackerFields.retention_pct);

      const res = await fetch("/api/content-machine/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setSaveMsg(`Saved to tracker (ID #${data.id})`);
      } else {
        setSaveMsg("Failed to save");
      }
    } catch {
      setSaveMsg("Error saving to tracker");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90 mb-1">Transcribe a Reel</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Paste an Instagram reel URL to get the transcription and engagement insights</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Instagram Reel URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              required
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white/90 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Model:</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Transcribing..." : "Transcribe"}
          </button>
        </form>
      </div>

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Views", value: formatCount(insights.view_count) },
            { label: "Likes", value: formatCount(insights.like_count) },
            { label: "Comments", value: formatCount(insights.comment_count) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
              <p className="text-xl font-bold text-brand-600 dark:text-brand-400 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Transcription result */}
      {transcription && (
        <div className="rounded-2xl border border-green-200 dark:border-green-800/50 bg-white dark:bg-white/[0.03] p-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Transcription</h3>
          <p className="text-sm text-gray-900 dark:text-white/90 leading-relaxed whitespace-pre-wrap font-mono">{transcription}</p>

          <button
            onClick={() => navigator.clipboard.writeText(transcription)}
            className="mt-3 text-xs font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
          >
            Copy to clipboard
          </button>
        </div>
      )}

      {/* Save to tracker */}
      {transcription && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Add to Performance Tracker</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { key: "views", label: "Views", placeholder: "e.g. 5000", type: "number" },
              { key: "skip_rate", label: "Skip Rate %", placeholder: "e.g. 32.5", type: "number" },
              { key: "like_rate", label: "Like Rate %", placeholder: "e.g. 3.5", type: "number" },
              { key: "retention_pct", label: "Retention %", placeholder: "e.g. 35", type: "number" },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{f.label}</label>
                <input
                  type={f.type}
                  step="0.01"
                  placeholder={f.placeholder}
                  value={trackerFields[f.key as keyof typeof trackerFields]}
                  onChange={(e) => setTrackerFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white/90 font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveToTracker}
            disabled={saving}
            className="rounded-xl bg-green-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-600 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save to Tracker"}
          </button>
          {saveMsg && <p className={`mt-2 text-xs font-medium ${saveMsg.includes("Saved") ? "text-green-500" : "text-red-500"}`}>{saveMsg}</p>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Downloading and transcribing... this may take a moment.</p>
      )}
    </div>
  );
}

function BulkTranscriber() {
  const [profileUrl, setProfileUrl] = useState("");
  const [model, setModel] = useState("base");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<BulkEvent[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  const stop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (!profileUrl.trim()) return;
    setRunning(true);
    setEvents([]);
    setProgress({ current: 0, total: 0 });
    setSummary("");

    const qs = new URLSearchParams({ profile_url: profileUrl.trim(), model_size: model });
    const es = new EventSource(`/api/content-machine/api/bulk-transcribe?${qs}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      const d: BulkEvent = JSON.parse(e.data);
      setEvents((prev) => [d, ...prev]);

      if (d.current && d.total) setProgress({ current: d.current, total: d.total });

      if (d.type === "done" || d.type === "duplicate") {
        setSummary(d.message);
        stop();
      }
      if (d.type === "error") stop();
    };

    es.onerror = () => {
      setEvents((prev) => [{ type: "error", message: "Connection lost." }, ...prev]);
      stop();
    };
  }, [profileUrl, model, stop]);

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const iconForType = (type: string) => {
    switch (type) {
      case "transcribed": return { icon: "✓", cls: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" };
      case "error": case "reel_error": return { icon: "!", cls: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400" };
      case "duplicate": return { icon: "■", cls: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400" };
      case "done": return { icon: "✓", cls: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" };
      default: return { icon: "i", cls: "bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400" };
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90 mb-1">Bulk Transcribe</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Paste an Instagram profile link to transcribe all reels automatically.
          Stops when it finds a reel that already exists in your Performance Tracker.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Instagram Profile URL</label>
            <input
              type="url"
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.instagram.com/username/"
              disabled={running}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white/90 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500/50 font-mono disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Model:</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={running}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={start}
              disabled={running || !profileUrl.trim()}
              className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? "Running..." : "Start Bulk Transcribe"}
            </button>
            {running && (
              <button onClick={stop} className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors">
                Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      {(running || events.length > 0) && (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-100 dark:bg-gray-800 h-2 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>

          {summary && (
            <div className="rounded-2xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/10 p-4">
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">{summary}</p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden max-h-[400px] overflow-y-auto">
            {events.map((evt, i) => {
              const { icon, cls } = iconForType(evt.type);
              return (
                <div key={i} className="flex items-start gap-3 p-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cls}`}>
                    {icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 dark:text-white/90">{evt.message}</p>
                    {evt.transcript && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate font-mono">{evt.transcript}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
