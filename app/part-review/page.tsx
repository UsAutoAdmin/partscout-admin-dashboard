import DashboardLayout from "@/components/layout/DashboardLayout";
import PartReviewClient from "./PartReviewClient";

export const dynamic = "force-dynamic";

export default function PartReviewPage() {
  const lastUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Part Review">
      <PartReviewClient />
    </DashboardLayout>
  );
}
