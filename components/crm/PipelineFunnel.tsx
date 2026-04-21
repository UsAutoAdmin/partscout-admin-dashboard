"use client";

import type { PipelineFunnel, Stage } from "@/lib/crm-types";

interface Props {
  funnel: PipelineFunnel;
  activeStage: Stage | "all";
  onStageClick: (stage: Stage | "all") => void;
}

const STAGE_TOOLTIPS: Record<Stage, string> = {
  community: "Skool members in crm_contacts",
  emailed: "At least one pick-sheet email was sent",
  opened: "Tracking pixel fired at least once",
  clicked: "Clicked a tracked link in an email",
  signed_up: "Email matches a Part Scout user",
  trial: "Clerk/Stripe trial active (data not yet wired \u2014 will populate automatically)",
  paid: "Active paid subscription (Clerk or Stripe)",
};

export default function PipelineFunnel({ funnel, activeStage, onStageClick }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">Skool Funnel</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {funnel.total} community member{funnel.total === 1 ? "" : "s"}
            {funnel.directSignups > 0 && (
              <span> &middot; {funnel.directSignups} direct signup{funnel.directSignups === 1 ? "" : "s"} (excluded from funnel)</span>
            )}
          </p>
        </div>
        <button
          onClick={() => onStageClick("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            activeStage === "all"
              ? "bg-brand-500 text-white"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Show all
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {funnel.stages.map((s, i) => {
          const isActive = activeStage === s.stage;
          const isStub = s.stage === "trial" && s.count === 0;
          return (
            <button
              key={s.stage}
              onClick={() => onStageClick(isActive ? "all" : s.stage)}
              title={STAGE_TOOLTIPS[s.stage]}
              className={`group text-left rounded-xl border p-3 transition-all ${
                isActive
                  ? "border-brand-400 bg-brand-50 dark:bg-brand-500/[0.12]"
                  : "border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate">
                  {s.label}
                </span>
                <span className="text-[10px] font-mono text-gray-400 shrink-0">{i + 1}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-bold ${
                    isStub
                      ? "text-gray-400 dark:text-gray-600"
                      : "text-gray-900 dark:text-white/90"
                  }`}
                >
                  {s.count}
                </span>
                {!isStub && s.pctOfTotal > 0 && i > 0 && (
                  <span className="text-[10px] text-gray-500">{s.pctOfTotal}%</span>
                )}
              </div>
              <div className="mt-1 h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full ${
                    s.stage === "paid"
                      ? "bg-success-500"
                      : s.stage === "trial"
                      ? "bg-warning-500"
                      : "bg-brand-500"
                  }`}
                  style={{ width: `${s.pctOfTotal}%` }}
                />
              </div>
              <div className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400 h-3">
                {isStub ? (
                  <span className="text-warning-600 dark:text-warning-400">stub &middot; not wired</span>
                ) : i === 0 ? (
                  <span>top of funnel</span>
                ) : s.dropFromPrev > 0 ? (
                  <span className="text-error-500 dark:text-error-400">&minus;{s.dropFromPrev}% drop</span>
                ) : (
                  <span className="text-success-500 dark:text-success-400">no drop</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
