import DashboardLayout from "@/components/layout/DashboardLayout";
import VirtualAssistantClient from "./VirtualAssistantClient";

export const dynamic = "force-dynamic";

export default function VirtualAssistantPage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Virtual Assistant">
      <VirtualAssistantClient />
    </DashboardLayout>
  );
}
