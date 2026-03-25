"use client";

import { useEffect, useState } from "react";

type FleetScraperStatus = {
  key: string;
  label: string;
  ip: string;
  root?: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
  agentUrl: string;
  error?: string;
};

export default function ScraperFleetControl() {
  const [machines, setMachines] = useState<FleetScraperStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/scraper-fleet', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to load scraper fleet');
    setMachines(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load scraper fleet')).finally(() => setLoading(false));
  }, []);

  async function act(key: string, action: 'start' | 'stop' | 'restart') {
    setWorking(`${key}:${action}`);
    setError(null);
    try {
      const res = await fetch('/api/scraper-fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to ${action} ${key}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Scraper fleet</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">All three Mac minis</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Status and control backed by the machine-local scraper agents over Tailscale.</p>
        </div>
        <button onClick={() => load()} className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:hover:text-brand-300">Refresh fleet</button>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {(loading ? [] : machines).map((machine) => (
          <div key={machine.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-black/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{machine.label}</div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{machine.ip}</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${machine.running ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300'}`}>
                {machine.running ? 'Running' : 'Stopped'}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div><strong>PID:</strong> {machine.pid ?? '—'}</div>
              <div><strong>Root:</strong> <span className="break-all">{machine.root || '—'}</span></div>
              <div><strong>Agent:</strong> <span className="break-all">{machine.agentUrl}</span></div>
              {machine.error ? <div className="text-red-600 dark:text-red-400"><strong>Error:</strong> {machine.error}</div> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a href={machine.dashboardUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:hover:text-brand-300">Open dashboard</a>
              <button onClick={() => act(machine.key, 'start')} disabled={working !== null} className="rounded-xl bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{working === `${machine.key}:start` ? 'Starting…' : 'Start'}</button>
              <button onClick={() => act(machine.key, 'stop')} disabled={working !== null} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{working === `${machine.key}:stop` ? 'Stopping…' : 'Stop'}</button>
              <button onClick={() => act(machine.key, 'restart')} disabled={working !== null} className="rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{working === `${machine.key}:restart` ? 'Restarting…' : 'Restart'}</button>
            </div>

            <div className="mt-4 rounded-xl bg-white p-3 dark:bg-white/[0.03]">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Recent log tail</div>
              <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-300">{machine.logTail.length ? machine.logTail.join('\n') : 'No logs returned.'}</pre>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
