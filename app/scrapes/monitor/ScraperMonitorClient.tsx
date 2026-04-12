"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type ModeMetrics = {
  status: string;
  rateNum: number;
  targetWorkers: number;
  targetBrowsers: number;
  dbWritesWindow: number;
};

type FleetMachine = {
  key: string;
  label: string;
  ip: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  metrics?: Record<string, ModeMetrics> | null;
  error?: string;
};

type PipelineCounts = {
  deepScraped: number;
  clustered: number;
  scored: number;
  scoredParts: number;
  totalEligible: number;
};

type MonitorData = {
  fleet: FleetMachine[];
  pipeline: PipelineCounts;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const POLL_MS = 5_000;

function pct(num: number, denom: number): string {
  if (denom === 0) return "0%";
  return `${Math.min(100, (num / denom) * 100).toFixed(1)}%`;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

type LogCategory = "deep" | "cluster" | "scoring" | "sold" | "active" | "verify" | "other";

function categorize(line: string): LogCategory {
  const m = line.match(/^\[(\w+)/);
  if (!m) return "other";
  const tag = m[1].toLowerCase();
  if (tag === "deep") return "deep";
  if (tag === "cluster") return "cluster";
  if (tag.startsWith("scor")) return "scoring";
  if (tag === "sold") return "sold";
  if (tag === "active") return "active";
  if (tag === "verify") return "verify";
  return "other";
}

const CATEGORY_COLORS: Record<LogCategory, string> = {
  deep: "text-purple-400",
  cluster: "text-cyan-400",
  scoring: "text-amber-400",
  sold: "text-brand-400",
  active: "text-success-400",
  verify: "text-blue-400",
  other: "text-gray-500",
};

const CATEGORY_LABELS: Record<LogCategory, string> = {
  deep: "Deep",
  cluster: "Cluster",
  scoring: "Score",
  sold: "Sold",
  active: "Active",
  verify: "Verify",
  other: "System",
};

const ALL_CATEGORIES: LogCategory[] = [
  "deep",
  "cluster",
  "scoring",
  "sold",
  "active",
  "verify",
  "other",
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export default function ScraperMonitorClient() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<LogCategory>>(
    new Set(ALL_CATEGORIES)
  );
  const [selectedMini, setSelectedMini] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/scrapes/monitor", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fetch failed");
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, POLL_MS);
    return () => clearInterval(id);
  }, [fetch_]);

  useEffect(() => {
    if (data && !selectedMini && data.fleet.length > 0) {
      setSelectedMini(data.fleet[0].key);
    }
  }, [data, selectedMini]);

  const toggleFilter = (cat: LogCategory) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const pipeline = data?.pipeline;
  const fleet = data?.fleet ?? [];
  const activeMachine = fleet.find((m) => m.key === selectedMini) ?? fleet[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">
            Scraper Monitor
          </p>
          <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white/90">
            Pipeline Progress & Live Logs
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <AgoLabel date={lastUpdated} />
          )}
          <button
            onClick={fetch_}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-400 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      )}

      {/* Pipeline Progress */}
      {pipeline && <PipelineProgress pipeline={pipeline} />}

      {/* Fleet Rate Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {fleet.map((m) => (
          <MiniRateCard
            key={m.key}
            machine={m}
            selected={m.key === selectedMini}
            onSelect={() => setSelectedMini(m.key)}
          />
        ))}
      </div>

      {/* Log Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Filter:
        </span>
        {ALL_CATEGORIES.map((cat) => {
          const active = activeFilters.has(cat);
          return (
            <button
              key={cat}
              onClick={() => toggleFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                active
                  ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
                  : "bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-600"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* Live Log Viewer */}
      {activeMachine && (
        <LogViewer machine={activeMachine} filters={activeFilters} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function AgoLabel({ date }: { date: Date }) {
  const [text, setText] = useState("just now");

  useEffect(() => {
    const tick = () => {
      const secs = Math.round((Date.now() - date.getTime()) / 1000);
      if (secs < 5) setText("just now");
      else if (secs < 60) setText(`${secs}s ago`);
      else setText(`${Math.floor(secs / 60)}m ${secs % 60}s ago`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [date]);

  return (
    <span className="text-xs text-gray-400 dark:text-gray-500">
      Updated {text}
    </span>
  );
}

function PipelineProgress({ pipeline }: { pipeline: PipelineCounts }) {
  const stages = [
    {
      label: "Deep Scraped",
      value: pipeline.deepScraped,
      total: pipeline.totalEligible,
      color: "bg-purple-500",
    },
    {
      label: "Clustered",
      value: pipeline.clustered,
      total: pipeline.totalEligible,
      color: "bg-cyan-500",
    },
    {
      label: "Scored",
      value: pipeline.scored,
      total: pipeline.totalEligible,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
          Pipeline Progress
        </h3>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Eligible:{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {fmt(pipeline.totalEligible)}
            </span>
          </span>
          <span>
            Scored Parts:{" "}
            <span className="font-semibold text-success-600 dark:text-success-400">
              {fmt(pipeline.scoredParts)}
            </span>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {stages.map((s) => (
          <div key={s.label}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-gray-600 dark:text-gray-400">
                {s.label}
              </span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                {fmt(s.value)}{" "}
                <span className="font-normal text-gray-400">
                  / {fmt(s.total)} ({pct(s.value, s.total)})
                </span>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
              <div
                className={`h-full rounded-full transition-all duration-700 ${s.color}`}
                style={{
                  width: `${Math.min(100, s.total > 0 ? (s.value / s.total) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MODE_COLORS: Record<string, string> = {
  sold: "text-brand-600 dark:text-brand-400",
  active: "text-success-600 dark:text-success-400",
  deep: "text-purple-600 dark:text-purple-400",
  verify: "text-blue-600 dark:text-blue-400",
};

function MiniRateCard({
  machine,
  selected,
  onSelect,
}: {
  machine: FleetMachine;
  selected: boolean;
  onSelect: () => void;
}) {
  const metrics = machine.metrics ?? {};
  const modes = Object.keys(metrics);
  const totalRate = modes.reduce((s, m) => s + (metrics[m]?.rateNum ?? 0), 0);
  const totalWrites = modes.reduce((s, m) => s + (metrics[m]?.dbWritesWindow ?? 0), 0);
  const activeModes = modes.filter((m) => metrics[m]?.status && metrics[m].status !== "idle");

  const borderColor = selected
    ? "border-brand-400 dark:border-brand-500"
    : machine.running
      ? "border-success-200 dark:border-success-700/50"
      : machine.error
        ? "border-error-200 dark:border-error-700/50"
        : "border-gray-200 dark:border-gray-800";

  const ringClass = selected ? "ring-2 ring-brand-500/20" : "";

  return (
    <button
      onClick={onSelect}
      className={`rounded-2xl border ${borderColor} ${ringClass} bg-white p-4 text-left transition-all hover:shadow-md dark:bg-white/[0.03]`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {machine.label}
          </h4>
          {machine.running ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-error-400" />
          )}
        </div>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {machine.ip}
        </span>
      </div>

      {machine.error ? (
        <p className="mt-2 text-xs text-error-500 line-clamp-2">
          {machine.error}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniMetric label="Total/min" value={totalRate.toFixed(1)} accent="text-gray-900 dark:text-white" />
            {modes.map((m) => (
              <MiniMetric
                key={m}
                label={`${m}/min`}
                value={metrics[m]?.rateNum?.toFixed(1) ?? "—"}
                accent={MODE_COLORS[m] ?? "text-gray-600 dark:text-gray-300"}
              />
            ))}
          </div>
          {activeModes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeModes.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase dark:bg-white/5 text-gray-500 dark:text-gray-400"
                >
                  {m}: {metrics[m].status}
                </span>
              ))}
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
                {totalWrites} writes/5m
              </span>
            </div>
          )}
        </>
      )}
    </button>
  );
}

function MiniMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <div className={`text-lg font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}

function LogViewer({
  machine,
  filters,
}: {
  machine: FleetMachine;
  filters: Set<LogCategory>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const allLines = machine.logTail ?? [];
  const filtered = allLines.filter((line) => filters.has(categorize(line)));

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-950 dark:border-gray-800">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
            {machine.label} — Live Logs
          </span>
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-400">
            {filtered.length} lines
          </span>
        </div>
        <span className="font-mono text-[11px] text-gray-600">
          PID {machine.pid ?? "—"}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[500px] min-h-[300px] overflow-auto p-3 font-mono text-[12px] leading-5"
      >
        {filtered.length === 0 ? (
          <p className="text-gray-600">No matching log lines…</p>
        ) : (
          filtered.map((line, i) => {
            const cat = categorize(line);
            const isError =
              line.toLowerCase().includes("error") ||
              line.includes("FATAL") ||
              line.includes("Rate limited");
            const isSuccess =
              line.includes("clustered") ||
              line.includes("scored") ||
              line.includes("✓");

            let lineColor = "text-gray-400";
            if (isError) lineColor = "text-error-400";
            else if (isSuccess) lineColor = "text-success-400";

            return (
              <div key={i} className={`flex gap-2 ${lineColor}`}>
                <span
                  className={`shrink-0 w-[52px] text-right ${CATEGORY_COLORS[cat]}`}
                >
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="select-all break-all">{line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
