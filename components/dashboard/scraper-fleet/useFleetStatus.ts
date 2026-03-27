"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecentTask = {
  time?: string;
  workerId?: number;
  query?: string;
  count?: number | null;
  error?: string;
  durationMs?: number;
  sellThrough?: number | null;
  confidence?: number | null;
};

export type ModeMetrics = {
  status: string;
  rateNum: number;
  targetWorkers: number;
  targetBrowsers: number;
  dbWritesWindow: number;
  recentTasks?: RecentTask[];
};

export type FleetMachine = {
  key: string;
  label: string;
  ip: string;
  root?: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
  agentUrl: string;
  metrics?: { sold: ModeMetrics; active: ModeMetrics } | null;
  error?: string;
};

export type ControlAction =
  | "start"
  | "stop"
  | "restart"
  | "setWorkers"
  | "setBrowsers"
  | "startMode"
  | "pauseMode"
  | "resumeMode";

const GATEWAY_BASE = "http://127.0.0.1:3850";
const POLL_INTERVAL_MS = 5_000;

export type ControlResult = {
  ok: boolean;
  error?: string;
  returnedValue?: number;
};

export function useFleetStatus() {
  const [machines, setMachines] = useState<FleetMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`${GATEWAY_BASE}/fleet/status`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load scraper fleet");
      setMachines(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scraper fleet");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(() => fetchStatus(true), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const sendControl = useCallback(
    async (
      key: string,
      action: ControlAction,
      mode?: "sold" | "active",
      value?: number,
    ): Promise<ControlResult> => {
      try {
        const res = await fetch(`${GATEWAY_BASE}/fleet/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, action, mode, value }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Failed to ${action} ${key}`);

        await fetchStatus();

        return { ok: true, returnedValue: data?.value };
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed to ${action}`;
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [fetchStatus],
  );

  return {
    machines,
    loading,
    refreshing,
    lastUpdated,
    error,
    refresh: () => fetchStatus(),
    sendControl,
  };
}
