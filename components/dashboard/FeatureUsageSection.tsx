"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { fmtNum } from "@/lib/format";

interface TopUser {
  name: string;
  count: number;
}

interface FeatureUsageSectionProps {
  totalSheets: number;
  sheets30d: number;
  totalParts: number;
  parts30d: number;
  topSheetUsers: TopUser[];
  topPartsUsers: TopUser[];
}

export default function FeatureUsageSection({
  totalSheets, sheets30d, totalParts, parts30d, topSheetUsers, topPartsUsers,
}: FeatureUsageSectionProps) {
  return (
    <section>
      <SectionHeader title="Feature Usage" subtitle="Pick sheets and database parts" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <MetricCard label="Pick Sheets Total" value={fmtNum(totalSheets)} color="brand" />
        <MetricCard label="Pick Sheets (30d)" value={sheets30d} color="brand" />
        <MetricCard label="DB Parts Total" value={fmtNum(totalParts)} color="info" />
        <MetricCard label="DB Parts (30d)" value={parts30d} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Top Pick Sheet Users</h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {topSheetUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                  <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate max-w-[200px]">{u.name}</p>
                </div>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{u.count} sheets</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Top Database Parts Users</h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {topPartsUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                  <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate max-w-[200px]">{u.name}</p>
                </div>
                <span className="text-sm font-bold text-blue-light-600 dark:text-blue-light-400">{u.count} parts</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
