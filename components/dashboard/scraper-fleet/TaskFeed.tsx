"use client";

import { useEffect, useRef, useState } from "react";
import type { RecentTask } from "./useFleetStatus";

interface TaskFeedProps {
  mode: "sold" | "active";
  recentTasks: RecentTask[];
  logTail: string[];
}

const accent = {
  sold: {
    label: "Sold",
    border: "border-brand-200 dark:border-brand-800/40",
    header: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
  },
  active: {
    label: "Active",
    border: "border-success-200 dark:border-success-800/40",
    header: "bg-success-50 text-success-700 dark:bg-success-950 dark:text-success-300",
  },
};

function parseSystemLines(logTail: string[], mode: "sold" | "active"): string[] {
  const tags = mode === "sold" ? ["sold", "verify"] : ["active"];
  return logTail
    .filter((line) => {
      const m = line.match(/^\[(\w+)\]/);
      if (!m) return false;
      if (!tags.includes(m[1])) return false;
      return !line.includes("✓") && !line.includes("✗");
    })
    .slice(-5);
}

export default function TaskFeed({ mode, recentTasks, logTail }: TaskFeedProps) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const a = accent[mode];

  const tasks = recentTasks.slice(-50);
  const systemLines = parseSystemLines(logTail, mode);
  const totalCount = tasks.length;

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, tasks.length]);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 border ${a.border} px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${a.header} ${expanded ? "rounded-t-xl" : "rounded-xl"}`}
      >
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {a.label} feed
        {totalCount > 0 && (
          <span className="ml-auto tabular-nums opacity-60">{totalCount}</span>
        )}
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className={`max-h-[280px] overflow-auto rounded-b-xl border border-t-0 ${a.border} bg-white dark:bg-gray-950`}
        >
          {tasks.length === 0 && systemLines.length === 0 ? (
            <p className="p-3 text-xs text-gray-400">Waiting for tasks…</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {/* System messages at the top */}
              {systemLines.map((line, i) => (
                <div key={`sys-${i}`} className="px-4 py-1.5 text-[11px] italic text-gray-400 dark:text-gray-500">
                  {line.replace(/^\[\w+\]\s*/, "")}
                </div>
              ))}

              {/* Structured task rows */}
              {tasks.map((task, i) => {
                const isError = !!task.error;
                const durSec = task.durationMs != null ? (task.durationMs / 1000).toFixed(1) + "s" : "";
                return (
                  <div
                    key={i}
                    className={`flex items-baseline gap-3 px-4 py-1.5 text-[12px] ${
                      isError ? "bg-error-50/50 dark:bg-error-950/20" : ""
                    }`}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-500">
                      {task.time ?? ""}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        isError
                          ? "text-error-600 dark:text-error-400"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                      title={isError ? `${task.query} — ${task.error}` : task.query}
                    >
                      {task.query || "—"}
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        isError
                          ? "text-error-500"
                          : (task.count ?? 0) > 0
                            ? "text-success-600 dark:text-success-400"
                            : "text-gray-300 dark:text-gray-600"
                      }`}
                    >
                      {isError ? "ERR" : task.count ?? 0}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-gray-400 dark:text-gray-500">
                      {durSec}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
