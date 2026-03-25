import DashboardLayout from "@/components/layout/DashboardLayout";
import ScrapesSection from "@/components/dashboard/ScrapesSection";
import ScrapesConfigWarning from "@/components/dashboard/ScrapesConfigWarning";
import { fetchScrapePipelineMetrics } from "@/lib/scrapes";

export const dynamic = "force-dynamic";

export default async function ScrapesPage() {
  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  try {
    const metrics = await fetchScrapePipelineMetrics();
    return (
      <DashboardLayout lastUpdated={lastUpdated} title="Scrapes">
        <ScrapesSection {...metrics} />
      </DashboardLayout>
    );
  } catch (error) {
    return (
      <DashboardLayout lastUpdated={lastUpdated} title="Scrapes">
        <ScrapesConfigWarning message={error instanceof Error ? error.message : "Unknown scrapes configuration error."} />
      </DashboardLayout>
    );
  }
}
