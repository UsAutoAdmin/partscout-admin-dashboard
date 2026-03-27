"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ControlAction, ControlResult, ModeMetrics } from "./useFleetStatus";

interface ModeControlsProps {
  machineKey: string;
  mode: "sold" | "active";
  metrics: ModeMetrics | undefined;
  disabled: boolean;
  onControl: (key: string, action: ControlAction, mode: "sold" | "active", value?: number) => Promise<ControlResult>;
}

type Feedback = { type: "success" | "warning" | "error"; message: string } | null;

export default function ModeControls({ machineKey, mode, metrics, disabled, onControl }: ModeControlsProps) {
  const [workers, setWorkers] = useState(metrics?.targetWorkers ?? 4);
  const [browsers, setBrowsers] = useState(metrics?.targetBrowsers ?? 1);
  const [busy, setBusy] = useState<string | null>(null);
  const [workerFb, setWorkerFb] = useState<Feedback>(null);
  const [browserFb, setBrowserFb] = useState<Feedback>(null);
  const [actionFb, setActionFb] = useState<Feedback>(null);

  const pendingWorkers = useRef<number | null>(null);
  const pendingBrowsers = useRef<number | null>(null);
  const expectedStatus = useRef<string | null>(null);

  useEffect(() => {
    if (pendingWorkers.current !== null && metrics) {
      const sent = pendingWorkers.current;
      if (metrics.targetWorkers !== sent) {
        setWorkerFb({ type: "warning", message: `Requested ${sent} but agent reports ${metrics.targetWorkers}` });
      }
      pendingWorkers.current = null;
    }
    if (pendingBrowsers.current !== null && metrics) {
      const sent = pendingBrowsers.current;
      if (metrics.targetBrowsers !== sent) {
        setBrowserFb({ type: "warning", message: `Requested ${sent} but agent reports ${metrics.targetBrowsers}` });
      }
      pendingBrowsers.current = null;
    }
    if (expectedStatus.current !== null && metrics) {
      const wanted = expectedStatus.current;
      const actual = metrics.status;
      if (actual !== wanted) {
        setActionFb({
          type: "warning",
          message: `Command sent but mode is "${actual}" (expected "${wanted}")`,
        });
      }
      expectedStatus.current = null;
    }
  }, [metrics]);

  const autoClear = useCallback((setter: (v: Feedback) => void) => {
    setTimeout(() => setter(null), 5000);
  }, []);

  const handleSetWorkers = async () => {
    setBusy("workers");
    setWorkerFb(null);
    pendingWorkers.current = workers;
    const r = await onControl(machineKey, "setWorkers", mode, workers);
    if (!r.ok) {
      pendingWorkers.current = null;
      setWorkerFb({ type: "error", message: r.error || "Failed" });
    } else {
      setWorkerFb({ type: "success", message: `Set to ${workers}` });
    }
    setBusy(null);
    autoClear(setWorkerFb);
  };

  const handleSetBrowsers = async () => {
    setBusy("browsers");
    setBrowserFb(null);
    pendingBrowsers.current = browsers;
    const r = await onControl(machineKey, "setBrowsers", mode, browsers);
    if (!r.ok) {
      pendingBrowsers.current = null;
      setBrowserFb({ type: "error", message: r.error || "Failed" });
    } else {
      setBrowserFb({ type: "success", message: `Set to ${browsers}` });
    }
    setBusy(null);
    autoClear(setBrowserFb);
  };

  const handleModeAction = async (action: "startMode" | "pauseMode") => {
    setBusy(action);
    setActionFb(null);
    expectedStatus.current = action === "startMode" ? "running" : "paused";
    const r = await onControl(machineKey, action, mode);
    if (!r.ok) {
      expectedStatus.current = null;
      setActionFb({ type: "error", message: r.error || "Command failed" });
    } else {
      setActionFb({ type: "success", message: action === "startMode" ? "Start sent" : "Pause sent" });
    }
    setBusy(null);
    autoClear(setActionFb);
  };

  const label = mode === "sold" ? "Sold" : "Active";
  const statusBadge = (() => {
    const s = metrics?.status;
    if (s === "running") return "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300";
    if (s === "paused") return "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300";
    if (s === "idle") return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
    return "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400";
  })();

  const fbColor = (fb: Feedback) => {
    if (!fb) return "hidden";
    if (fb.type === "success") return "text-success-600 dark:text-success-400";
    if (fb.type === "warning") return "text-warning-600 dark:text-warning-400";
    return "text-error-600 dark:text-error-400";
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{label} Mode</h4>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge}`}>
          {metrics?.status || "unknown"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Workers
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={0}
              value={workers}
              onChange={(e) => setWorkers(Number(e.target.value))}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-gray-700 dark:bg-white/[0.04] dark:text-white"
            />
            <button
              onClick={handleSetWorkers}
              disabled={disabled || busy !== null}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50"
            >
              {busy === "workers" ? "…" : "Set"}
            </button>
          </div>
          <p className={`mt-1 text-[11px] ${fbColor(workerFb)}`}>{workerFb?.message}&nbsp;</p>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Browsers
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={0}
              value={browsers}
              onChange={(e) => setBrowsers(Number(e.target.value))}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-gray-700 dark:bg-white/[0.04] dark:text-white"
            />
            <button
              onClick={handleSetBrowsers}
              disabled={disabled || busy !== null}
              className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-600 disabled:opacity-50"
            >
              {busy === "browsers" ? "…" : "Set"}
            </button>
          </div>
          <p className={`mt-1 text-[11px] ${fbColor(browserFb)}`}>{browserFb?.message}&nbsp;</p>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => handleModeAction("startMode")}
          disabled={disabled || busy !== null}
          className="flex-1 rounded-lg bg-success-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-success-700 disabled:opacity-50"
        >
          {busy === "startMode" ? "Starting…" : `Start ${label}`}
        </button>
        <button
          onClick={() => handleModeAction("pauseMode")}
          disabled={disabled || busy !== null}
          className="flex-1 rounded-lg bg-warning-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-warning-600 disabled:opacity-50"
        >
          {busy === "pauseMode" ? "Pausing…" : `Pause ${label}`}
        </button>
      </div>

      {actionFb && (
        <p className={`mt-2 text-xs font-medium ${fbColor(actionFb)}`}>{actionFb.message}</p>
      )}
    </div>
  );
}
