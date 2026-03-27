"use client";

import { useState } from "react";
import type { ControlAction, ControlResult, FleetMachine } from "./useFleetStatus";
import ModeControls from "./ModeControls";
import TaskFeed from "./TaskFeed";

interface MachineCardProps {
  machine: FleetMachine;
  onControl: (key: string, action: ControlAction, mode?: "sold" | "active", value?: number) => Promise<ControlResult>;
}

export default function MachineCard({ machine, onControl }: MachineCardProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const sold = machine.metrics?.sold;
  const active = machine.metrics?.active;

  const handleGlobalAction = async (action: "restart" | "stop") => {
    setBusy(action);
    await onControl(machine.key, action);
    setBusy(null);
  };

  const borderColor = machine.running
    ? "border-success-200 dark:border-success-700/50"
    : machine.error
      ? "border-error-200 dark:border-error-700/50"
      : "border-gray-200 dark:border-gray-800";

  const glowShadow = machine.running
    ? "shadow-[0_0_20px_-4px_rgba(18,183,106,0.15)] dark:shadow-[0_0_16px_-4px_rgba(18,183,106,0.15)]"
    : machine.error
      ? "shadow-[0_0_20px_-4px_rgba(240,68,56,0.1)] dark:shadow-[0_0_16px_-4px_rgba(240,68,56,0.1)]"
      : "shadow-theme-sm";

  return (
    <div className={`rounded-2xl border ${borderColor} ${glowShadow} bg-white p-5 transition-shadow dark:bg-white/[0.03]`}>
      {/* Row 1: Header + metrics side-by-side */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">{machine.label}</h3>
            <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">{machine.ip}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {machine.running && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success-500" />
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                machine.running
                  ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                  : machine.error
                    ? "bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-300"
                    : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400"
              }`}
            >
              {machine.running ? "Running" : machine.error ? "Error" : "Stopped"}
            </span>
          </div>
        </div>

        {/* Inline metrics */}
        <div className="flex flex-wrap gap-2">
          <MetricCell label="Sold / min" value={sold?.rateNum} color="brand" />
          <MetricCell label="Active / min" value={active?.rateNum} color="success" />
          <MetricCell label="Sold writes" value={sold?.dbWritesWindow} isInt color="blue-light" />
          <MetricCell label="Active writes" value={active?.dbWritesWindow} isInt color="orange" />
        </div>
      </div>

      {machine.error && (
        <div className="mt-3 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700 dark:bg-error-500/10 dark:text-error-300">
          {machine.error}
        </div>
      )}

      {/* Row 2: Mode controls side-by-side (full width gives plenty of room) */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ModeControls
          machineKey={machine.key}
          mode="sold"
          metrics={sold}
          disabled={busy !== null}
          onControl={onControl}
        />
        <ModeControls
          machineKey={machine.key}
          mode="active"
          metrics={active}
          disabled={busy !== null}
          onControl={onControl}
        />
      </div>

      {/* Row 3: Global actions + task feed side-by-side */}
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => handleGlobalAction("restart")}
            disabled={busy !== null}
            className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition-all hover:bg-brand-100 disabled:opacity-50 dark:border-brand-700/30 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
          >
            {busy === "restart" ? "Restarting…" : "Restart Scraper"}
          </button>
          <button
            onClick={() => handleGlobalAction("stop")}
            disabled={busy !== null}
            className="rounded-xl border border-error-200 bg-error-50 px-4 py-2.5 text-sm font-semibold text-error-700 shadow-sm transition-all hover:bg-error-100 disabled:opacity-50 dark:border-error-700/30 dark:bg-error-500/10 dark:text-error-300 dark:hover:bg-error-500/20"
          >
            {busy === "stop" ? "Stopping…" : "Stop Scraper"}
          </button>
        </div>
      </div>

      {/* Separate live feeds per mode */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TaskFeed mode="sold" recentTasks={sold?.recentTasks ?? []} logTail={machine.logTail} />
        <TaskFeed mode="active" recentTasks={active?.recentTasks ?? []} logTail={machine.logTail} />
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  color,
  isInt = false,
}: {
  label: string;
  value: number | undefined;
  color: string;
  isInt?: boolean;
}) {
  const colorMap: Record<string, string> = {
    brand: "text-brand-600 dark:text-brand-400",
    success: "text-success-600 dark:text-success-400",
    "blue-light": "text-blue-light-600 dark:text-blue-light-400",
    orange: "text-orange-600 dark:text-orange-400",
  };
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${colorMap[color] ?? "text-gray-900 dark:text-white"}`}>
        {value != null ? (isInt ? value : value.toFixed(1)) : "—"}
      </div>
    </div>
  );
}
