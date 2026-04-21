import "server-only";
import { getServiceRoleClient } from "@/lib/supabase";
import {
  STAGES,
  STAGE_LABELS,
  HEATMAP_DAYS,
  type Stage,
  type CrmUserRow,
  type PipelineRow,
  type PipelineFunnel,
  type ContactDetail,
  type ContactDetailMessage,
  type ContactTimelineEvent,
} from "@/lib/crm-types";

export {
  STAGES,
  STAGE_LABELS,
  HEATMAP_DAYS,
};
export type {
  Stage,
  CrmUserRow,
  PipelineRow,
  PipelineFunnel,
  ContactDetail,
  ContactDetailMessage,
  ContactTimelineEvent,
};

const supabase = () => getServiceRoleClient();

interface CrmContactRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  zip: string | null;
  last_activity_at: string | null;
  created_at: string;
}

interface CrmMessageRow {
  id: string;
  contact_id: string;
  subject: string;
  share_path: string | null;
  yard_name: string | null;
  yard_city: string | null;
  yard_state: string | null;
  tracking_token: string;
  delivery_method: string | null;
  sent_at: string;
}

interface CrmMessageEventRow {
  id: string;
  message_id: string;
  link_id: string | null;
  event_type: string;
  user_agent: string | null;
  created_at: string;
}

interface CrmMessageLinkRow {
  id: string;
  message_id: string;
  target_url: string;
  created_at: string;
}

interface PickSheetRow {
  id: string;
  user_id: string;
  name: string | null;
  created_at: string;
}

export function isPaidUser(u: Pick<CrmUserRow, "clerk_subscription_status" | "clerk_plan_slug" | "stripe_subscription_status">) {
  return (
    (u.clerk_subscription_status === "active" &&
      u.clerk_plan_slug !== "free_user" &&
      u.clerk_plan_slug !== null) ||
    u.stripe_subscription_status === "active"
  );
}

export function isTrialUser(u: Pick<CrmUserRow, "clerk_subscription_status" | "stripe_trial_end" | "stripe_subscription_status">) {
  if (u.clerk_subscription_status === "trialing") return true;
  if (u.stripe_subscription_status === "trialing") return true;
  if (u.stripe_trial_end) {
    const end = Date.parse(u.stripe_trial_end);
    if (!Number.isNaN(end) && end > Date.now()) return true;
  }
  return false;
}

export function classifyStage(row: Pick<PipelineRow,
  "emailCount" | "openCount" | "clickCount" | "userId" | "isPaid" | "isTrial"
>): Stage {
  if (row.isPaid) return "paid";
  if (row.isTrial) return "trial";
  if (row.userId) return "signed_up";
  if (row.clickCount > 0) return "clicked";
  if (row.openCount > 0) return "opened";
  if (row.emailCount > 0) return "emailed";
  return "community";
}

const PER_ATTEMPT_TIMEOUT_MS = 6_000;

async function fetchPageWithRetry(
  table: string,
  columns: string,
  offset: number,
  pageSize: number,
  attempts = 4,
) {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("client timeout")), PER_ATTEMPT_TIMEOUT_MS);
    try {
      let q = supabase().from(table).select(columns).abortSignal(ctrl.signal);
      if (offset > 0 || pageSize !== 1000) q = q.range(offset, offset + pageSize - 1);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    } catch (e) {
      lastErr = e;
      // tight backoff so 4 attempts bound to ~25s worst case (well under page UX threshold)
      const delayMs = 200 + 200 * i + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delayMs));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch ${table}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

async function fetchAllPaged<T>(table: string, columns: string, pageSize = 1000): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  while (true) {
    const data = await fetchPageWithRetry(table, columns, offset, pageSize);
    if (!data || data.length === 0) break;
    results.push(...(data as unknown as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 200_000) break;
  }
  return results;
}

function buildHeatmap(events: { created_at: string }[]): { byDay: number[]; lastAt: string | null; total: number; total30d: number } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const byDay = new Array<number>(HEATMAP_DAYS).fill(0);
  const startMs = today.getTime() - (HEATMAP_DAYS - 1) * 24 * 60 * 60 * 1000;
  let lastAt: string | null = null;
  let total30d = 0;
  const cutoff30 = today.getTime() - 30 * 24 * 60 * 60 * 1000;
  for (const e of events) {
    const ts = Date.parse(e.created_at);
    if (Number.isNaN(ts)) continue;
    if (!lastAt || e.created_at > lastAt) lastAt = e.created_at;
    if (ts >= cutoff30) total30d += 1;
    if (ts >= startMs && ts <= today.getTime() + 24 * 60 * 60 * 1000) {
      const idx = Math.floor((ts - startMs) / (24 * 60 * 60 * 1000));
      if (idx >= 0 && idx < HEATMAP_DAYS) byDay[idx] += 1;
    }
  }
  return { byDay, lastAt, total: events.length, total30d };
}

interface EmbeddedContactRow extends CrmContactRow {
  crm_messages: Array<
    Omit<CrmMessageRow, "contact_id"> & {
      crm_message_events: Array<Omit<CrmMessageEventRow, "message_id">>;
      crm_message_links: Array<Omit<CrmMessageLinkRow, "message_id">>;
    }
  >;
}

export async function fetchAllCrmData() {
  // 3 round trips total instead of 6. PostgREST embedded select collapses
  // contacts -> messages -> (events, links) into a single response, which is
  // critical when the network path to Supabase is unreliable.
  const embedded = await fetchPageWithRetry(
    "crm_contacts",
    `id, email, first_name, last_name, phone, zip, last_activity_at, created_at,
     crm_messages (
       id, subject, share_path, yard_name, yard_city, yard_state, tracking_token, delivery_method, sent_at,
       crm_message_events ( id, link_id, event_type, user_agent, created_at ),
       crm_message_links ( id, target_url, created_at )
     )`,
    0,
    1000,
  );
  const contacts: CrmContactRow[] = [];
  const messages: CrmMessageRow[] = [];
  const events: CrmMessageEventRow[] = [];
  const links: CrmMessageLinkRow[] = [];
  for (const c of embedded as unknown as EmbeddedContactRow[]) {
    const { crm_messages, ...rest } = c;
    contacts.push(rest as CrmContactRow);
    for (const m of crm_messages ?? []) {
      const { crm_message_events, crm_message_links, ...mrest } = m;
      messages.push({ ...(mrest as Omit<CrmMessageRow, "contact_id">), contact_id: c.id });
      for (const e of crm_message_events ?? []) events.push({ ...e, message_id: m.id });
      for (const l of crm_message_links ?? []) links.push({ ...l, message_id: m.id });
    }
  }
  const users = await fetchAllPaged<CrmUserRow>(
    "users",
    "id, email, first_name, last_name, created_at, last_sign_in_at, clerk_plan_slug, clerk_subscription_status, clerk_period_end, clerk_cancel_at_period_end, stripe_subscription_status, stripe_trial_end, stripe_cancel_at_period_end, stripe_current_period_end, ebay_connected_at",
  );
  const pickSheets = await fetchAllPaged<PickSheetRow>(
    "saved_pick_sheets",
    "id, user_id, name, created_at",
  );
  return { contacts, messages, events, links, users, pickSheets };
}

interface PipelinePayload { rows: PipelineRow[]; funnel: PipelineFunnel }

interface CacheEntry { at: number; payload: PipelinePayload }

const PIPELINE_CACHE_TTL_MS = 60_000;
let pipelineCache: CacheEntry | null = null;
let inflight: Promise<PipelinePayload> | null = null;

export async function fetchPipelineRows(opts: { allowStale?: boolean } = {}): Promise<PipelinePayload> {
  const fresh = pipelineCache && Date.now() - pipelineCache.at < PIPELINE_CACHE_TTL_MS;
  if (fresh && pipelineCache) return pipelineCache.payload;

  if (!inflight) {
    inflight = computePipelinePayload()
      .then((payload) => {
        pipelineCache = { at: Date.now(), payload };
        return payload;
      })
      .finally(() => {
        inflight = null;
      });
  }

  try {
    return await inflight;
  } catch (err) {
    if (opts.allowStale !== false && pipelineCache) {
      // network is flaky right now; serve last known good payload so the UI keeps working
      return pipelineCache.payload;
    }
    throw err;
  }
}

async function computePipelinePayload(): Promise<PipelinePayload> {
  const { contacts, messages, events, users, pickSheets } = await fetchAllCrmData();

  const messagesByContact = new Map<string, CrmMessageRow[]>();
  for (const m of messages) {
    const arr = messagesByContact.get(m.contact_id) ?? [];
    arr.push(m);
    messagesByContact.set(m.contact_id, arr);
  }

  const eventsByMessage = new Map<string, CrmMessageEventRow[]>();
  for (const e of events) {
    const arr = eventsByMessage.get(e.message_id) ?? [];
    arr.push(e);
    eventsByMessage.set(e.message_id, arr);
  }

  const usersByEmail = new Map<string, CrmUserRow>();
  for (const u of users) {
    if (u.email) usersByEmail.set(u.email.trim().toLowerCase(), u);
  }

  const pickSheetsByUser = new Map<string, PickSheetRow[]>();
  for (const p of pickSheets) {
    const arr = pickSheetsByUser.get(p.user_id) ?? [];
    arr.push(p);
    pickSheetsByUser.set(p.user_id, arr);
  }

  const rows: PipelineRow[] = [];
  const matchedUserIds = new Set<string>();

  for (const c of contacts) {
    const msgs = messagesByContact.get(c.id) ?? [];
    let openCount = 0;
    let clickCount = 0;
    let firstOpenedAt: string | null = null;
    let firstClickedAt: string | null = null;
    let firstSentAt: string | null = null;
    let lastSentAt: string | null = null;
    for (const m of msgs) {
      if (!firstSentAt || m.sent_at < firstSentAt) firstSentAt = m.sent_at;
      if (!lastSentAt || m.sent_at > lastSentAt) lastSentAt = m.sent_at;
      const evs = eventsByMessage.get(m.id) ?? [];
      for (const e of evs) {
        if (e.event_type === "open") {
          openCount += 1;
          if (!firstOpenedAt || e.created_at < firstOpenedAt) firstOpenedAt = e.created_at;
        } else if (e.event_type === "click") {
          clickCount += 1;
          if (!firstClickedAt || e.created_at < firstClickedAt) firstClickedAt = e.created_at;
        }
      }
    }

    const user = usersByEmail.get(c.email.trim().toLowerCase()) ?? null;
    if (user) matchedUserIds.add(user.id);

    const userPickSheets = user ? pickSheetsByUser.get(user.id) ?? [] : [];
    const heat = buildHeatmap(userPickSheets);

    const isPaid = user ? isPaidUser(user) : false;
    const isTrial = user ? isTrialUser(user) : false;

    const partial: PipelineRow = {
      rowKey: `c:${c.id}`,
      contactId: c.id,
      email: c.email,
      firstName: c.first_name ?? user?.first_name ?? null,
      lastName: c.last_name ?? user?.last_name ?? null,
      zip: c.zip,
      phone: c.phone,
      contactCreatedAt: c.created_at,
      contactLastActivityAt: c.last_activity_at,

      emailCount: msgs.length,
      openCount,
      clickCount,
      firstSentAt,
      lastSentAt,
      firstOpenedAt,
      firstClickedAt,

      userId: user?.id ?? null,
      userCreatedAt: user?.created_at ?? null,
      lastSignInAt: user?.last_sign_in_at ?? null,
      clerkPlanSlug: user?.clerk_plan_slug ?? null,
      clerkSubscriptionStatus: user?.clerk_subscription_status ?? null,
      stripeSubscriptionStatus: user?.stripe_subscription_status ?? null,
      stripeTrialEnd: user?.stripe_trial_end ?? null,
      ebayConnectedAt: user?.ebay_connected_at ?? null,

      pickSheetCount: heat.total,
      pickSheets30dCount: heat.total30d,
      pickSheetsByDay: heat.byDay,
      lastPickSheetAt: heat.lastAt,

      isPaid,
      isTrial,
      isDirect: false,
      stage: "community",
    };
    partial.stage = classifyStage(partial);
    rows.push(partial);
  }

  // Direct signups: users not matched to any crm_contact
  for (const u of users) {
    if (matchedUserIds.has(u.id)) continue;
    const userPickSheets = pickSheetsByUser.get(u.id) ?? [];
    const heat = buildHeatmap(userPickSheets);
    const isPaid = isPaidUser(u);
    const isTrial = isTrialUser(u);
    const partial: PipelineRow = {
      rowKey: `u:${u.id}`,
      contactId: null,
      email: u.email ?? "",
      firstName: u.first_name,
      lastName: u.last_name,
      zip: null,
      phone: null,
      contactCreatedAt: null,
      contactLastActivityAt: null,

      emailCount: 0,
      openCount: 0,
      clickCount: 0,
      firstSentAt: null,
      lastSentAt: null,
      firstOpenedAt: null,
      firstClickedAt: null,

      userId: u.id,
      userCreatedAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      clerkPlanSlug: u.clerk_plan_slug,
      clerkSubscriptionStatus: u.clerk_subscription_status,
      stripeSubscriptionStatus: u.stripe_subscription_status,
      stripeTrialEnd: u.stripe_trial_end,
      ebayConnectedAt: u.ebay_connected_at,

      pickSheetCount: heat.total,
      pickSheets30dCount: heat.total30d,
      pickSheetsByDay: heat.byDay,
      lastPickSheetAt: heat.lastAt,

      isPaid,
      isTrial,
      isDirect: true,
      stage: "community",
    };
    partial.stage = classifyStage(partial);
    rows.push(partial);
  }

  rows.sort((a, b) => {
    const aTime = a.contactCreatedAt ?? a.userCreatedAt ?? "";
    const bTime = b.contactCreatedAt ?? b.userCreatedAt ?? "";
    return bTime.localeCompare(aTime);
  });

  const funnel = computePipelineFunnel(rows);
  return { rows, funnel };
}

export function computePipelineFunnel(rows: PipelineRow[]): PipelineFunnel {
  const skoolRows = rows.filter((r) => !r.isDirect);
  const directSignups = rows.length - skoolRows.length;
  const total = skoolRows.length;

  const stageCounts: Record<Stage, number> = {
    community: total,
    emailed: skoolRows.filter((r) => r.emailCount > 0).length,
    opened: skoolRows.filter((r) => r.emailCount > 0 && r.openCount > 0).length,
    clicked: skoolRows.filter((r) => r.emailCount > 0 && r.clickCount > 0).length,
    signed_up: skoolRows.filter((r) => r.userId !== null).length,
    trial: skoolRows.filter((r) => r.isTrial).length,
    paid: skoolRows.filter((r) => r.isPaid).length,
  };

  const stageList = STAGES.map((stage, i) => {
    const count = stageCounts[stage];
    const prev = i === 0 ? count : stageCounts[STAGES[i - 1]];
    const dropFromPrev = i === 0 || prev === 0 ? 0 : Math.round(((prev - count) / prev) * 100);
    const pctOfTotal = total === 0 ? 0 : Math.round((count / total) * 100);
    return { stage, label: STAGE_LABELS[stage], count, pctOfTotal, dropFromPrev };
  });

  return { total, directSignups, stages: stageList };
}

// ---------- per-contact detail (drawer / API route) ----------

async function fetchContactById(id: string): Promise<CrmContactRow | null> {
  const { data, error } = await supabase()
    .from("crm_contacts")
    .select("id, email, first_name, last_name, phone, zip, last_activity_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`fetchContactById: ${error.message}`);
  return (data as unknown as CrmContactRow | null) ?? null;
}

async function fetchUserByEmail(email: string): Promise<CrmUserRow | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase()
    .from("users")
    .select("id, email, first_name, last_name, created_at, last_sign_in_at, clerk_plan_slug, clerk_subscription_status, clerk_period_end, clerk_cancel_at_period_end, stripe_subscription_status, stripe_trial_end, stripe_cancel_at_period_end, stripe_current_period_end, ebay_connected_at")
    .ilike("email", trimmed)
    .maybeSingle();
  if (error) throw new Error(`fetchUserByEmail: ${error.message}`);
  return (data as unknown as CrmUserRow | null) ?? null;
}

async function fetchUserById(id: string): Promise<CrmUserRow | null> {
  const { data, error } = await supabase()
    .from("users")
    .select("id, email, first_name, last_name, created_at, last_sign_in_at, clerk_plan_slug, clerk_subscription_status, clerk_period_end, clerk_cancel_at_period_end, stripe_subscription_status, stripe_trial_end, stripe_cancel_at_period_end, stripe_current_period_end, ebay_connected_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`fetchUserById: ${error.message}`);
  return (data as unknown as CrmUserRow | null) ?? null;
}

export async function fetchContactDetail(rowKey: string): Promise<ContactDetail | null> {
  const isUserRow = rowKey.startsWith("u:");
  const id = rowKey.slice(2);
  if (!id) return null;

  let contact: CrmContactRow | null = null;
  let user: CrmUserRow | null = null;

  if (isUserRow) {
    user = await fetchUserById(id);
    if (!user) return null;
  } else {
    contact = await fetchContactById(id);
    if (!contact) return null;
    if (contact.email) user = await fetchUserByEmail(contact.email);
  }

  let messages: CrmMessageRow[] = [];
  if (contact) {
    const { data, error } = await supabase()
      .from("crm_messages")
      .select("id, contact_id, subject, share_path, yard_name, yard_city, yard_state, tracking_token, delivery_method, sent_at")
      .eq("contact_id", contact.id);
    if (error) throw new Error(`fetch messages: ${error.message}`);
    messages = (data as unknown as CrmMessageRow[]) ?? [];
  }

  const messageIds = messages.map((m) => m.id);
  let events: CrmMessageEventRow[] = [];
  let links: CrmMessageLinkRow[] = [];
  if (messageIds.length) {
    const [evRes, linkRes] = await Promise.all([
      supabase()
        .from("crm_message_events")
        .select("id, message_id, link_id, event_type, user_agent, created_at")
        .in("message_id", messageIds),
      supabase()
        .from("crm_message_links")
        .select("id, message_id, target_url, created_at")
        .in("message_id", messageIds),
    ]);
    if (evRes.error) throw new Error(`fetch events: ${evRes.error.message}`);
    if (linkRes.error) throw new Error(`fetch links: ${linkRes.error.message}`);
    events = (evRes.data as unknown as CrmMessageEventRow[]) ?? [];
    links = (linkRes.data as unknown as CrmMessageLinkRow[]) ?? [];
  }

  const linkById = new Map<string, CrmMessageLinkRow>();
  for (const l of links) linkById.set(l.id, l);

  let pickSheets: PickSheetRow[] = [];
  if (user) {
    const { data, error } = await supabase()
      .from("saved_pick_sheets")
      .select("id, user_id, name, created_at")
      .eq("user_id", user.id);
    if (error) throw new Error(`fetch pickSheets: ${error.message}`);
    pickSheets = (data as unknown as PickSheetRow[]) ?? [];
  }

  const heat = buildHeatmap(pickSheets);
  const isPaid = user ? isPaidUser(user) : false;
  const isTrial = user ? isTrialUser(user) : false;
  const stage = classifyStage({
    emailCount: messages.length,
    openCount: events.filter((e) => e.event_type === "open").length,
    clickCount: events.filter((e) => e.event_type === "click").length,
    userId: user?.id ?? null,
    isPaid,
    isTrial,
  });

  const sortedMessages = [...messages].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const detailMessages: ContactDetailMessage[] = sortedMessages.map((m) => {
    const opens = events
      .filter((e) => e.message_id === m.id && e.event_type === "open")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ id: e.id, at: e.created_at, userAgent: e.user_agent }));
    const clicks = events
      .filter((e) => e.message_id === m.id && e.event_type === "click")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({
        id: e.id,
        at: e.created_at,
        userAgent: e.user_agent,
        targetUrl: e.link_id ? linkById.get(e.link_id)?.target_url ?? null : null,
      }));
    return {
      id: m.id,
      subject: m.subject,
      sentAt: m.sent_at,
      yardName: m.yard_name,
      yardCity: m.yard_city,
      yardState: m.yard_state,
      sharePath: m.share_path,
      trackingToken: m.tracking_token,
      deliveryMethod: m.delivery_method,
      opens,
      clicks,
    };
  });

  const timeline: ContactTimelineEvent[] = [];
  for (const m of sortedMessages) {
    timeline.push({
      type: "email_sent",
      at: m.sent_at,
      label: "Email sent",
      detail: m.subject,
      href: m.share_path ?? null,
    });
    for (const e of events.filter((x) => x.message_id === m.id)) {
      if (e.event_type === "open") {
        timeline.push({ type: "email_opened", at: e.created_at, label: "Email opened", detail: m.subject, href: null });
      } else if (e.event_type === "click") {
        const link = e.link_id ? linkById.get(e.link_id) : null;
        timeline.push({ type: "email_clicked", at: e.created_at, label: "Link clicked", detail: link?.target_url ?? m.subject, href: link?.target_url ?? null });
      }
    }
  }
  if (user?.created_at) {
    timeline.push({ type: "user_created", at: user.created_at, label: "Signed up to Part Scout", detail: user.email, href: null });
  }
  if (user?.stripe_trial_end || user?.clerk_subscription_status === "trialing" || user?.stripe_subscription_status === "trialing") {
    const at = user.stripe_trial_end ?? user.clerk_period_end ?? user.created_at ?? new Date().toISOString();
    timeline.push({ type: "trial_started", at, label: "Trial started", detail: user.clerk_plan_slug ?? null, href: null });
  }
  if (isPaid && user) {
    const at = user.clerk_period_end ?? user.stripe_current_period_end ?? user.created_at ?? new Date().toISOString();
    timeline.push({ type: "subscription_started", at, label: "Became paid", detail: user.clerk_plan_slug ?? "paid", href: null });
  }
  if (user?.ebay_connected_at) {
    timeline.push({ type: "ebay_connected", at: user.ebay_connected_at, label: "Connected eBay", detail: null, href: null });
  }
  for (const p of pickSheets) {
    timeline.push({ type: "pick_sheet_created", at: p.created_at, label: "Pick sheet created", detail: p.name, href: null });
  }
  if (user?.last_sign_in_at) {
    timeline.push({ type: "last_sign_in", at: user.last_sign_in_at, label: "Last sign-in", detail: null, href: null });
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  return {
    contact: {
      id: contact?.id ?? null,
      email: contact?.email ?? user?.email ?? "",
      firstName: contact?.first_name ?? user?.first_name ?? null,
      lastName: contact?.last_name ?? user?.last_name ?? null,
      zip: contact?.zip ?? null,
      phone: contact?.phone ?? null,
      createdAt: contact?.created_at ?? null,
      lastActivityAt: contact?.last_activity_at ?? null,
    },
    user,
    messages: detailMessages,
    pickSheets: pickSheets
      .map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    pickSheetHeatmap: heat.byDay,
    isPaid,
    isTrial,
    isDirect: !contact,
    stage,
    timeline,
  };
}
