import "server-only";
import { isGmailOutboundConfigured, sendGmailHtmlEmail } from "@/lib/gmail";
import { getServiceRoleClient } from "@/lib/supabase";
import { prepareCrmTrackedSend } from "@/lib/crm/prepare-tracked-send";
import { buildEmailHtml, buildPlainText } from "@/lib/email-templates";

export type SendPickSheetEmailInput = {
  to: string;
  firstName: string;
  lastName?: string;
  sharePath: string;
  /** Display name of the yard, e.g. for subject line "Your Custom Pick Sheet for {yardNameForSubject}" */
  yardNameForSubject: string;
  yardCity: string;
  yardState: string;
  partCount: number;
  vehicleCount: number;
  customMessage?: string;
  communityName?: string;
  senderName?: string;
  crmTracking?: boolean;
  phone?: string;
  zip?: string;
};

export type SendPickSheetEmailResult =
  | { ok: true; messageId: string; crmTracked: boolean; crmMessageId?: string }
  | { ok: false; error: string; code: "gmail_not_configured" | "gmail_send_failed" };

/**
 * Send the same HTML pick-sheet email as POST /api/email-automation/send-email
 * (Gmail + optional CRM open/click tracking).
 */
export async function sendPickSheetGmail(
  input: SendPickSheetEmailInput,
): Promise<SendPickSheetEmailResult> {
  const {
    to,
    firstName,
    lastName,
    sharePath,
    yardNameForSubject,
    yardCity,
    yardState,
    partCount,
    vehicleCount,
    customMessage,
    communityName,
    senderName,
    crmTracking = true,
    phone,
    zip,
  } = input;

  const appUrl =
    process.env.SHARE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://partscout.app";
  const relPath = sharePath.startsWith("/") ? sharePath : `/${sharePath}`;
  const fullShareUrl = `${appUrl.replace(/\/$/, "")}${relPath}`;

  const community =
    communityName?.trim() || process.env.EMAIL_COMMUNITY_NAME || "the community";
  const sender = senderName?.trim() || process.env.EMAIL_SENDER_NAME || "Part Scout";

  const html = buildEmailHtml({
    firstName,
    shareUrl: relPath,
    appUrl,
    communityName: community,
    senderName: sender,
    customMessage,
  });
  const subject = `Your Custom Pick Sheet for ${yardNameForSubject}`;
  const text = buildPlainText({
    firstName,
    fullShareUrl,
    yardName: yardNameForSubject,
    yardCity,
    yardState,
    partCount,
    vehicleCount,
    communityName: community,
    senderName: sender,
    customMessage,
  });

  let sendHtml = html;
  let crmMessageId: string | undefined;
  let crmTracked = false;

  const pathNorm = (() => {
    const s = sharePath.trim();
    if (s.startsWith("/")) return s;
    if (s.startsWith("http")) {
      try {
        return new URL(s).pathname || `/${s}`;
      } catch {
        return s.startsWith("/") ? s : `/${s}`;
      }
    }
    return `/${s}`;
  })();

  if (crmTracking) {
    try {
      const supabase = getServiceRoleClient();
      const prepared = await prepareCrmTrackedSend(supabase, {
        toEmail: to,
        firstName,
        lastName,
        phone,
        zip,
        subject,
        sharePath: pathNorm,
        yardName: yardNameForSubject,
        yardCity,
        yardState,
        deliveryMethod: "gmail",
        html,
        appUrl,
      });
      sendHtml = prepared.html;
      crmMessageId = prepared.crmMessageId;
      crmTracked = true;
    } catch (crmErr) {
      console.error("[sendPickSheetGmail] CRM prep failed, sending without tracking:", crmErr);
    }
  }

  const rollbackCrm = async () => {
    if (!crmMessageId) return;
    try {
      const supabase = getServiceRoleClient();
      await supabase.from("crm_messages").delete().eq("id", crmMessageId);
    } catch (e) {
      console.error("[sendPickSheetGmail] CRM rollback failed:", e);
    }
  };

  if (!isGmailOutboundConfigured()) {
    await rollbackCrm();
    return { ok: false, error: "Gmail OAuth not configured", code: "gmail_not_configured" };
  }

  try {
    const { id } = await sendGmailHtmlEmail({
      to,
      subject,
      html: sendHtml,
      text,
      fromDisplayName: sender,
    });
    return { ok: true, messageId: id, crmTracked, crmMessageId };
  } catch (err) {
    console.error("[sendPickSheetGmail] gmail error:", err);
    await rollbackCrm();
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gmail send failed",
      code: "gmail_send_failed",
    };
  }
}
