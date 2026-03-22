import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/MetricCard";
import {
  fetchUsers, fetchRevenue, fetchPickSheetsAndParts, fetchAutomationRuns,
  fetchScrapes, fetchInfra, computeUserMetrics, computeAutomationMetrics,
  isPaidUser,
} from "@/lib/data";
import { fmt$ } from "@/lib/format";

export const revalidate = 30;

function SectionLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white/90">{title}</h3>
        <Link
          href={href}
          className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
        >
          View Details →
        </Link>
      </div>
      {children}
    </section>
  );
}

export default async function Dashboard() {
  const [users, automationRuns, scrapes, infra, { pickSheets, dbParts }] = await Promise.all([
    fetchUsers(),
    fetchAutomationRuns(),
    fetchScrapes(),
    fetchInfra(),
    fetchPickSheetsAndParts(),
  ]);

  const revenue = await fetchRevenue(users);

  const userMetrics = computeUserMetrics(users);
  const autoMetrics = computeAutomationMetrics(automationRuns);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Dashboard">
      <div className="space-y-8">
        {/* Revenue Overview */}
        <SectionLink href="/revenue" title="Revenue">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="MRR (Total)" value={fmt$(revenue.totalMrr)} color="success" subtext={`${fmt$(revenue.stripePart.mrr)} Stripe + ${fmt$(revenue.clerkResolved.clerkMrr)} Clerk`} />
            <MetricCard label="Active Subs" value={revenue.stripe.activeSubs} color="success" subtext="Stripe" />
            <MetricCard label="Revenue (30d)" value={fmt$(revenue.stripe.rev30d)} subtext={`${revenue.stripe.charges30d} charges`} color="success" />
            <MetricCard label="Stripe Balance" value={fmt$(revenue.stripe.balance)} />
          </div>
        </SectionLink>

        {/* Users Overview */}
        <SectionLink href="/users" title="Users">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Total Users" value={userMetrics.totalUsers} />
            <MetricCard label="Paid" value={userMetrics.paidUsers} color="success" subtext="confirmed" />
            <MetricCard label="Free" value={userMetrics.freeUsers} color="info" />
            <MetricCard label="New (30d)" value={userMetrics.new30d} color={userMetrics.newToday > 0 ? "warning" : "default"} subtext={`${userMetrics.newToday} today`} />
          </div>
        </SectionLink>

        {/* Features Overview */}
        <SectionLink href="/features" title="Feature Usage">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Pick Sheets" value={pickSheets.length} color="brand" />
            <MetricCard label="DB Parts" value={dbParts.length} color="info" />
            <MetricCard label="eBay Connected" value={userMetrics.ebay} color="info" subtext={`of ${userMetrics.paidUsers} paid`} />
            <MetricCard label="Conversion" value={`${Math.round((userMetrics.paidUsers / (userMetrics.totalUsers || 1)) * 100)}%`} color="success" />
          </div>
        </SectionLink>

        {/* Automation Overview */}
        <SectionLink href="/automation" title="Automation">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Total Runs" value={autoMetrics.autoTotal} />
            <MetricCard label="Emails Sent" value={autoMetrics.autoSuccess} color="success" />
            <MetricCard label="Failed" value={autoMetrics.autoFailed} color={autoMetrics.autoFailed > 0 ? "error" : "default"} />
            <MetricCard label="Success Rate" value={`${autoMetrics.autoSuccessRate}%`} color={autoMetrics.autoSuccessRate >= 50 ? "success" : "warning"} />
          </div>
        </SectionLink>

        {/* Scrapes Overview */}
        <SectionLink href="/scrapes" title="Scrapes">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Total Records" value={scrapes.totalScrapes.toLocaleString()} />
            <MetricCard label="Active > 0" value={scrapes.activeScrapes.toLocaleString()} color="success" />
            <MetricCard label="Coverage" value={`${scrapes.totalScrapes ? Math.round((scrapes.activeScrapes / scrapes.totalScrapes) * 100) : 0}%`} color="info" />
            <MetricCard label="Junkyard Locations" value={infra.dirTotal.toLocaleString()} subtext={`${infra.dirVerified} verified`} />
          </div>
        </SectionLink>

        {/* Infrastructure Overview */}
        <SectionLink href="/infrastructure" title="Infrastructure">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Junkyard Directory" value={infra.dirTotal.toLocaleString()} />
            <MetricCard label="Verified Extractors" value={infra.dirVerified} color="success" />
            <MetricCard label="Monitored Yards" value={infra.totalYards} color="info" />
            <MetricCard label="Monitoring Runs" value={infra.totalRuns.toLocaleString()} color="info" />
          </div>
        </SectionLink>
      </div>
    </DashboardLayout>
  );
}
