import DashboardLayout from "@/components/layout/DashboardLayout";
import ScraperMonitorClient from "./ScraperMonitorClient";

export const dynamic = "force-dynamic";

export default function ScraperMonitorPage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Scraper Monitor">
      <ScraperMonitorClient />
    </DashboardLayout>
  );
}
