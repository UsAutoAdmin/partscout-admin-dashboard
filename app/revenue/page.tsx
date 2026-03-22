import DashboardLayout from "@/components/layout/DashboardLayout";
import RevenueSection from "@/components/dashboard/RevenueSection";
import { fetchUsers, fetchRevenue } from "@/lib/data";

export const revalidate = 30;

export default async function RevenuePage() {
  const users = await fetchUsers();
  const { stripe, stripePart, clerkResolved, totalMrr } = await fetchRevenue(users);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Revenue">
      <RevenueSection
        totalMrr={totalMrr}
        stripeMrr={stripePart.mrr}
        stripeMrrLabel={stripePart.label}
        clerkMrr={clerkResolved.clerkMrr}
        clerkMrrSubscriberCount={clerkResolved.clerkMrrSubscriberCount}
        clerkMrrSource={clerkResolved.sourceLabel}
        activeSubs={stripe.activeSubs}
        rev30d={stripe.rev30d}
        charges30d={stripe.charges30d}
        canceled30d={stripe.canceled30d}
        balance={stripe.balance}
        recentPayments={stripe.recent}
        unpricedPlanSlugs={clerkResolved.unpricedPlanSlugs}
      />
    </DashboardLayout>
  );
}
