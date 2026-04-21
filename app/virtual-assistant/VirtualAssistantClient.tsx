"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MachineRun = {
  name: string;
  ip: string;
  kind: string;
  ok: boolean;
  deepStatus: string;
  action: string;
  error: string;
};

type WatchdogRun = {
  id: string;
  timestamp: string;
  ok: boolean;
  machines: MachineRun[];
};

type CronJob = {
  id: string;
  name: string;
  schedule: string;
  description: string;
  runs: WatchdogRun[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Group runs by calendar date (local) */
function groupByDate(runs: WatchdogRun[]): Map<string, WatchdogRun[]> {
  const map = new Map<string, WatchdogRun[]>();
  for (const run of runs) {
    const key = new Date(run.timestamp).toLocaleDateString("en-CA"); // YYYY-MM-DD
    const arr = map.get(key) ?? [];
    arr.push(run);
    map.set(key, arr);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Heatmap Grid                                                       */
/* ------------------------------------------------------------------ */

function HeatmapGrid({
  runs,
  onSelectRun,
  selectedRunId,
}: {
  runs: WatchdogRun[];
  onSelectRun: (run: WatchdogRun) => void;
  selectedRunId: string | null;
}) {
  const byDate = groupByDate(runs);

  // Fill in missing dates for last 30 days
  const today = new Date();
  const allDates: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    allDates.push(d.toLocaleDateString("en-CA"));
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Day labels on top for latest week */}
      <div className="flex items-end gap-1 flex-wrap">
        {allDates.map((date) => {
          const dayRuns = byDate.get(date) ?? [];
          const hasRuns = dayRuns.length > 0;

          return (
            <div key={date} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-gray-500 dark:text-gray-600">
                {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "narrow",
                })}
              </span>
              <div className="flex flex-col gap-[2px]">
                {hasRuns ? (
                  dayRuns.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => onSelectRun(run)}
                      title={`${fmtTime(run.timestamp)} — ${run.ok ? "OK" : "FAILED"}`}
                      className={`w-3 h-3 rounded-[3px] transition-all hover:scale-125 hover:ring-2 hover:ring-offset-1 dark:hover:ring-offset-gray-900 ${
                        selectedRunId === run.id
                          ? "ring-2 ring-offset-1 dark:ring-offset-gray-900 ring-brand-500 scale-125"
                          : ""
                      } ${
                        run.ok
                          ? "bg-success-500 hover:ring-success-400"
                          : "bg-error-500 hover:ring-error-400"
                      }`}
                    />
                  ))
                ) : (
                  <div className="w-3 h-3 rounded-[3px] bg-gray-100 dark:bg-gray-800" />
                )}
              </div>
              <span className="text-[8px] text-gray-400 dark:text-gray-600">
                {new Date(date + "T12:00:00").getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Compact Heatmap (collapsed job view — last 50 runs inline)         */
/* ------------------------------------------------------------------ */

function CompactHeatmap({
  runs,
  onSelectRun,
  selectedRunId,
}: {
  runs: WatchdogRun[];
  onSelectRun: (run: WatchdogRun) => void;
  selectedRunId: string | null;
}) {
  const recent = runs.slice(-60);

  return (
    <div className="flex items-center gap-[3px] flex-wrap">
      {recent.map((run) => (
        <button
          key={run.id}
          onClick={() => onSelectRun(run)}
          title={`${fmtTime(run.timestamp)} — ${run.ok ? "OK" : "FAILED"}`}
          className={`w-2.5 h-2.5 rounded-[2px] transition-all hover:scale-150 ${
            selectedRunId === run.id
              ? "ring-2 ring-offset-1 dark:ring-offset-gray-900 ring-brand-500 scale-150"
              : ""
          } ${
            run.ok
              ? "bg-success-500"
              : "bg-error-500"
          }`}
        />
      ))}
      {recent.length === 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-600 italic">
          No runs yet
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Run Detail Panel                                                   */
/* ------------------------------------------------------------------ */

function RunDetail({ run }: { run: WatchdogRun }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${
              run.ok ? "bg-success-500" : "bg-error-500"
            }`}
          />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">
            {run.ok ? "All Systems OK" : "Issues Detected"}
          </h4>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-500">
          {fmtTime(run.timestamp)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {run.machines.map((m) => (
          <div
            key={m.name}
            className={`rounded-lg border p-3 ${
              m.ok
                ? "border-success-200 dark:border-success-900/40 bg-success-50 dark:bg-success-500/[0.06]"
                : "border-error-200 dark:border-error-900/40 bg-error-50 dark:bg-error-500/[0.06]"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white/90">
                {m.name}
              </span>
              <span
                className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                  m.ok
                    ? "text-success-700 dark:text-success-400 bg-success-100 dark:bg-success-500/20"
                    : "text-error-700 dark:text-error-400 bg-error-100 dark:bg-error-500/20"
                }`}
              >
                {m.ok ? "OK" : "ISSUE"}
              </span>
            </div>
            <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Deep Status</span>
                <span
                  className={`font-mono ${
                    m.deepStatus === "running"
                      ? "text-success-600 dark:text-success-400"
                      : m.deepStatus === "queue_empty"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-error-600 dark:text-error-400"
                  }`}
                >
                  {m.deepStatus === "queue_empty" ? "idle (queue empty)" : m.deepStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span>IP</span>
                <span className="font-mono">{m.ip}</span>
              </div>
              {m.action !== "none" && (
                <div className="flex justify-between">
                  <span>Action</span>
                  <span className="font-mono text-warning-600 dark:text-warning-400">
                    {m.action}
                  </span>
                </div>
              )}
              {m.error && (
                <div className="mt-1 text-error-600 dark:text-error-400">
                  {m.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job Card (expandable)                                              */
/* ------------------------------------------------------------------ */

function JobCard({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedRun, setSelectedRun] = useState<WatchdogRun | null>(null);

  const totalRuns = job.runs.length;
  const okRuns = job.runs.filter((r) => r.ok).length;
  const failedRuns = totalRuns - okRuns;
  const lastRun = job.runs[job.runs.length - 1] ?? null;
  const successRate =
    totalRuns > 0 ? Math.round((okRuns / totalRuns) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => {
          setExpanded(!expanded);
          if (expanded) setSelectedRun(null);
        }}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        {/* Status indicator */}
        <div className="mt-1 flex-shrink-0">
          <div
            className={`h-3 w-3 rounded-full ${
              lastRun?.ok !== false ? "bg-success-500" : "bg-error-500"
            }`}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
              {job.name}
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {job.schedule}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
            {job.description}
          </p>

          {/* Compact heatmap */}
          <CompactHeatmap
            runs={job.runs}
            onSelectRun={(run) => {
              setSelectedRun(run);
              setExpanded(true);
            }}
            selectedRunId={selectedRun?.id ?? null}
          />
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 text-right space-y-1">
          <div className="text-xs text-gray-500 dark:text-gray-500">
            {lastRun ? timeAgo(lastRun.timestamp) : "never"}
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs text-success-600 dark:text-success-400 font-medium">
              {okRuns}
            </span>
            <span className="text-gray-300 dark:text-gray-700">/</span>
            {failedRuns > 0 && (
              <>
                <span className="text-xs text-error-600 dark:text-error-400 font-medium">
                  {failedRuns}
                </span>
                <span className="text-gray-300 dark:text-gray-700">/</span>
              </>
            )}
            <span className="text-xs text-gray-500">{totalRuns} runs</span>
          </div>
          <div
            className={`text-xs font-medium ${
              successRate >= 90
                ? "text-success-600 dark:text-success-400"
                : successRate >= 50
                ? "text-warning-600 dark:text-warning-400"
                : "text-error-600 dark:text-error-400"
            }`}
          >
            {successRate}% uptime
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`mt-1 w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-5 py-4 space-y-4">
          {/* Full heatmap */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
              Run History (Last 30 Days)
            </h4>
            <HeatmapGrid
              runs={job.runs}
              onSelectRun={setSelectedRun}
              selectedRunId={selectedRun?.id ?? null}
            />
          </div>

          {/* Run detail */}
          {selectedRun ? (
            <RunDetail run={selectedRun} />
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-600 text-center py-4 italic">
              Click a square above to view run details
            </p>
          )}

          {/* Recent runs list */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
              Recent Runs
            </h4>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
              {[...job.runs]
                .reverse()
                .slice(0, 20)
                .map((run) => (
                  <button
                    key={run.id}
                    onClick={() => setSelectedRun(run)}
                    className={`w-full text-left flex items-center gap-3 py-2 px-2 rounded hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors ${
                      selectedRun?.id === run.id
                        ? "bg-brand-50/50 dark:bg-brand-500/[0.06]"
                        : ""
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        run.ok ? "bg-success-500" : "bg-error-500"
                      }`}
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">
                      {fmtTime(run.timestamp)}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-600">
                      {run.machines.filter((m) => m.ok).length}/{run.machines.length} OK
                    </span>
                    {run.machines.some((m) => m.action !== "none") && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warning-100 dark:bg-warning-500/20 text-warning-700 dark:text-warning-400">
                        action taken
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function VirtualAssistantClient() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/virtual-assistant/runs");
      const data = await res.json();
      const runs: WatchdogRun[] = data.runs ?? [];

      const cronJobs: CronJob[] = [
        {
          id: "fleet-watchdog",
          name: "Fleet Watchdog",
          schedule: "*/10 * * * *",
          description:
            "Checks all Mac minis are running deep scrape mode. Restarts deep if idle, relaunches local process if unreachable.",
          runs,
        },
      ];

      setJobs(cronJobs);
    } catch {
      // keep existing state on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 30_000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  const totalRuns = jobs.reduce((acc, j) => acc + j.runs.length, 0);
  const totalOk = jobs.reduce(
    (acc, j) => acc + j.runs.filter((r) => r.ok).length,
    0
  );
  const totalFailed = totalRuns - totalOk;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard label="Cron Jobs" value={jobs.length} />
        <SummaryCard label="Total Runs" value={totalRuns} />
        <SummaryCard label="Successful" value={totalOk} color="success" />
        <SummaryCard
          label="Failed"
          value={totalFailed}
          color={totalFailed > 0 ? "error" : "default"}
        />
      </div>

      {/* Jobs list */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
          Scheduled Jobs
        </h3>
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
              />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-600">
            No cron jobs configured yet
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary Card                                                       */
/* ------------------------------------------------------------------ */

function SummaryCard({
  label,
  value,
  color = "default",
}: {
  label: string;
  value: number | string;
  color?: "default" | "success" | "error" | "warning";
}) {
  const colorClasses = {
    default: "text-gray-900 dark:text-white/90",
    success: "text-success-600 dark:text-success-400",
    error: "text-error-600 dark:text-error-400",
    warning: "text-warning-600 dark:text-warning-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] p-4">
      <p className="text-xs text-gray-500 dark:text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${colorClasses[color]}`}>
        {value}
      </p>
    </div>
  );
}
