import DashboardLayout from "@/components/layout/DashboardLayout";
import ScrapesSection from "@/components/dashboard/ScrapesSection";
import { fetchScrapePipelineMetrics } from "@/lib/scrapes";

export const dynamic = "force-dynamic";

export default async function ScrapesPage() {
  const metrics = await fetchScrapePipelineMetrics();

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Scrapes">
      <ScrapesSection {...metrics} />
    </DashboardLayout>
  );
}
