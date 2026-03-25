"use client";

import { useEffect, useState } from "react";

type LocalScraperStatus = {
  root: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
};

const empty: LocalScraperStatus = {
  root: "",
  pid: null,
  running: false,
  logTail: [],
  dashboardUrl: "http://localhost:3847",
};

export default function LocalScraperControl() {
  const [status, setStatus] = useState<LocalScraperStatus>(empty);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/local-scraper", { cache: "no-store" });
    const data = await res.json();
    setStatus(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load scraper status")).finally(() => setLoading(false));
  }, []);

  async function act(action: "start" | "stop" | "restart") {
    setWorking(action);
    setError(null);
    try {
      const res = await fetch("/api/local-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} scraper`);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} scraper`);
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Local scraper control</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">This Mac mini</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Control and inspect the running Seed Database scraper on this machine.</p>
        </div>
        <a href={status.dashboardUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:hover:text-brand-300">Open local scraper dashboard</a>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20"><div className="text-xs text-gray-500 dark:text-gray-400">Status</div><div className={`mt-1 text-xl font-semibold ${status.running ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-white"}`}>{loading ? "Loading…" : status.running ? "Running" : "Stopped"}</div></div>
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20"><div className="text-xs text-gray-500 dark:text-gray-400">PID</div><div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{status.pid ?? "—"}</div></div>
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20"><div className="text-xs text-gray-500 dark:text-gray-400">Root</div><div className="mt-1 text-sm font-medium text-gray-900 dark:text-white break-all">{status.root || "—"}</div></div>
        <div className="rounded-xl bg-gray-50 p-4 dark:bg-black/20"><div className="text-xs text-gray-500 dark:text-gray-400">Log lines loaded</div><div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{status.logTail.length}</div></div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button onClick={() => act("start")} disabled={working !== null} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{working === "start" ? "Starting…" : "Start"}</button>
        <button onClick={() => act("stop")} disabled={working !== null} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{working === "stop" ? "Stopping…" : "Stop"}</button>
        <button onClick={() => act("restart")} disabled={working !== null} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{working === "restart" ? "Restarting…" : "Restart"}</button>
        <button onClick={() => load()} disabled={working !== null} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300">Refresh</button>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="mt-5 rounded-2xl bg-gray-50 p-4 dark:bg-black/20">
        <div className="mb-2 text-sm font-medium text-gray-900 dark:text-white/90">Recent local log tail</div>
        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-300">{status.logTail.length ? status.logTail.join("\n") : "No log output yet."}</pre>
      </div>
    </section>
  );
}
