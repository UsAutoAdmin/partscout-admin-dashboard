import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const TRACK_PATH = "/api/crm/track";

export function shouldTrackHref(href: string): boolean {
  const u = href.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) return false;
  if (u.includes(`${TRACK_PATH}/`)) return false;
  return true;
}

function collectTrackableHrefs(html: string): string[] {
  const re = /href\s*=\s*"([^"]*)"/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (shouldTrackHref(m[1])) out.push(m[1]);
  }
  return out;
}

function rewriteHrefs(html: string, appUrl: string, linkIds: string[]): string {
  let i = 0;
  return html.replace(/href\s*=\s*"([^"]*)"/gi, (full, href: string) => {
    if (!shouldTrackHref(href)) return full;
    const id = linkIds[i++];
    if (!id) return full;
    const track = `${appUrl.replace(/\/$/, "")}${TRACK_PATH}/click?l=${id}`;
    return `href="${track}"`;
  });
}

function injectOpenPixel(html: string, appUrl: string, trackingToken: string): string {
  const base = appUrl.replace(/\/$/, "");
  const pixel = `<img src="${base}${TRACK_PATH}/open?t=${trackingToken}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

export type PrepareTrackedSendParams = {
  toEmail: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  zip?: string;
  subject: string;
  sharePath: string;
  yardName?: string;
  yardCity?: string;
  yardState?: string;
  deliveryMethod: string;
  html: string;
  appUrl: string;
};

export type PrepareTrackedSendResult = {
  html: string;
  crmMessageId: string;
  trackingToken: string;
};

/**
 * Persists contact + message + link rows and returns HTML with tracking pixel
 * + wrapped links. The caller must call `rollbackCrmMessage(crmMessageId)` if
 * the actual provider send fails after this returns.
 */
export async function prepareCrmTrackedSend(
  supabase: SupabaseClient,
  params: PrepareTrackedSendParams,
): Promise<PrepareTrackedSendResult> {
  const normEmail = params.toEmail.trim().toLowerCase();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("crm_contacts")
    .select("id")
    .eq("email", normEmail)
    .maybeSingle();

  let contactId: string;
  if (existing?.id) {
    const patch: Record<string, string> = { updated_at: now };
    if (params.firstName?.trim()) patch.first_name = params.firstName.trim();
    if (params.lastName?.trim()) patch.last_name = params.lastName.trim();
    if (params.phone?.trim()) patch.phone = params.phone.trim();
    if (params.zip?.trim()) patch.zip = params.zip.trim();
    const { error: uErr } = await supabase.from("crm_contacts").update(patch).eq("id", existing.id);
    if (uErr) throw new Error(uErr.message);
    contactId = existing.id;
  } else {
    const { data: created, error: iErr } = await supabase
      .from("crm_contacts")
      .insert({
        email: normEmail,
        first_name: params.firstName?.trim() || null,
        last_name: params.lastName?.trim() || null,
        phone: params.phone?.trim() || null,
        zip: params.zip?.trim() || null,
        updated_at: now,
      })
      .select("id")
      .single();
    if (iErr || !created) throw new Error(iErr?.message || "CRM contact insert failed");
    contactId = created.id;
  }

  const trackingToken = randomUUID();

  const { data: msg, error: mErr } = await supabase
    .from("crm_messages")
    .insert({
      contact_id: contactId,
      subject: params.subject,
      share_path: params.sharePath,
      yard_name: params.yardName ?? null,
      yard_city: params.yardCity ?? null,
      yard_state: params.yardState ?? null,
      tracking_token: trackingToken,
      delivery_method: params.deliveryMethod,
      sent_at: now,
    })
    .select("id")
    .single();

  if (mErr || !msg) {
    throw new Error(mErr?.message || "CRM message insert failed");
  }

  const hrefs = collectTrackableHrefs(params.html);
  let linkIds: string[] = [];

  if (hrefs.length > 0) {
    const { data: links, error: lErr } = await supabase
      .from("crm_message_links")
      .insert(hrefs.map((target_url) => ({ message_id: msg.id, target_url })))
      .select("id");

    if (lErr || !links || links.length !== hrefs.length) {
      throw new Error(lErr?.message || "CRM link insert failed");
    }
    linkIds = links.map((l) => l.id);
  }

  let html = rewriteHrefs(params.html, params.appUrl, linkIds);
  html = injectOpenPixel(html, params.appUrl, trackingToken);

  return {
    html,
    crmMessageId: msg.id,
    trackingToken,
  };
}
