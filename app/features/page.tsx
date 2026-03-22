import DashboardLayout from "@/components/layout/DashboardLayout";
import FeatureUsageSection from "@/components/dashboard/FeatureUsageSection";
import { fetchUsers, fetchPickSheetsAndParts, computeFeatureMetrics } from "@/lib/data";

export const revalidate = 30;

export default async function FeaturesPage() {
  const [users, { pickSheets, dbParts }] = await Promise.all([
    fetchUsers(),
    fetchPickSheetsAndParts(),
  ]);
  const metrics = computeFeatureMetrics(users, pickSheets, dbParts);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Feature Usage">
      <FeatureUsageSection {...metrics} />
    </DashboardLayout>
  );
}
