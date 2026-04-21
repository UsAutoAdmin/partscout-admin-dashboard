import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase";
import { findNearestYardForZip, YARD_TOO_FAR_MILES } from "@/lib/new-member/yards";
import { createPickSheetForNewMember } from "@/lib/new-member/pick-sheet";
import { parseSkoolNewMemberPayload } from "@/lib/new-member/parse-zap-payload";
import { toE164 } from "@/lib/new-member/phone-e164";
import { sendTwilioSms } from "@/lib/sms/twilio-send";
import { sendPickSheetGmail } from "@/lib/new-member/send-pick-sheet-email";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function publicAppOrigin(): string {
  const raw =
    process.env.SHARE_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://www.partscout.app";
  return raw.replace(/\/+$/, "");
}

function verifySkoolSecret(request: Request): boolean {
  const secret = process.env.SKOOL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[webhooks/new-member] SKOOL_WEBHOOK_SECRET is not set");
    return false;
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const header = request.headers.get("x-webhook-secret")?.trim();
  const token = bearer ?? header;
  if (!token) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function smsBody(firstName: string, fullShareUrl: string): string {
  const t =
    process.env.SMS_BODY_TEMPLATE?.trim() ||
    process.env.OPENCLAW_SMS_TEMPLATE?.trim() ||
    "Hey {{firstName}}, your Part Scout pick sheet: {{url}}";
  return t
    .replace(/\{\{firstName\}\}/g, (firstName || "there").trim() || "there")
    .replace(/\{\{url\}\}/g, fullShareUrl);
}

function smsNotificationsEnabled(): boolean {
  return (
    process.env.SMS_OUTBOX_ENABLED !== "0" &&
    process.env.SMS_OUTBOX_ENABLED !== "false" &&
    process.env.OPENCLAW_SMS_ENABLED !== "0" &&
    process.env.OPENCLAW_SMS_ENABLED !== "false"
  );
}

/** Min matched parts to send the pick-sheet email (default 15). Set to 0 to always email when a sheet is created. */
function newMemberEmailMinParts(): number {
  const raw = process.env.NEW_MEMBER_EMAIL_MIN_PARTS?.trim();
  if (raw === undefined || raw === "") return 15;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

function newMemberCrmTracking(): boolean {
  return (
    process.env.NEW_MEMBER_CRM_TRACKING !== "0" && process.env.NEW_MEMBER_CRM_TRACKING !== "false"
  );
}

export async function POST(request: Request) {
  if (!verifySkoolSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseSkoolNewMemberPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { email, phone, firstName, lastName, zip } = parsed;
  const memberName = [firstName, lastName].filter(Boolean).join(" ").trim() || email;
  const supabase = getServiceRoleClient();

  const { data: runRow, error: insertErr } = await supabase
    .from("new_member_automation_runs")
    .insert({
      member_email: email,
      member_first_name: firstName || null,
      member_last_name: lastName || null,
      member_zip_code: zip,
      status: "processing",
    })
    .select("id")
    .single();

  if (insertErr || !runRow) {
    console.error("[webhooks/new-member] run insert", insertErr);
    return NextResponse.json(
      { error: insertErr?.message ?? "Could not create automation run (check table schema)" },
      { status: 500 },
    );
  }

  const runId = runRow.id as string;

  const fail = async (status: "failed" | "skipped", step: string, reason: string) => {
    await supabase
      .from("new_member_automation_runs")
      .update({
        status,
        failure_step: step,
        failure_reason: reason.slice(0, 2000),
      })
      .eq("id", runId);
  };

  const yardResult = await findNearestYardForZip(zip);
  if (yardResult.error || !yardResult.yard) {
    await fail("failed", "find_yard", yardResult.error ?? "No yard");
    return NextResponse.json(
      { ok: false, runId, step: "find_yard", error: yardResult.error ?? "No yard" },
      { status: 422 },
    );
  }

  if (yardResult.tooFarForDrive) {
    await supabase
      .from("new_member_automation_runs")
      .update({
        status: "skipped",
        failure_step: "yard_too_far",
        failure_reason: `Nearest yard is over ${YARD_TOO_FAR_MILES} miles`,
        nearest_yard_name: `${yardResult.yard.name} ${yardResult.yard.city}`,
        nearest_yard_distance_miles: yardResult.distanceMiles,
      })
      .eq("id", runId);
    return NextResponse.json({
      ok: false,
      runId,
      step: "yard_too_far",
      error: "Nearest yard too far for automation",
    });
  }

  const yardDisplay = `${yardResult.yard.name} ${yardResult.yard.city}`;
  const sheet = await createPickSheetForNewMember({
    yardUrl: yardResult.yard.url,
    yardName: yardDisplay,
    yardCity: yardResult.yard.city,
    memberName,
  });

  if (!sheet.ok) {
    await fail("failed", sheet.step, sheet.message);
    return NextResponse.json(
      { ok: false, runId, step: sheet.step, error: sheet.message },
      { status: sheet.step === "extract" ? 502 : 422 },
    );
  }

  const origin = publicAppOrigin();
  const fullShareUrl = `${origin}${sheet.sharePath}`;

  await supabase
    .from("new_member_automation_runs")
    .update({
      status: "success",
      failure_step: null,
      failure_reason: null,
      nearest_yard_name: yardDisplay,
      nearest_yard_distance_miles: yardResult.distanceMiles,
      vehicles_extracted: sheet.vehicleCount,
      parts_matched: sheet.matchedPartCount,
      share_url: fullShareUrl,
    })
    .eq("id", runId);

  const minPartsForEmail = newMemberEmailMinParts();
  const partCount = sheet.matchedPartCount;
  const emailBlockedByMin = partCount < minPartsForEmail;

  type EmailState =
    | { emailSent: true; gmailMessageId: string; crmTracked: boolean }
    | { emailSent: false; emailSkippedReason: string; gmailMessageId: null; crmTracked: false };

  let emailState: EmailState;
  if (emailBlockedByMin) {
    emailState = {
      emailSent: false,
      emailSkippedReason: `min_parts_not_met (need >= ${minPartsForEmail} matched, got ${partCount})`,
      gmailMessageId: null,
      crmTracked: false,
    };
  } else {
    const sendResult = await sendPickSheetGmail({
      to: email,
      firstName: firstName || "there",
      lastName: lastName || undefined,
      sharePath: sheet.sharePath,
      yardNameForSubject: yardDisplay,
      yardCity: yardResult.yard.city,
      yardState: yardResult.yard.state,
      partCount,
      vehicleCount: sheet.vehicleCount,
      customMessage: process.env.EMAIL_PICKSHEET_CUSTOM_MESSAGE?.trim() || undefined,
      crmTracking: newMemberCrmTracking(),
      phone: phone ?? undefined,
      zip: zip,
    });
    if (sendResult.ok) {
      const now = new Date().toISOString();
      await supabase
        .from("new_member_automation_runs")
        .update({ email_sent_at: now })
        .eq("id", runId);
      emailState = {
        emailSent: true,
        gmailMessageId: sendResult.messageId,
        crmTracked: sendResult.crmTracked,
      };
    } else {
      emailState = {
        emailSent: false,
        emailSkippedReason: `${sendResult.code}: ${sendResult.error}`,
        gmailMessageId: null,
        crmTracked: false,
      };
    }
  }

  const e164 = phone ? toE164(phone) : null;
  let smsQueued = false;
  let smsSentViaTwilio = false;
  const smsOk = smsNotificationsEnabled();

  if (e164 && smsOk) {
    const message = smsBody(firstName, fullShareUrl);
    const twilioFromVercel =
      process.env.SMS_SEND_FROM_VERCEL_TWILIO === "1" ||
      process.env.SMS_SEND_FROM_VERCEL_TWILIO === "true";

    if (twilioFromVercel) {
      const twilio = await sendTwilioSms({ toE164: e164, body: message });
      if (twilio.ok) {
        smsSentViaTwilio = true;
        const now = new Date().toISOString();
        const { error: auditErr } = await supabase.from("openclaw_sms_outbox").insert({
          to_e164: e164,
          message,
          share_url: fullShareUrl,
          automation_run_id: runId,
          sent_at: now,
        });
        if (auditErr) {
          console.error("[webhooks/new-member] sms audit row:", auditErr.message);
        }
      } else {
        console.warn("[webhooks/new-member] Twilio failed, queueing for Mac:", twilio.error);
        const { error: qErr } = await supabase.from("openclaw_sms_outbox").insert({
          to_e164: e164,
          message,
          share_url: fullShareUrl,
          automation_run_id: runId,
        });
        if (!qErr) smsQueued = true;
        else console.error("[webhooks/new-member] sms outbox insert:", qErr.message);
      }
    } else {
      const { error: qErr } = await supabase.from("openclaw_sms_outbox").insert({
        to_e164: e164,
        message,
        share_url: fullShareUrl,
        automation_run_id: runId,
      });
      if (qErr) {
        console.error("[webhooks/new-member] sms outbox insert:", qErr.message);
      } else {
        smsQueued = true;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    runId,
    shareUrl: fullShareUrl,
    pickSheetId: sheet.pickSheetId,
    vehicles: sheet.vehicleCount,
    parts: sheet.matchedPartCount,
    minPartsForEmail: minPartsForEmail,
    ...emailState,
    smsQueued: smsQueued || smsSentViaTwilio,
    smsSentVia: smsSentViaTwilio ? "twilio_vercel" : smsQueued ? "mac_mini_queue" : null,
    smsSkippedReason: !phone
      ? "no_phone_in_payload"
      : !e164
        ? "phone_not_e164"
        : !smsOk
          ? "sms_disabled"
          : !smsSentViaTwilio && !smsQueued
            ? "sms_queue_failed"
            : null,
  });
}
