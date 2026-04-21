import "server-only";
import { getServiceRoleClient } from "@/lib/supabase";
import { sendPickSheetGmail } from "@/lib/new-member/send-pick-sheet-email";

function newMemberCrmTracking(): boolean {
  return (
    process.env.NEW_MEMBER_CRM_TRACKING !== "0" && process.env.NEW_MEMBER_CRM_TRACKING !== "false"
  );
}

export type PickEmailForRunResult =
  | { ok: true; messageId: string; crmTracked: boolean }
  | { ok: false; error: string; code: "not_found" | "bad_state" | "send_failed" | "already_sent" };

/**
 * Load a successful automation run and send the pick sheet email (Gmail on the machine
 * that has GOOGLE_* in env — intended for `next dev` on your Mac, not Vercel).
 */
export async function sendPickSheetGmailForRunId(runId: string): Promise<PickEmailForRunResult> {
  const supabase = getServiceRoleClient();
  const { data: run, error } = await supabase
    .from("new_member_automation_runs")
    .select(
      "id, status, share_url, email_sent_at, member_email, member_first_name, member_last_name, member_zip_code, nearest_yard_name, parts_matched, vehicles_extracted, automation_yard_city, automation_yard_state",
    )
    .eq("id", runId)
    .maybeSingle();

  if (error || !run) {
    return { ok: false, error: error?.message ?? "not found", code: "not_found" };
  }
  if (run.email_sent_at) {
    return { ok: false, error: "Email already sent for this run", code: "already_sent" };
  }
  if (run.status !== "success" || !run.share_url || !run.member_email) {
    return { ok: false, error: "Run is not ready for email (need success, share_url, member_email)", code: "bad_state" };
  }
  if (run.nearest_yard_name == null || run.parts_matched == null || run.vehicles_extracted == null) {
    return { ok: false, error: "Run row missing yard or counts", code: "bad_state" };
  }

  let sharePath: string;
  try {
    sharePath = new URL(run.share_url as string).pathname;
  } catch {
    return { ok: false, error: "Invalid share_url on run", code: "bad_state" };
  }
  if (!sharePath.startsWith("/")) {
    return { ok: false, error: "share path must be absolute", code: "bad_state" };
  }

  const yardDisplay = String(run.nearest_yard_name);
  const city = (run.automation_yard_city as string | null) ?? "";
  const state = (run.automation_yard_state as string | null) ?? "";

  const send = await sendPickSheetGmail({
    to: run.member_email as string,
    firstName: (run.member_first_name as string | null) || "there",
    lastName: (run.member_last_name as string | null) || undefined,
    sharePath,
    yardNameForSubject: yardDisplay,
    yardCity: city,
    yardState: state,
    partCount: run.parts_matched as number,
    vehicleCount: run.vehicles_extracted as number,
    customMessage: process.env.EMAIL_PICKSHEET_CUSTOM_MESSAGE?.trim() || undefined,
    crmTracking: newMemberCrmTracking(),
    phone: undefined,
    zip: (run.member_zip_code as string | null) || undefined,
    includeAdminBcc: true,
  });

  if (!send.ok) {
    return {
      ok: false,
      error: `${send.code}: ${send.error}`,
      code: "send_failed",
    };
  }

  const now = new Date().toISOString();
  await supabase
    .from("new_member_automation_runs")
    .update({
      email_sent_at: now,
      email_error: null,
      pick_email_deferred: false,
    })
    .eq("id", runId);

  return { ok: true, messageId: send.messageId, crmTracked: send.crmTracked };
}
