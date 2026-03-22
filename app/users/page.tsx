import DashboardLayout from "@/components/layout/DashboardLayout";
import UsersSection from "@/components/dashboard/UsersSection";
import { fetchUsers, fetchRevenue, computeUserMetrics, isPaidUser } from "@/lib/data";

export const revalidate = 30;

export default async function UsersPage() {
  const users = await fetchUsers();
  const { stripe } = await fetchRevenue(users);
  const metrics = computeUserMetrics(users);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Users">
      <UsersSection
        totalUsers={metrics.totalUsers}
        paidUsers={metrics.paidUsers}
        freeUsers={metrics.freeUsers}
        unsynced={metrics.unsynced}
        newToday={metrics.newToday}
        new30d={metrics.new30d}
        ebay={metrics.ebay}
        canceled30d={stripe.canceled30d}
        chartData={metrics.chartData}
        recentUsers={metrics.recentUsers.map(u => ({ ...u, isPaid: isPaidUser(u) }))}
      />
    </DashboardLayout>
  );
}
