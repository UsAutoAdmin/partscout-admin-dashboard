"use client";

import { useEffect, useState } from "react";
import type { useFleetStatus } from "./useFleetStatus";
import MachineCard from "./MachineCard";

function formatAgo(date: Date | null): string {
  if (!date) return "never";
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s ago`;
}

interface ScraperFleetSectionProps {
  fleet: ReturnType<typeof useFleetStatus>;
}

export default function ScraperFleetSection({ fleet }: ScraperFleetSectionProps) {
  const { machines, loading, refreshing, lastUpdated, error, refresh, sendControl } = fleet;
  const [agoText, setAgoText] = useState("never");

  useEffect(() => {
    const tick = () => setAgoText(formatAgo(lastUpdated));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Scraper Fleet</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">Mac Mini Cluster</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            {refreshing && (
              <svg className="h-3.5 w-3.5 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Updated {agoText}
          </span>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:border-brand-500 dark:hover:text-brand-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-error-50 px-4 py-3 text-sm text-error-700 dark:bg-error-500/10 dark:text-error-300">
          {error}
        </div>
      )}

      {/* Machine list — stacked vertically for breathing room */}
      {loading ? (
        <div className="mt-6 space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {machines.map((machine) => (
            <MachineCard key={machine.key} machine={machine} onControl={sendControl} />
          ))}
        </div>
      )}
    </section>
  );
}
