import DashboardLayout from "@/components/layout/DashboardLayout";
import { GmailInbox } from "@/components/GmailInbox";
import SectionHeader from "@/components/SectionHeader";
import { fetchEmails } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const emails = await fetchEmails(30);

  const lastUpdated = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <DashboardLayout lastUpdated={lastUpdated} title="Inbox">
      <SectionHeader title="Business Email" subtitle="chaseeriksson@partscout.app" />
      <GmailInbox initialEmails={emails} />
    </DashboardLayout>
  );
}
