import DashboardLayout from "@/components/layout/DashboardLayout";
import AutomationSection from "@/components/dashboard/AutomationSection";
import { fetchAutomationRuns, computeAutomationMetrics } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AutomationPage() {
  const autoRuns = await fetchAutomationRuns();
  const metrics = computeAutomationMetrics(autoRuns);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Automation">
      <AutomationSection {...metrics} />
    </DashboardLayout>
  );
}
