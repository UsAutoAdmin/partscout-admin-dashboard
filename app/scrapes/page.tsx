import DashboardLayout from "@/components/layout/DashboardLayout";
import ScrapesSection from "@/components/dashboard/ScrapesSection";
import { fetchScrapes, fetchInfra } from "@/lib/data";

export const revalidate = 30;

export default async function ScrapesPage() {
  const [scrapes, infra] = await Promise.all([fetchScrapes(), fetchInfra()]);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Scrapes">
      <ScrapesSection
        totalScrapes={scrapes.totalScrapes}
        activeScrapes={scrapes.activeScrapes}
        dirTotal={infra.dirTotal}
        dirVerified={infra.dirVerified}
        topScrapes={scrapes.topScrapes as any}
      />
    </DashboardLayout>
  );
}
