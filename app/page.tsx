import { getServiceRoleClient } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { resolveClerkMrrForDashboard, applyStripeMrrOverride } from "@/lib/resolve-clerk-mrr";
import { fetchInboxMessages } from "@/lib/gmail";
import { MetricCard } from "@/components/MetricCard";
import { BarChart } from "@/components/BarChart";
import { GmailInbox } from "@/components/GmailInbox";

export const dynamic = "force-dynamic";

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function fmtNum(n: number) { return new Intl.NumberFormat("en-US").format(n); }
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function Section({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-4"><h2 className="text-lg font-bold text-ink">{title}</h2>{sub && <p className="text-sm text-ink-subtle mt-0.5">{sub}</p>}</div>;
}
function HR() { return <hr className="border-border my-10" />; }

export default async function Dashboard() {
  const supabase = getServiceRoleClient();
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  const d1 = new Date(now); d1.setDate(d1.getDate() - 1);
  const fmt = (d: Date) => d.toISOString();

  const [
    { data: allUsers },
    { data: pickSheets },
    { data: dbParts },
    { count: totalScrapes },
    { count: activeScrapes },
    { data: topScrapes },
    { count: dirTotal },
    { count: dirVerified },
    { count: totalYards },
    { count: totalRuns },
  ] = await Promise.all([
    supabase.from("users").select("id, email, first_name, last_name, created_at, last_sign_in_at, stripe_subscription_status, clerk_subscription_status, clerk_plan_slug, ebay_connected_at"),
    supabase.from("saved_pick_sheets").select("id, user_id, created_at"),
    supabase.from("6_user_database_parts").select("id, user_id, created_at"),
    supabase.from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }),
    supabase.from("9_Octoparse_Scrapes").select("*", { count: "exact", head: true }).gt("active", 0),
    supabase.from("9_Octoparse_Scrapes").select("original_url, active, sold, sell_through").gt("active", 0).order("active", { ascending: false }).limit(10),
    supabase.from("junkyard_directory").select("*", { count: "exact", head: true }),
    supabase.from("junkyard_directory").select("*", { count: "exact", head: true }).eq("extractor_verified", true),
    supabase.from("monitored_yards").select("*", { count: "exact", head: true }),
    supabase.from("monitored_yard_runs").select("*", { count: "exact", head: true }),
  ]);

  // Stripe
  let stripe = { mrr: 0, activeSubs: 0, rev30d: 0, charges30d: 0, canceled30d: 0, balance: 0, recent: [] as any[] };
  try {
    const s = getStripe();
    if (s) {
      const ago30 = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
      const [subs, charges, canceled, bal] = await Promise.all([
        s.subscriptions.list({ status: "active", limit: 100 }),
        s.charges.list({ limit: 100, created: { gte: ago30 } }),
        s.subscriptions.list({ status: "canceled", limit: 100, created: { gte: ago30 } }),
        s.balance.retrieve(),
      ]);
      let mrr = 0;
      for (const sub of subs.data)
        for (const item of sub.items.data) {
          const amt = (item.price.unit_amount ?? 0) / 100;
          if (item.price.recurring?.interval === "month") mrr += amt;
          else if (item.price.recurring?.interval === "year") mrr += amt / 12;
        }
      const ok = charges.data.filter((c) => c.paid && !c.refunded);
      stripe = {
        mrr: Math.round(mrr * 100) / 100,
        activeSubs: subs.data.length,
        rev30d: Math.round(ok.reduce((s, c) => s + c.amount / 100, 0) * 100) / 100,
        charges30d: ok.length,
        canceled30d: canceled.data.length,
        balance: Math.round(bal.available.reduce((s, b) => s + b.amount / 100, 0) * 100) / 100,
        recent: ok.slice(0, 8).map((c) => ({ id: c.id, amount: c.amount / 100, customer: c.billing_details?.email ?? null, created: new Date(c.created * 1000).toISOString() })),
      };
    }
  } catch {}

  // Gmail
  let emails: Awaited<ReturnType<typeof fetchInboxMessages>> = [];
  try {
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN)
      emails = await fetchInboxMessages(20);
  } catch {}

  // Users
  const users = allUsers ?? [];
  const stripePart = applyStripeMrrOverride(stripe.mrr);
  const clerkResolved = await resolveClerkMrrForDashboard(users);
  const { clerkMrr, clerkMrrSubscriberCount, unpricedPlanSlugs, sourceLabel: clerkMrrSource } =
    clerkResolved;
  const totalMrr = Math.round((stripePart.mrr + clerkMrr) * 100) / 100;
  type U = typeof users[number];
  const isPaid = (u: U) =>
    (u.clerk_subscription_status === "active" && u.clerk_plan_slug !== "free_user" && u.clerk_plan_slug !== null) ||
    u.stripe_subscription_status === "active";

  const totalUsers = users.length;
  const paidUsers = users.filter(isPaid).length;
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
      if (isPaid(u)) byDay[day].paid++; else byDay[day].free++;
    }
  });
  const chartData = Object.entries(byDay).map(([label, v]) => ({ label, value: v.paid, value2: v.free }));
  const recentUsers = [...users].sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).slice(0, 10);

  const sheets = pickSheets ?? [];
  const parts = dbParts ?? [];

  const sheetsByUser: Record<string, number> = {};
  sheets.forEach((p) => { sheetsByUser[p.user_id] = (sheetsByUser[p.user_id] ?? 0) + 1; });
  const topSheetUsers = Object.entries(sheetsByUser).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([uid, count]) => { const u = users.find((x) => x.id === uid); return { name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email : uid, count }; });

  const partsByUser: Record<string, number> = {};
  parts.forEach((p) => { partsByUser[p.user_id] = (partsByUser[p.user_id] ?? 0) + 1; });
  const topPartsUsers = Object.entries(partsByUser).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([uid, count]) => { const u = users.find((x) => x.id === uid); return { name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email : uid, count }; });

  const lastUpdated = now.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Part Scout — Business Dashboard</h1>
            <p className="text-sm text-ink-subtle mt-1">Admin metrics · updates on page load</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-subtle">Last updated</p>
            <p className="text-sm font-semibold text-ink">{lastUpdated}</p>
          </div>
        </div>

        {/* ── Revenue ── */}
        <Section
          title="💰 Revenue"
          sub="Total = Stripe + Clerk. Clerk MRR comes from Clerk Billing API using a live key (set CLERK_LIVE_SECRET_KEY or CLERK_SECRET_KEY=sk_live_...). To avoid estimates, leave CLERK_MRR_ALLOW_ESTIMATE unset/false. Stripe MRR comes from your Stripe account (e.g. $199); use STRIPE_MRR_OVERRIDE_USD only if API total is wrong."
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 mb-6">
          <MetricCard
            label="MRR (total)"
            value={fmt$(totalMrr)}
            color="green"
            subtext={`${fmt$(stripePart.mrr)} Stripe + ${fmt$(clerkMrr)} Clerk`}
          />
          <MetricCard
            label="MRR (Stripe)"
            value={fmt$(stripePart.mrr)}
            color="green"
            subtext={stripePart.label}
          />
          <MetricCard
            label="MRR (Clerk)"
            value={fmt$(clerkMrr)}
            color="green"
            subtext={`${clerkMrrSubscriberCount} subscriber${clerkMrrSubscriberCount === 1 ? "" : "s"} · ${clerkMrrSource}`}
          />
          <MetricCard label="Active Subs" value={stripe.activeSubs} color="green" subtext="Stripe" />
          <MetricCard label="Revenue (30d)" value={fmt$(stripe.rev30d)} subtext={`${stripe.charges30d} charges`} color="green" />
          <MetricCard label="Churned (30d)" value={stripe.canceled30d} color={stripe.canceled30d > 0 ? "red" : "default"} />
          <MetricCard label="Stripe Balance" value={fmt$(stripe.balance)} />
        </div>
        {unpricedPlanSlugs.length > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-6">
            Clerk MRR omits unknown plan slug(s):{" "}
            <code className="font-mono">{unpricedPlanSlugs.join(", ")}</code>. Set{" "}
            <code className="font-mono">CLERK_PLAN_MRR_USD</code> (JSON map) in{" "}
            <code className="font-mono">.env.local</code>.
          </p>
        )}

        {stripe.recent.length > 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden mb-10">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-ink text-sm">Recent Payments</h3></div>
            <div className="divide-y divide-border">
              {stripe.recent.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">{c.customer ?? "Customer"}</p>
                    <p className="text-xs text-ink-subtle">{timeAgo(c.created)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{fmt$(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-white px-5 py-4 mb-10 text-sm text-ink-subtle">
            Add <code className="bg-cream-dark px-1 rounded text-xs">STRIPE_SECRET_KEY</code> to <code className="bg-cream-dark px-1 rounded text-xs">.env.local</code> to see revenue data.
          </div>
        )}

        <HR />

        {/* ── Users ── */}
        <Section title="👥 User Activity" sub="Signups, subscriptions, and engagement" />

        {unsynced > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">{unsynced} users have no plan data — may include paid users</p>
              <p className="text-xs text-amber-800 mt-0.5">Run the Clerk sync on Part Scout to pull latest subscription data.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          <MetricCard label="Total Users" value={fmtNum(totalUsers)} />
          <MetricCard label="Paid" value={paidUsers} color="green" subtext="confirmed" />
          <MetricCard label="Free" value={freeUsers} color="blue" />
          <MetricCard label="Unsynced" value={unsynced} color={unsynced > 0 ? "amber" : "default"} subtext="may include paid" />
          <MetricCard label="New Today" value={newToday} color={newToday > 0 ? "amber" : "default"} />
          <MetricCard label="New (30d)" value={new30d} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="rounded-xl border border-border bg-white p-5 shadow-brand-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-ink text-sm">Signups — Last 30 Days</h3>
              <div className="flex items-center gap-3 text-xs text-ink-subtle">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: "#0F3D2E" }} /> Paid</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-300 inline-block" /> Free</span>
              </div>
            </div>
            <BarChart data={chartData} height={100} showLabels color="#0F3D2E" color2="#6EE7B7" />
          </div>

          <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-ink text-sm">Recent Signups</h3></div>
            <div className="divide-y divide-border">
              {recentUsers.map((u) => {
                const paid = isPaid(u);
                const unsynced = u.clerk_plan_slug === null && u.stripe_subscription_status === null;
                const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "—";
                return (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{name}</p>
                      <p className="text-xs text-ink-subtle truncate">{u.email ?? u.id}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {paid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Paid</span>
                      ) : unsynced ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">?</span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Free</span>
                      )}
                      {u.ebay_connected_at && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">eBay</span>}
                      <span className="text-xs text-ink-subtle">{timeAgo(u.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-10">
          <MetricCard label="eBay Connected" value={ebay} color="blue" subtext={`of ${paidUsers} paid`} />
          <MetricCard label="Conversion Rate" value={`${Math.round((paidUsers / (totalUsers || 1)) * 100)}%`} color="green" />
          <MetricCard label="Churned (30d)" value={stripe.canceled30d} color={stripe.canceled30d > 0 ? "red" : "default"} />
          <MetricCard label="Net New (30d)" value={new30d - stripe.canceled30d} color={new30d >= stripe.canceled30d ? "green" : "red"} subtext="signups minus churn" />
        </div>

        <HR />

        {/* ── Feature Usage ── */}
        <Section title="⚡ Feature Usage" sub="Pick sheets and database parts" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          <MetricCard label="Pick Sheets Total" value={fmtNum(sheets.length)} color="purple" />
          <MetricCard label="Pick Sheets (30d)" value={sheets.filter(p => p.created_at >= fmt(d30)).length} color="purple" />
          <MetricCard label="DB Parts Total" value={fmtNum(parts.length)} color="blue" />
          <MetricCard label="DB Parts (30d)" value={parts.filter(p => p.created_at >= fmt(d30)).length} color="blue" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-ink text-sm">Top Pick Sheet Users</h3></div>
            <div className="divide-y divide-border">
              {topSheetUsers.map((u, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-ink-subtle w-4">{i + 1}</span>
                    <p className="text-sm font-medium text-ink truncate max-w-[200px]">{u.name}</p>
                  </div>
                  <span className="text-sm font-bold text-purple-700">{u.count} sheets</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-ink text-sm">Top Database Parts Users</h3></div>
            <div className="divide-y divide-border">
              {topPartsUsers.map((u, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-ink-subtle w-4">{i + 1}</span>
                    <p className="text-sm font-medium text-ink truncate max-w-[200px]">{u.name}</p>
                  </div>
                  <span className="text-sm font-bold text-blue-700">{u.count} parts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <HR />

        {/* ── Table 9 ── */}
        <Section title="🔬 Table 9 — Octoparse Scrapes" sub="eBay market data" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
          <MetricCard label="Total Records" value={fmtNum(totalScrapes ?? 0)} />
          <MetricCard label="Active > 0" value={fmtNum(activeScrapes ?? 0)} color="green" subtext="has eBay listings" />
          <MetricCard label="Coverage" value={`${totalScrapes ? Math.round(((activeScrapes ?? 0) / totalScrapes) * 100) : 0}%`} color="blue" />
          <MetricCard label="Junkyard Locations" value={fmtNum(dirTotal ?? 0)} subtext={`${dirVerified ?? 0} verified`} />
        </div>

        {(topScrapes ?? []).length > 0 && (
          <div className="rounded-xl border border-border bg-white shadow-brand-sm overflow-hidden mb-10">
            <div className="px-5 py-4 border-b border-border"><h3 className="font-semibold text-ink text-sm">Top Active Parts (by eBay Listings)</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-cream">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-ink-subtle uppercase">URL</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-ink-subtle uppercase">Active</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-ink-subtle uppercase">Sold</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-ink-subtle uppercase">Sell-Through</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(topScrapes ?? []).map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-cream">
                      <td className="px-5 py-3 max-w-xs"><p className="text-xs text-ink-subtle truncate font-mono">{row.original_url}</p></td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">{row.active}</td>
                      <td className="px-5 py-3 text-right text-ink-subtle">{row.sold ?? "—"}</td>
                      <td className="px-5 py-3 text-right">
                        {row.sell_through != null ? (
                          <span className={`font-semibold ${row.sell_through >= 50 ? "text-emerald-600" : row.sell_through >= 25 ? "text-amber-600" : "text-red-500"}`}>{row.sell_through}%</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <HR />

        {/* ── Gmail ── */}
        <Section title="📧 Business Email" sub="chaseeriksson@partscout.app — click any email to draft a reply" />
        <div className="mb-10">
          <GmailInbox initialEmails={emails} />
        </div>

        <HR />

        {/* ── Infrastructure ── */}
        <Section title="🗂 Infrastructure" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-10">
          <MetricCard label="Junkyard Directory" value={fmtNum(dirTotal ?? 0)} />
          <MetricCard label="Verified Extractors" value={dirVerified ?? 0} color="green" />
          <MetricCard label="Monitored Yards" value={totalYards ?? 0} color="blue" />
          <MetricCard label="Monitoring Runs" value={fmtNum(totalRuns ?? 0)} color="blue" />
        </div>

        {/* ── Quick Links ── */}
        <HR />
        <Section title="🔗 Quick Links" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          {[
            { label: "Supabase", href: "https://supabase.com/dashboard", icon: "🗄" },
            { label: "Stripe", href: "https://dashboard.stripe.com", icon: "💳" },
            { label: "Clerk", href: "https://dashboard.clerk.com", icon: "🔑" },
            { label: "Vercel", href: "https://vercel.com/dashboard", icon: "▲" },
            { label: "Gmail", href: "https://mail.google.com", icon: "📧" },
            { label: "eBay Dev", href: "https://developer.ebay.com", icon: "🛒" },
          ].map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold text-ink shadow-brand-sm hover:bg-cream-dark transition-colors">
              <span>{link.icon}</span><span>{link.label}</span>
            </a>
          ))}
        </div>

        <p className="text-center text-xs text-ink-subtle pb-8">Part Scout Admin Dashboard · {lastUpdated}</p>
      </div>
    </main>
  );
}
