import DashboardLayout from "@/components/layout/DashboardLayout";
import CRMPipelinePage from "@/components/crm/CRMPipelinePage";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <DashboardLayout title="CRM Pipeline">
      <CRMPipelinePage />
    </DashboardLayout>
  );
}
