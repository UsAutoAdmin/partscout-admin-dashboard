"use client";

import { STAGES, STAGE_LABELS, type Stage } from "@/lib/crm-types";

interface Props {
  activeStage: Stage | "all";
  onStageChange: (stage: Stage | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  showDirect: boolean;
  onShowDirectChange: (value: boolean) => void;
  total: number;
  filtered: number;
}

export default function StageFilterBar({
  activeStage,
  onStageChange,
  search,
  onSearchChange,
  showDirect,
  onShowDirectChange,
  total,
  filtered,
}: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onStageChange("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeStage === "all"
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            All stages
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => onStageChange(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeStage === s
                  ? "bg-brand-500 text-white"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={showDirect}
              onChange={(e) => onShowDirectChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            Include direct signups
          </label>
          <div className="relative">
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <path
                d="M8.333 2.5a5.833 5.833 0 103.584 10.444l3.61 3.61a.833.833 0 001.179-1.178l-3.61-3.61A5.833 5.833 0 008.333 2.5z"
                fill="currentColor"
              />
            </svg>
            <input
              type="search"
              placeholder="Email, name, or zip"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.03] pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-white/90 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {filtered} of {total}
          </span>
        </div>
      </div>
    </div>
  );
}
