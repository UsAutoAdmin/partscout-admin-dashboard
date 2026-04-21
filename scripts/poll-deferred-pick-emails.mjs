#!/usr/bin/env node
/**
 * After Vercel creates the pick sheet, email is skipped there; run this on your Mac with
 * `next dev` (or `next start`) and `.env` containing GOOGLE_*, plus Supabase + INTERNAL_NEW_MEMBER_SECRET.
 *
 *   node --env-file=.env.local scripts/poll-deferred-pick-emails.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const secret = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
const base = (process.env.POLL_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const interval = Math.max(5000, parseInt(process.env.PICK_EMAIL_INTERVAL_MS || "20000", 10) || 20000);

if (!url || !key || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_NEW_MEMBER_SECRET");
  process.exit(1);
}

const supabase = createClient(url, key);

async function processOne() {
  const { data: rows, error } = await supabase
    .from("new_member_automation_runs")
    .select("id")
    .eq("pick_email_deferred", true)
    .is("email_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    console.error("query", error.message);
    return;
  }
  const id = rows?.[0]?.id;
  if (!id) return;

  const res = await fetch(`${base}/api/internal/pick-sheet-email-from-run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ runId: id }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    console.error(res.status, text.slice(0, 300));
    return;
  }
  console.log(new Date().toISOString(), res.status, j?.ok, j?.error || j?.messageId || j?.alreadySent);
}

async function main() {
  console.log(
    `Polling for pick_email_deferred (POST ${base}/api/internal/pick-sheet-email-from-run) every ${interval}ms`,
  );
  for (;;) {
    try {
      await processOne();
    } catch (e) {
      console.error(e);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

main();
