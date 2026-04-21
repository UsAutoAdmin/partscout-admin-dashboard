import "server-only";

/** Only used when `SMS_SEND_FROM_VERCEL_TWILIO=true` on the new-member webhook. Default delivery is Mac Mini via outbox + OpenClaw iMessage. */

export async function sendTwilioSms(params: {
  toE164: string;
  body: string;
}): Promise<{ ok: true; sid: string } | { ok: false; error: string; status?: number }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim();

  if (!sid || !token || !from) {
    return { ok: false, error: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_SMS_FROM" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const form = new URLSearchParams({
    To: params.toE164,
    From: from,
    Body: params.body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const data = (await res.json()) as { sid?: string; message?: string; code?: number };

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data.message ?? `Twilio HTTP ${res.status}`,
    };
  }

  if (!data.sid) {
    return { ok: false, error: "Twilio returned no sid" };
  }

  return { ok: true, sid: data.sid };
}
