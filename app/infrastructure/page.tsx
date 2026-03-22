import DashboardLayout from "@/components/layout/DashboardLayout";
import InfraSection from "@/components/dashboard/InfraSection";
import { fetchInfra } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InfrastructurePage() {
  const infra = await fetchInfra();

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Infrastructure">
      <InfraSection {...infra} />
    </DashboardLayout>
  );
}
