import DashboardLayout from "@/components/layout/DashboardLayout";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Parts Pipeline">
      <PipelineClient />
    </DashboardLayout>
  );
}
