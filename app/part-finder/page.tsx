import DashboardLayout from "@/components/layout/DashboardLayout";
import PartFinderClient from "./PartFinderClient";

export const dynamic = "force-dynamic";

export default function PartFinderPage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Part Finder">
      <PartFinderClient />
    </DashboardLayout>
  );
}
