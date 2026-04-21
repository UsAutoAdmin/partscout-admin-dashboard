#!/usr/bin/env node
/**
 * Mac Mini (or any host): poll Part Scout SMS outbox and send through the native
 * Messages / iMessage path using the OpenClaw CLI — same idea as `openclaw message send`
 * on an installed Mac, without Twilio.
 *
 * Install on the Mac Mini:
 *   npm i -g openclaw@latest
 *   openclaw onboard --install-daemon
 *   Configure the iMessage channel in OpenClaw (see OpenClaw docs).
 *
 * Env:
 *   PARTSCOUT_BASE=https://www.partscout.app
 *   SMS_OUTBOX_POLL_SECRET=<same as Vercel>   (or OPENCLAW_POLL_SECRET)
 *
 * OpenClaw send (default on macOS):
 *   OPENCLAW_BIN=openclaw
 *   OPENCLAW_CHANNEL=imessage    (required if you have multiple channels, e.g. slack + imessage)
 *
 * Optional: force Twilio on this worker instead (not native Mac):
 *   SMS_PROVIDER=twilio
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM
 *
 * Cron (every minute on the Mac Mini):
 *   * * * * * /usr/bin/env node /path/to/partscout-admin-dashboard/scripts/poll-sms-outbox.mjs >> /tmp/partscout-sms.log 2>&1
 */

import { execFileSync } from "node:child_process";

const BASE = (process.env.PARTSCOUT_BASE || "https://www.partscout.app").replace(/\/+$/, "");
const SECRET =
  process.env.SMS_OUTBOX_POLL_SECRET?.trim() || process.env.OPENCLAW_POLL_SECRET?.trim() || "";

const OPENCLAW = process.env.OPENCLAW_BIN?.trim() || "openclaw";
const OPENCLAW_CHANNEL = process.env.OPENCLAW_CHANNEL?.trim() || "imessage";

const SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const FROM = process.env.TWILIO_SMS_FROM?.trim();

let provider = (process.env.SMS_PROVIDER || "").trim().toLowerCase();
if (!provider) {
  provider = process.platform === "darwin" ? "imessage" : "twilio";
}

if (!SECRET) {
  console.error("SMS_OUTBOX_POLL_SECRET (or OPENCLAW_POLL_SECRET) is required");
  process.exit(1);
}

if (provider === "twilio") {
  if (!SID || !TOKEN || !FROM) {
    console.error("SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM");
    process.exit(1);
  }
} else if (provider === "imessage") {
  if (process.platform !== "darwin") {
    console.error("SMS_PROVIDER=imessage only works on macOS. On Linux use SMS_PROVIDER=twilio.");
    process.exit(1);
  }
} else {
  console.error("SMS_PROVIDER must be imessage or twilio");
  process.exit(1);
}

function sendOpenClawImessage(toE164, message) {
  const args = ["message", "send", "--channel", OPENCLAW_CHANNEL, "-t", toE164, "-m", message];
  execFileSync(OPENCLAW, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 120_000,
  });
}

async function sendTwilio(to, body) {
  const auth = Buffer.from(`${SID}:${TOKEN}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: FROM, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Twilio HTTP ${res.status}`);
  }
  return data.sid;
}

async function sendOne(toE164, message) {
  if (provider === "twilio") {
    await sendTwilio(toE164, message);
  } else {
    sendOpenClawImessage(toE164, message);
  }
}

async function main() {
  const res = await fetch(`${BASE}/api/internal/sms-outbox`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("GET sms-outbox failed:", res.status, data);
    process.exit(1);
  }
  const pending = data.pending || [];
  if (pending.length === 0) return;

  for (const row of pending) {
    const { id, to_e164, message } = row;
    if (!id || !to_e164 || !message) continue;

    try {
      await sendOne(to_e164, message);
      const ack = await fetch(`${BASE}/api/internal/sms-outbox`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ok: true }),
      });
      if (!ack.ok) {
        console.error("ACK ok failed:", id, await ack.text());
      } else {
        console.log("Sent + ACK", id, to_e164, provider);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Send failed:", id, msg);
      await fetch(`${BASE}/api/internal/sms-outbox`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ok: false, error: msg.slice(0, 1500) }),
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
