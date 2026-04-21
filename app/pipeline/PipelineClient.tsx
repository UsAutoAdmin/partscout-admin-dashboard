"use client";

import { useEffect, useState, useRef } from "react";
import { MetricCard } from "@/components/MetricCard";

interface Phase {
  id: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  progress: number;
  total: number;
  startedAt: string | null;
  completedAt: string | null;
  details: string;
}

interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

interface PipelineState {
  phases: Phase[];
  log: LogEntry[];
  summary: {
    totalPartsShipped: number;
    totalPartsReady: number;
    projectedParts: string;
    paidUsers: number;
  };
}

const STATUS_COLORS: Record<Phase["status"], string> = {
  pending: "bg-gray-200 dark:bg-gray-700",
  running: "bg-brand-500",
  completed: "bg-success-500",
  failed: "bg-error-500",
  skipped: "bg-gray-400 dark:bg-gray-600",
};

const STATUS_LABELS: Record<Phase["status"], string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

const STATUS_TEXT_COLORS: Record<Phase["status"], string> = {
  pending: "text-gray-500 dark:text-gray-400",
  running: "text-brand-600 dark:text-brand-400",
  completed: "text-success-600 dark:text-success-400",
  failed: "text-error-600 dark:text-error-400",
  skipped: "text-gray-500 dark:text-gray-400",
};

const LOG_LEVEL_COLORS: Record<LogEntry["level"], string> = {
  info: "text-blue-light-500 dark:text-blue-light-400",
  warn: "text-warning-500 dark:text-warning-400",
  error: "text-error-500 dark:text-error-400",
  success: "text-success-500 dark:text-success-400",
};

const LOG_LEVEL_BG: Record<LogEntry["level"], string> = {
  info: "bg-blue-light-500/10",
  warn: "bg-warning-500/10",
  error: "bg-error-500/10",
  success: "bg-success-500/10",
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(start: string, end?: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function PhaseCard({ phase, index }: { phase: Phase; index: number }) {
  const pct = phase.total > 0 ? Math.min((phase.progress / phase.total) * 100, 100) : 0;
  const isActive = phase.status === "running";

  return (
    <div
      className={`relative rounded-2xl border p-5 transition-all ${
        isActive
          ? "border-brand-300 dark:border-brand-500/40 bg-brand-50/30 dark:bg-brand-500/[0.05] shadow-sm"
          : "border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
              phase.status === "completed"
                ? "bg-success-100 dark:bg-success-500/20 text-success-600 dark:text-success-400"
                : phase.status === "running"
                  ? "bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            }`}
          >
            {phase.status === "completed" ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3.333 8l3.334 3.333 6.666-6.666" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              index + 1
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">{phase.name}</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{phase.description}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TEXT_COLORS[phase.status]}`}>
            {isActive && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" /></span>}
            {STATUS_LABELS[phase.status]}
          </span>
          {phase.startedAt && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {formatDuration(phase.startedAt, phase.completedAt)}
            </span>
          )}
        </div>
      </div>

      {(phase.status === "running" || phase.status === "completed") && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatNumber(phase.progress)} / {formatNumber(phase.total)}
            </span>
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${STATUS_COLORS[phase.status]} ${
                isActive ? "animate-pulse" : ""
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {phase.details && (
            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">{phase.details}</p>
          )}
        </div>
      )}

      {phase.status === "pending" && phase.details && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 ml-11">{phase.details}</p>
      )}
    </div>
  );
}

function LiveLog({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
          </span>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">Live Log</h3>
          <span className="text-xs text-gray-400">({logs.length} entries)</span>
        </div>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-xs px-2 py-1 rounded-md transition-colors ${
            autoScroll
              ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500"
          }`}
        >
          {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
        </button>
      </div>
      <div
        ref={scrollRef}
        className="h-[360px] overflow-y-auto font-mono text-xs"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollTop < 10);
        }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">No log entries yet</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {logs.map((entry, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 pt-0.5 w-[130px]">
                  {new Date(entry.ts).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })}
                </span>
                <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${LOG_LEVEL_BG[entry.level]} ${LOG_LEVEL_COLORS[entry.level]}`}>
                  {entry.level}
                </span>
                <span className="text-gray-700 dark:text-gray-300 break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelineClient() {
  const [state, setState] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchState() {
    try {
      const res = await fetch("/api/pipeline");
      if (!res.ok) throw new Error("Failed to fetch pipeline state");
      const data = await res.json();
      setState(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-error-500">{error || "No pipeline state found"}</p>
        <button onClick={fetchState} className="text-sm text-brand-500 hover:underline">Retry</button>
      </div>
    );
  }

  const completedPhases = state.phases.filter((p) => p.status === "completed").length;
  const runningPhase = state.phases.find((p) => p.status === "running");
  const totalProgress = state.phases.reduce((s, p) => s + p.progress, 0);
  const totalItems = state.phases.reduce((s, p) => s + p.total, 0);
  const overallPct = totalItems > 0 ? (totalProgress / totalItems) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Parts Shipped" value={state.summary.totalPartsShipped.toLocaleString()} color="success" subtext={`To ${state.summary.paidUsers} users`} />
        <MetricCard label="Parts Ready" value={state.summary.totalPartsReady.toLocaleString()} color="brand" subtext="Normalized & verified" />
        <MetricCard label="Projected Total" value={state.summary.projectedParts} color="info" subtext="After all phases" />
        <MetricCard
          label="Overall Progress"
          value={`${overallPct.toFixed(1)}%`}
          color={runningPhase ? "warning" : "success"}
          subtext={`${completedPhases}/${state.phases.length} phases done`}
        />
      </div>

      {/* Overall progress bar */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">Pipeline Progress</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {runningPhase ? `Active: ${runningPhase.name}` : "All phases complete"}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-700 ease-out"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-gray-400">
          <span>{formatNumber(totalProgress)} processed</span>
          <span>{formatNumber(totalItems)} total</span>
        </div>
      </div>

      {/* Phase cards */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white/90">Phases</h2>
        <div className="space-y-3">
          {state.phases.map((phase, i) => (
            <PhaseCard key={phase.id} phase={phase} index={i} />
          ))}
        </div>
      </div>

      {/* Live log */}
      <LiveLog logs={state.log} />
    </div>
  );
}
