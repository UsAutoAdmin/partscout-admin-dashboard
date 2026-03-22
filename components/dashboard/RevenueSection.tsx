"use client";

import { MetricCard } from "../MetricCard";
import SectionHeader from "../SectionHeader";
import { fmt$, timeAgo } from "@/lib/format";

interface Payment {
  id: string;
  amount: number;
  customer: string | null;
  created: string;
}

interface RevenueSectionProps {
  totalMrr: number;
  stripeMrr: number;
  stripeMrrLabel: string;
  clerkMrr: number;
  clerkMrrSubscriberCount: number;
  clerkMrrSource: string;
  activeSubs: number;
  rev30d: number;
  charges30d: number;
  canceled30d: number;
  balance: number;
  recentPayments: Payment[];
  unpricedPlanSlugs: string[];
}

export default function RevenueSection({
  totalMrr, stripeMrr, stripeMrrLabel, clerkMrr, clerkMrrSubscriberCount,
  clerkMrrSource, activeSubs, rev30d, charges30d, canceled30d, balance,
  recentPayments, unpricedPlanSlugs,
}: RevenueSectionProps) {
  return (
    <section>
      <SectionHeader title="Revenue" subtitle="Total = Stripe + Clerk MRR" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 mb-6">
        <MetricCard label="MRR (Total)" value={fmt$(totalMrr)} color="success" subtext={`${fmt$(stripeMrr)} Stripe + ${fmt$(clerkMrr)} Clerk`} />
        <MetricCard label="MRR (Stripe)" value={fmt$(stripeMrr)} color="success" subtext={stripeMrrLabel} />
        <MetricCard label="MRR (Clerk)" value={fmt$(clerkMrr)} color="success" subtext={`${clerkMrrSubscriberCount} subscriber${clerkMrrSubscriberCount === 1 ? "" : "s"} · ${clerkMrrSource}`} />
        <MetricCard label="Active Subs" value={activeSubs} color="success" subtext="Stripe" />
        <MetricCard label="Revenue (30d)" value={fmt$(rev30d)} subtext={`${charges30d} charges`} color="success" />
        <MetricCard label="Churned (30d)" value={canceled30d} color={canceled30d > 0 ? "error" : "default"} />
        <MetricCard label="Stripe Balance" value={fmt$(balance)} />
      </div>

      {unpricedPlanSlugs.length > 0 && (
        <div className="mb-6 rounded-xl border border-warning-400/20 bg-warning-50 dark:bg-warning-500/5 px-4 py-3">
          <p className="text-sm text-warning-600 dark:text-warning-400">
            Clerk MRR omits unknown plan slug(s):{" "}
            <code className="font-mono text-warning-700 dark:text-warning-300">{unpricedPlanSlugs.join(", ")}</code>
          </p>
        </div>
      )}

      {recentPayments.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white/90">Recent Payments</h4>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {recentPayments.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white/90">{c.customer ?? "Customer"}</p>
                  <p className="text-theme-xs text-gray-500">{timeAgo(c.created)}</p>
                </div>
                <span className="text-sm font-bold text-success-600 dark:text-success-400">{fmt$(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
