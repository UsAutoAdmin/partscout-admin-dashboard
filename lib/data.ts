import { getServiceRoleClient } from "@/lib/supabase";
import { fetchInboxMessages } from "@/lib/gmail";

const supabase = () => getServiceRoleClient();
const fmt = (d: Date) => d.toISOString();

export async function fetchUsers() {
  const { data } = await supabase()
    .from("users")
    .select("id, email, first_name, last_name, created_at, last_sign_in_at, stripe_subscription_status, clerk_subscription_status, clerk_plan_slug, ebay_connected_at");
  return data ?? [];
}

export type User = Awaited<ReturnType<typeof fetchUsers>>[number];

export function isPaidUser(u: User) {
  return (
    (u.clerk_subscription_status === "active" && u.clerk_plan_slug !== "free_user" && u.clerk_plan_slug !== null) ||
    u.stripe_subscription_status === "active"
  );
}

export function isTrialUser(u: User) {
  return u.clerk_subscription_status === "trialing" || u.stripe_subscription_status === "trialing";
}

export async function fetchPickSheetsAndParts() {
  const [{ data: pickSheets }, { data: dbParts }] = await Promise.all([
    supabase().from("saved_pick_sheets").select("id, user_id, created_at"),
    supabase().from("6_user_database_parts").select("id, user_id, created_at"),
  ]);
  return { pickSheets: pickSheets ?? [], dbParts: dbParts ?? [] };
}

export async function fetchAutomationRuns() {
  const { data } = await supabase()
    .from("new_member_automation_runs")
    .select("id, member_email, member_first_name, member_last_name, member_zip_code, status, failure_step, failure_reason, nearest_yard_name, nearest_yard_distance_miles, vehicles_extracted, parts_matched, share_url, share_link_views, email_sent_at, created_at")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function fetchScrapes() {
  const [
    { count: totalScrapes },
    { count: activeScrapes },
    { data: topScrapes },
  ] = await Promise.all([
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }),
    supabase().from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).gt("active", 0),
    supabase().from("9_Octoparse_Scrapes").select("original_url, active, sold, sell_through").gt("active", 0).order("active", { ascending: false }).limit(10),
  ]);
  return { totalScrapes: totalScrapes ?? 0, activeScrapes: activeScrapes ?? 0, topScrapes: topScrapes ?? [] };
}

export async function fetchInfra() {
  const [
    { count: dirTotal },
    { count: dirVerified },
    { count: totalYards },
    { count: totalRuns },
  ] = await Promise.all([
    supabase().from("junkyard_directory").select("*", { count: "exact", head: true }),
    supabase().from("junkyard_directory").select("*", { count: "exact", head: true }).eq("extractor_verified", true),
    supabase().from("monitored_yards").select("*", { count: "exact", head: true }),
    supabase().from("monitored_yard_runs").select("*", { count: "exact", head: true }),
  ]);
  return { dirTotal: dirTotal ?? 0, dirVerified: dirVerified ?? 0, totalYards: totalYards ?? 0, totalRuns: totalRuns ?? 0 };
}

export async function fetchEmails(count = 20) {
  try {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN)
      return await fetchInboxMessages(count);
  } catch {}
  return [];
}

export function computeUserMetrics(users: User[]) {
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  const d1 = new Date(now); d1.setDate(d1.getDate() - 1);

  const totalUsers = users.length;
  const paidUsers = users.filter(isPaidUser).length;
  const freeUsers = totalUsers - paidUsers;
  const unsynced = users.filter((u) => u.clerk_plan_slug === null && u.stripe_subscription_status === null).length;
  const newToday = users.filter((u) => u.created_at >= fmt(d1)).length;
  const new30d = users.filter((u) => u.created_at >= fmt(d30)).length;
  const ebay = users.filter((u) => u.ebay_connected_at).length;

  const byDay: Record<string, { paid: number; free: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    byDay[d.toISOString().slice(0, 10)] = { paid: 0, free: 0 };
  }
  users.forEach((u) => {
    const day = (u.created_at as string)?.slice(0, 10);
    if (day && byDay[day]) {
      if (isPaidUser(u)) byDay[day].paid++; else byDay[day].free++;
    }
  });
  const chartData = Object.entries(byDay).map(([label, v]) => ({ label, value: v.paid, value2: v.free }));
  const recentUsers = [...users].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 10);

  return { totalUsers, paidUsers, freeUsers, unsynced, newToday, new30d, ebay, chartData, recentUsers };
}

export function computeFeatureMetrics(users: User[], pickSheets: { id: string; user_id: string; created_at: string }[], dbParts: { id: string; user_id: string; created_at: string }[]) {
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  const sheetsByUser: Record<string, number> = {};
  pickSheets.forEach((p) => { sheetsByUser[p.user_id] = (sheetsByUser[p.user_id] ?? 0) + 1; });
  const topSheetUsers = Object.entries(sheetsByUser).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([uid, count]) => { const u = users.find((x) => x.id === uid); return { name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || uid : uid, count }; });

  const partsByUser: Record<string, number> = {};
  dbParts.forEach((p) => { partsByUser[p.user_id] = (partsByUser[p.user_id] ?? 0) + 1; });
  const topPartsUsers = Object.entries(partsByUser).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([uid, count]) => { const u = users.find((x) => x.id === uid); return { name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || uid : uid, count }; });

  return {
    totalSheets: pickSheets.length,
    sheets30d: pickSheets.filter((p) => p.created_at >= fmt(d30)).length,
    totalParts: dbParts.length,
    parts30d: dbParts.filter((p) => p.created_at >= fmt(d30)).length,
    topSheetUsers,
    topPartsUsers,
  };
}

export function computeAutomationMetrics(autoRuns: Awaited<ReturnType<typeof fetchAutomationRuns>>) {
  const autoTotal = autoRuns.length;
  const autoSuccess = autoRuns.filter((r) => r.status === "success").length;
  const autoFailed = autoRuns.filter((r) => r.status === "failed").length;
  const autoSkipped = autoRuns.filter((r) => r.status === "skipped").length;
  const autoProcessing = autoRuns.filter((r) => r.status === "processing").length;
  const autoLinkClicks = autoRuns.reduce((s, r) => s + (r.share_link_views ?? 0), 0);
  const autoSuccessRate = autoTotal > 0 ? Math.round((autoSuccess / autoTotal) * 100) : 0;

  const failureBreakdown: Record<string, number> = {};
  autoRuns.forEach((r) => {
    if ((r.status === "failed" || r.status === "skipped") && r.failure_step)
      failureBreakdown[r.failure_step] = (failureBreakdown[r.failure_step] ?? 0) + 1;
  });
  const failureSteps = Object.entries(failureBreakdown).sort((a, b) => b[1] - a[1]);
  const recentAutoRuns = autoRuns.slice(0, 15);

  return { autoTotal, autoSuccess, autoFailed, autoSkipped, autoProcessing, autoLinkClicks, autoSuccessRate, failureSteps, recentAutoRuns };
}
