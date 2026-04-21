"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PipelineFunnel as PipelineFunnelData, PipelineRow, Stage } from "@/lib/crm-types";
import PipelineFunnel from "./PipelineFunnel";
import StageFilterBar from "./StageFilterBar";
import ContactsTable, { type SortDir, type SortKey } from "./ContactsTable";
import ContactDrawer from "./ContactDrawer";

function matchesStage(row: PipelineRow, stage: Stage | "all"): boolean {
  if (stage === "all") return true;
  switch (stage) {
    case "community":
      return !row.isDirect;
    case "emailed":
      return row.emailCount > 0;
    case "opened":
      return row.emailCount > 0 && row.openCount > 0;
    case "clicked":
      return row.emailCount > 0 && row.clickCount > 0;
    case "signed_up":
      return row.userId !== null;
    case "trial":
      return row.isTrial;
    case "paid":
      return row.isPaid;
    default:
      return true;
  }
}

function matchesSearch(row: PipelineRow, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [
    row.email,
    row.firstName,
    row.lastName,
    row.zip,
    row.phone,
    row.clerkPlanSlug,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

interface PipelinePayload {
  rows: PipelineRow[];
  funnel: PipelineFunnelData;
}

async function loadPipeline(attempts = 6): Promise<PipelinePayload> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const r = await fetch("/api/crm/pipeline", { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(body ? `HTTP ${r.status}: ${body.slice(0, 200)}` : `HTTP ${r.status}`);
      }
      return (await r.json()) as PipelinePayload;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((res) => setTimeout(res, 600 + 800 * i));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("load failed");
}

export default function CRMPipelinePage() {
  const [data, setData] = useState<PipelinePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadStartedAt, setLoadStartedAt] = useState<number>(() => Date.now());
  const [tick, setTick] = useState(0);
  const [activeStage, setActiveStage] = useState<Stage | "all">("all");
  const [search, setSearch] = useState("");
  const [showDirect, setShowDirect] = useState(true);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setLoadStartedAt(Date.now());
    loadPipeline()
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows
      .filter((r) => (showDirect ? true : !r.isDirect))
      .filter((r) => matchesStage(r, activeStage))
      .filter((r) => matchesSearch(r, search));
  }, [data, showDirect, activeStage, search]);

  function handleSortChange(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "stage" ? "asc" : "desc");
    }
  }

  const elapsedSec = Math.floor((Date.now() - loadStartedAt) / 1000);

  if (loading && !data) {
    return <PipelineLoadingState elapsedSec={elapsedSec} tick={tick} />;
  }

  if (error && !data) {
    return <PipelineErrorState error={error} onRetry={reload} />;
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <PipelineFunnel funnel={data.funnel} activeStage={activeStage} onStageClick={setActiveStage} />
      <StageFilterBar
        activeStage={activeStage}
        onStageChange={setActiveStage}
        search={search}
        onSearchChange={setSearch}
        showDirect={showDirect}
        onShowDirectChange={setShowDirect}
        total={data.rows.length}
        filtered={filtered.length}
      />
      <ContactsTable
        rows={filtered}
        selectedRowKey={selectedRowKey}
        onSelect={(k) => setSelectedRowKey((cur) => (cur === k ? null : k))}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={handleSortChange}
      />
      <ContactDrawer rowKey={selectedRowKey} onClose={() => setSelectedRowKey(null)} />
    </div>
  );
}

function PipelineLoadingState({ elapsedSec, tick }: { elapsedSec: number; tick: number }) {
  void tick;
  const slow = elapsedSec > 4;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-500" />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {slow ? "Still loading pipeline" : "Loading pipeline"}
            <span className="ml-2 text-xs text-gray-500">{elapsedSec}s</span>
          </p>
        </div>
        {slow && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Supabase is being slow to respond. Retrying automatically&hellip;
          </p>
        )}
      </div>
      <div className="animate-pulse rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 h-32" />
      <div className="animate-pulse rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 h-12" />
      <div className="animate-pulse rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5 h-96" />
    </div>
  );
}

function PipelineErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-error-200 dark:border-error-500/30 bg-error-50 dark:bg-error-500/10 p-6">
      <h3 className="text-sm font-semibold text-error-700 dark:text-error-400">Pipeline failed to load</h3>
      <p className="mt-1 text-xs text-error-600 dark:text-error-300 break-words">{error}</p>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        This is usually a transient connection issue between the dashboard and Supabase. Retry should fix it.
      </p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg bg-error-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-error-600"
      >
        Retry
      </button>
    </div>
  );
}
