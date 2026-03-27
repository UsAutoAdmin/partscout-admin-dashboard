"use client";

import { useEffect, useState } from "react";

type RecentTask = {
  time?: string;
  workerId?: number;
  query?: string;
  count?: number | null;
  error?: string;
  durationMs?: number;
  sellThrough?: number | null;
  confidence?: number | null;
};

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
  metrics?: {
    sold: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number; recentTasks?: RecentTask[] };
    active: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number; recentTasks?: RecentTask[] };
  } | null;
  error?: string;
};

type ControlDrafts = Record<string, { soldWorkers: number; soldBrowsers: number; activeWorkers: number; activeBrowsers: number }>;

function renderTaskLine(mode: 'sold' | 'active', task: RecentTask) {
  const parts = [
    task.time || '—',
    task.workerId != null ? `W${task.workerId}` : 'W?',
    task.query || 'unknown query',
  ];
  if (task.error) {
    parts.push(`ERR: ${task.error}`);
  } else {
    parts.push(`count=${task.count ?? '—'}`);
  }
  if (mode === 'sold' && task.sellThrough != null) parts.push(`sell-through=${task.sellThrough.toFixed(1)}%`);
  if (mode === 'sold' && task.confidence != null) parts.push(`confidence=${Math.round(task.confidence * 100)}%`);
  if (task.durationMs != null) parts.push(`${(task.durationMs / 1000).toFixed(1)}s`);
  return parts.join(' • ');
}

export default function ScraperFleetControl() {
  const [machines, setMachines] = useState<FleetScraperStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ControlDrafts>({});
  const localGatewayBase = 'http://127.0.0.1:3850';

  function syncDrafts(data: FleetScraperStatus[]) {
    const next: ControlDrafts = {};
    for (const machine of data) {
      next[machine.key] = {
        soldWorkers: machine.metrics?.sold?.targetWorkers ?? 4,
        soldBrowsers: machine.metrics?.sold?.targetBrowsers ?? 1,
        activeWorkers: machine.metrics?.active?.targetWorkers ?? 4,
        activeBrowsers: machine.metrics?.active?.targetBrowsers ?? 1,
      };
    }
    setDrafts(next);
  }

  async function load() {
    const res = await fetch(`${localGatewayBase}/fleet/status`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Failed to load scraper fleet');
    setMachines(data);
    syncDrafts(data);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load scraper fleet')).finally(() => setLoading(false));
  }, []);

  async function act(key: string, action: 'start' | 'stop' | 'restart' | 'setWorkers' | 'setBrowsers' | 'startMode' | 'pauseMode' | 'resumeMode', mode?: 'sold' | 'active', value?: number) {
    setWorking(`${key}:${action}:${mode ?? 'global'}`);
    setError(null);
    try {
      const res = await fetch(`${localGatewayBase}/fleet/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, action, mode, value }),
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

  function updateDraft(key: string, patch: Partial<ControlDrafts[string]>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Scraper fleet</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white/90">All three Mac minis</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This is the authoritative control surface. Use these cards for real status and control.</p>
        </div>
        <button onClick={() => load()} className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-600 dark:border-gray-800 dark:text-gray-300 dark:hover:text-brand-300">Refresh fleet</button>
      </div>

      {error ? <div className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
        The old per-machine scraper dashboard pages are now debug-only and may show stale or misleading state after the new fleet control changes. Use the cards below as the source of truth for start/stop, workers, browsers, and real live rates.
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {(loading ? [] : machines).map((machine) => {
          const sold = machine.metrics?.sold;
          const active = machine.metrics?.active;
          const draft = drafts[machine.key] || { soldWorkers: 4, soldBrowsers: 1, activeWorkers: 4, activeBrowsers: 1 };
          return (
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

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]"><div className="text-xs text-gray-500 dark:text-gray-400">Sold lines/min</div><div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{sold ? sold.rateNum.toFixed(1) : '—'}</div></div>
                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]"><div className="text-xs text-gray-500 dark:text-gray-400">Active lines/min</div><div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{active ? active.rateNum.toFixed(1) : '—'}</div></div>
                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]"><div className="text-xs text-gray-500 dark:text-gray-400">Sold writes / window</div><div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{sold ? sold.dbWritesWindow : '—'}</div></div>
                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]"><div className="text-xs text-gray-500 dark:text-gray-400">Active writes / window</div><div className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{active ? active.dbWritesWindow : '—'}</div></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]">
                  <div className="mb-2 font-semibold text-gray-900 dark:text-white">Sold controls</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={draft.soldWorkers} onChange={(e) => updateDraft(machine.key, { soldWorkers: Number(e.target.value) })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-black/20" />
                    <input type="number" value={draft.soldBrowsers} onChange={(e) => updateDraft(machine.key, { soldBrowsers: Number(e.target.value) })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-black/20" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => act(machine.key, 'setWorkers', 'sold', draft.soldWorkers)} disabled={working !== null} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Set workers</button>
                    <button onClick={() => act(machine.key, 'setBrowsers', 'sold', draft.soldBrowsers)} disabled={working !== null} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Set browsers</button>
                    <button onClick={() => act(machine.key, 'startMode', 'sold')} disabled={working !== null} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Start sold</button>
                    <button onClick={() => act(machine.key, 'pauseMode', 'sold')} disabled={working !== null} className="rounded-lg bg-yellow-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Pause sold</button>
                  </div>
                </div>

                <div className="rounded-xl bg-white p-3 dark:bg-white/[0.03]">
                  <div className="mb-2 font-semibold text-gray-900 dark:text-white">Active controls</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" value={draft.activeWorkers} onChange={(e) => updateDraft(machine.key, { activeWorkers: Number(e.target.value) })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-black/20" />
                    <input type="number" value={draft.activeBrowsers} onChange={(e) => updateDraft(machine.key, { activeBrowsers: Number(e.target.value) })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-800 dark:bg-black/20" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => act(machine.key, 'setWorkers', 'active', draft.activeWorkers)} disabled={working !== null} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Set workers</button>
                    <button onClick={() => act(machine.key, 'setBrowsers', 'active', draft.activeBrowsers)} disabled={working !== null} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Set browsers</button>
                    <button onClick={() => act(machine.key, 'startMode', 'active')} disabled={working !== null} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Start active</button>
                    <button onClick={() => act(machine.key, 'pauseMode', 'active')} disabled={working !== null} className="rounded-lg bg-yellow-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">Pause active</button>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div><strong>PID:</strong> {machine.pid ?? '—'}</div>
                <div><strong>Root:</strong> <span className="break-all">{machine.root || '—'}</span></div>
                {sold ? <div><strong>Sold status:</strong> {sold.status}</div> : null}
                {active ? <div><strong>Active status:</strong> {active.status}</div> : null}
                {machine.error ? <div className="text-red-600 dark:text-red-400"><strong>Error:</strong> {machine.error}</div> : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={machine.dashboardUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-amber-300 px-3 py-2 text-sm text-amber-900 hover:border-amber-400 hover:text-amber-950 dark:border-amber-800 dark:text-amber-200 dark:hover:text-amber-100">Open old debug dashboard</a>
                <button onClick={() => act(machine.key, 'restart')} disabled={working !== null} className="rounded-xl bg-brand-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{working === `${machine.key}:restart:global` ? 'Restarting…' : 'Restart scraper'}</button>
                <button onClick={() => act(machine.key, 'stop')} disabled={working !== null} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{working === `${machine.key}:stop:global` ? 'Stopping…' : 'Stop scraper'}</button>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3 dark:bg-white/[0.03]">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Live task feed</div>
                <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-600 dark:text-gray-300">{
                  [
                    ...(sold?.recentTasks?.slice(-5).map((task) => `[sold] ${renderTaskLine('sold', task)}`) ?? []),
                    ...(active?.recentTasks?.slice(-5).map((task) => `[active] ${renderTaskLine('active', task)}`) ?? []),
                  ].slice(-10).reverse().join('\n') || 'No live task feed returned.'
                }</pre>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
