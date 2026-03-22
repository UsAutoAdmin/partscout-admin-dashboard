"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { BarChart } from "../BarChart";
import Badge from "../Badge";
import { timeAgo } from "@/lib/format";

interface RecentUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  clerk_plan_slug: string | null;
  stripe_subscription_status: string | null;
  ebay_connected_at: string | null;
  isPaid: boolean;
}

interface ChartDataItem {
  label: string;
  value: number;
  value2: number;
}

interface UsersSectionProps {
  totalUsers: number;
  paidUsers: number;
  freeUsers: number;
  unsynced: number;
  newToday: number;
  new30d: number;
  ebay: number;
  canceled30d: number;
  chartData: ChartDataItem[];
  recentUsers: RecentUser[];
}

export default function UsersSection({
  totalUsers, paidUsers, freeUsers, unsynced, newToday, new30d,
  ebay, canceled30d, chartData, recentUsers,
}: UsersSectionProps) {
  return (
    <section>
      <SectionHeader title="User Activity" subtitle="Signups, subscriptions, and engagement" />

      {unsynced > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning-400/20 bg-warning-50 dark:bg-warning-500/5 px-5 py-4">
          <span className="text-lg">&#9888;&#65039;</span>
          <div>
            <p className="text-sm font-semibold text-warning-600 dark:text-warning-400">{unsynced} users have no plan data</p>
            <p className="text-theme-xs text-warning-500/70 mt-0.5">Run the Clerk sync to pull latest subscription data.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <MetricCard label="Total Users" value={totalUsers} />
        <MetricCard label="Paid" value={paidUsers} color="success" subtext="confirmed" />
        <MetricCard label="Free" value={freeUsers} color="info" />
        <MetricCard label="Unsynced" value={unsynced} color={unsynced > 0 ? "warning" : "default"} subtext="may include paid" />
        <MetricCard label="New Today" value={newToday} color={newToday > 0 ? "warning" : "default"} />
        <MetricCard label="New (30d)" value={new30d} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Signups — Last 30 Days</h4>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-brand-500 inline-block" /> Paid</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success-400 inline-block" /> Free</span>
            </div>
          </div>
          <BarChart data={chartData} height={100} showLabels color="#465fff" color2="#32d583" />
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Recent Signups</h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {recentUsers.map((u) => {
              const unsyncedUser = u.clerk_plan_slug === null && u.stripe_subscription_status === null;
              const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "—";
              return (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{name}</p>
                    <p className="text-theme-xs text-gray-500 truncate">{u.email ?? u.id}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {u.isPaid ? <Badge color="success">Paid</Badge> : unsyncedUser ? <Badge color="warning">?</Badge> : <Badge>Free</Badge>}
                    {u.ebay_connected_at && <Badge color="info">eBay</Badge>}
                    <span className="text-theme-xs text-gray-500">{timeAgo(u.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="eBay Connected" value={ebay} color="info" subtext={`of ${paidUsers} paid`} />
        <MetricCard label="Conversion Rate" value={`${Math.round((paidUsers / (totalUsers || 1)) * 100)}%`} color="success" />
        <MetricCard label="Churned (30d)" value={canceled30d} color={canceled30d > 0 ? "error" : "default"} />
        <MetricCard label="Net New (30d)" value={new30d - canceled30d} color={new30d >= canceled30d ? "success" : "error"} subtext="signups minus churn" />
      </div>
    </section>
  );
}
