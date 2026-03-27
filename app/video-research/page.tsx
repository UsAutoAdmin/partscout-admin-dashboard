import DashboardLayout from "@/components/layout/DashboardLayout";
import VideoResearchClient from "./VideoResearchClient";

export const dynamic = "force-dynamic";

export default function VideoResearchPage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Video Research Parts">
      <VideoResearchClient />
    </DashboardLayout>
  );
}
