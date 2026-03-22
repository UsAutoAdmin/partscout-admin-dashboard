"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";

function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

function MetricSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
      <Pulse className="h-10 w-10 rounded-xl" />
      <div className="mt-4 space-y-2">
        <Pulse className="h-3 w-20" />
        <Pulse className="h-7 w-24" />
      </div>
    </div>
  );
}

export function DashboardSkeleton({ title }: { title?: string }) {
  return (
    <DashboardLayout title={title}>
      <div className="space-y-8">
        <div>
          <Pulse className="h-5 w-32 mb-4" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)}
          </div>
        </div>
        <div>
          <Pulse className="h-5 w-28 mb-4" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <MetricSkeleton key={i} />)}
          </div>
        </div>
        <div>
          <Pulse className="h-5 w-36 mb-4" />
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.03] p-5">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Pulse key={i} className="h-10 w-full" />)}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
