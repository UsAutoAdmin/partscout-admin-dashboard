"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import Badge from "../Badge";
import { timeAgo } from "@/lib/format";

interface AutomationRun {
  id: string;
  member_email: string;
  member_first_name: string | null;
  member_last_name: string | null;
  member_zip_code: string | null;
  status: string;
  failure_step: string | null;
  failure_reason: string | null;
  nearest_yard_name: string | null;
  nearest_yard_distance_miles: number | null;
  vehicles_extracted: number | null;
  parts_matched: number | null;
  share_url: string | null;
  share_link_views: number;
  email_sent_at: string | null;
  created_at: string;
}

interface AutomationSectionProps {
  autoTotal: number;
  autoSuccess: number;
  autoFailed: number;
  autoSkipped: number;
  autoProcessing: number;
  autoLinkClicks: number;
  autoSuccessRate: number;
  failureSteps: [string, number][];
  recentAutoRuns: AutomationRun[];
}

export default function AutomationSection({
  autoTotal, autoSuccess, autoFailed, autoSkipped, autoProcessing,
  autoLinkClicks, autoSuccessRate, failureSteps, recentAutoRuns,
}: AutomationSectionProps) {
  return (
    <section>
      <SectionHeader title="Picksheets Sent" subtitle="Skool new-member automation: signup → find yard → extract → match → email" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <MetricCard label="Total Runs" value={autoTotal} />
        <MetricCard label="Emails Sent" value={autoSuccess} color="success" />
        <MetricCard label="Failed" value={autoFailed} color={autoFailed > 0 ? "error" : "default"} />
        <MetricCard label="Skipped" value={autoSkipped} color={autoSkipped > 0 ? "warning" : "default"} />
        <MetricCard label="Link Clicks" value={autoLinkClicks} color="info" subtext="share link views" />
        <MetricCard label="Success Rate" value={`${autoSuccessRate}%`} color={autoSuccessRate >= 50 ? "success" : autoSuccessRate > 0 ? "warning" : "default"} />
      </div>

      {autoProcessing > 0 && (
        <div className="mb-4 rounded-xl border border-blue-light-400/20 bg-blue-light-50 dark:bg-blue-light-500/5 px-5 py-4">
          <p className="text-sm font-semibold text-blue-light-600 dark:text-blue-light-400">
            {autoProcessing} run{autoProcessing === 1 ? "" : "s"} currently processing
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {failureSteps.length > 0 && (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Failure Breakdown</h4>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {failureSteps.map(([step, count]) => (
                <div key={step} className="flex items-center justify-between px-5 py-3">
                  <span className="text-xs font-mono bg-error-50 dark:bg-error-500/10 text-error-600 dark:text-error-400 px-2 py-0.5 rounded">{step}</span>
                  <span className="text-sm font-bold text-error-600 dark:text-error-400">{count} run{count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden ${failureSteps.length === 0 ? "lg:col-span-2" : ""}`}>
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Recent Automation Runs</h4>
          </div>
          {recentAutoRuns.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">No automation runs recorded yet.</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {recentAutoRuns.map((r) => {
                const name = [r.member_first_name, r.member_last_name].filter(Boolean).join(" ") || r.member_email;
                const statusColor =
                  r.status === "success" ? "success" as const
                  : r.status === "failed" ? "error" as const
                  : r.status === "skipped" ? "warning" as const
                  : "info" as const;
                return (
                  <div key={r.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge color={statusColor}>{r.status}</Badge>
                        <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{name}</p>
                      </div>
                      <span className="text-theme-xs text-gray-500 shrink-0 ml-2">{timeAgo(r.created_at)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-theme-xs text-gray-500">
                      {r.member_zip_code && <span>ZIP {r.member_zip_code}</span>}
                      {r.nearest_yard_name && <span>{r.nearest_yard_name} ({r.nearest_yard_distance_miles?.toFixed(1)} mi)</span>}
                      {r.parts_matched != null && <span>{r.parts_matched} parts</span>}
                      {r.share_link_views > 0 && <span className="text-blue-light-600 dark:text-blue-light-400">{r.share_link_views} click{r.share_link_views === 1 ? "" : "s"}</span>}
                      {r.failure_step && (
                        <span className="text-error-600 dark:text-error-400">{r.failure_step}: {r.failure_reason?.slice(0, 80)}{(r.failure_reason?.length ?? 0) > 80 ? "..." : ""}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
