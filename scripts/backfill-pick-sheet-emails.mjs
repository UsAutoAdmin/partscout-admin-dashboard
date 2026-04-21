#!/usr/bin/env node
// Backfill crm_messages from Gmail Sent.
//
// Idempotent: dedupes by crm_messages.gmail_message_id. Safe to re-run.
// For each pick-sheet email we find in Gmail Sent we:
//   1. Look up (or create a stub) crm_contacts row for the recipient.
//   2. Try to extract share_path + tracking_token + yard_name from the body.
//   3. Insert a crm_messages row with gmail_message_id as the natural key.
//
// Usage:
//   node scripts/backfill-pick-sheet-emails.mjs           # backfill everything
//   node scripts/backfill-pick-sheet-emails.mjs --dry     # parse only, no writes
//   node scripts/backfill-pick-sheet-emails.mjs --limit 50

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch } from "undici";

loadDotEnv(".env.local");

const args = parseArgs(process.argv.slice(2));
const DRY_RUN = !!args.dry;
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const QUERY = args.query ?? 'from:me subject:"pick sheet"';
const BATCH = 10;
const BATCH_DELAY_MS = 250;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OVERRIDE_IP = process.env.SUPABASE_OVERRIDE_IP;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: OVERRIDE_IP ? { fetch: buildOverrideFetch(new URL(SUPABASE_URL).hostname, OVERRIDE_IP) } : undefined,
});
if (OVERRIDE_IP) console.log(`[supabase] pinning ${new URL(SUPABASE_URL).hostname} -> ${OVERRIDE_IP}`);

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

const accessToken = await getAccessToken();
console.log("[gmail] authenticated");

console.log(`[gmail] listing sent messages: ${QUERY}`);
const ids = await listAllMessageIds(QUERY, LIMIT);
console.log(`[gmail] ${ids.length} message ids matched`);

const existing = await loadExistingGmailIds(ids);
console.log(`[supabase] ${existing.size} of those already in crm_messages`);

const todo = ids.filter((id) => !existing.has(id));
console.log(`[plan] ${todo.length} messages to backfill (dry=${DRY_RUN})`);

const contactCache = await loadContactCache();
console.log(`[supabase] cached ${contactCache.size} existing crm_contacts by email`);

let inserted = 0;
let stubsCreated = 0;
let extractedToken = 0;
let extractedShare = 0;
let extractedYard = 0;
let skippedNoRecipient = 0;
let skippedNotMine = 0;
let patchedExisting = 0;
let skippedDuplicateToken = 0;

for (let i = 0; i < todo.length; i += BATCH) {
  const slice = todo.slice(i, i + BATCH);
  const fulls = await Promise.all(
    slice.map((id) =>
      gmailGet(`${GMAIL}/messages/${id}?format=full`).catch((err) => {
        console.warn(`[gmail] fetch ${id} failed: ${err.message}`);
        return null;
      })
    )
  );

  // First pass: parse and collect candidate tracking tokens so we can
  // detect rows already inserted by the local sender (which set tracking_token
  // but not gmail_message_id).
  const parsedBatch = [];
  for (const msg of fulls) {
    if (!msg) continue;
    const parsed = parseMessage(msg);
    if (!parsed) {
      skippedNoRecipient++;
      continue;
    }
    if (!isOurAddress(parsed.fromEmail)) {
      skippedNotMine++;
      continue;
    }
    parsedBatch.push({ msg, parsed });
  }

  const tokens = parsedBatch.map((p) => p.parsed.shareToken).filter(Boolean);
  const existingByToken = await loadExistingByTokens(tokens);

  const rows = [];
  for (const { msg, parsed } of parsedBatch) {
    const existingRow = parsed.shareToken ? existingByToken.get(parsed.shareToken) : null;
    if (existingRow) {
      if (!existingRow.gmail_message_id && !DRY_RUN) {
        const { error } = await supabase
          .from("crm_messages")
          .update({ gmail_message_id: msg.id })
          .eq("id", existingRow.id);
        if (error) {
          console.warn(`[patch] failed for ${existingRow.id}: ${error.message}`);
        } else {
          patchedExisting++;
        }
      }
      skippedDuplicateToken++;
      continue;
    }

    const contactId = await resolveContact(parsed, contactCache);
    if (!contactId) {
      skippedNoRecipient++;
      continue;
    }

    if (parsed.shareToken) extractedToken++;
    if (parsed.sharePath) extractedShare++;
    if (parsed.yardName) extractedYard++;

    rows.push({
      contact_id: contactId,
      subject: parsed.subject,
      share_path: parsed.sharePath,
      yard_name: parsed.yardName,
      yard_city: null,
      yard_state: null,
      tracking_token: parsed.shareToken ?? randomUUID(),
      delivery_method: "gmail",
      sent_at: parsed.sentAt,
      gmail_message_id: msg.id,
    });
  }

  if (rows.length === 0) continue;

  if (DRY_RUN) {
    inserted += rows.length;
    console.log(`[dry] would insert ${rows.length} (running total ${inserted}/${todo.length})`);
    continue;
  }

  const { error } = await supabase.from("crm_messages").insert(rows);
  if (error) {
    console.error(`[supabase] insert batch failed: ${error.message}`);
    continue;
  }
  inserted += rows.length;

  // bump last_activity_at on the contacts touched
  const byContact = new Map();
  for (const r of rows) {
    const prev = byContact.get(r.contact_id);
    if (!prev || prev < r.sent_at) byContact.set(r.contact_id, r.sent_at);
  }
  for (const [cid, ts] of byContact) {
    await supabase
      .from("crm_contacts")
      .update({ last_activity_at: ts })
      .eq("id", cid)
      .lt("last_activity_at", ts);
  }

  console.log(`[ok] inserted ${rows.length} (running total ${inserted}/${todo.length})`);
  if (BATCH_DELAY_MS > 0) await sleep(BATCH_DELAY_MS);
}

console.log("");
console.log("=== summary ===");
console.log(`gmail messages matched      : ${ids.length}`);
console.log(`already in crm_messages     : ${existing.size}`);
console.log(`backfilled this run         : ${inserted}${DRY_RUN ? " (dry)" : ""}`);
console.log(`new contact stubs created   : ${stubsCreated}`);
console.log(`extracted tracking_token    : ${extractedToken}`);
console.log(`extracted share_path        : ${extractedShare}`);
console.log(`extracted yard_name         : ${extractedYard}`);
console.log(`skipped (already in DB)     : ${skippedDuplicateToken}`);
console.log(`patched gmail_message_id    : ${patchedExisting}`);
console.log(`skipped (no recipient/email): ${skippedNoRecipient}`);
console.log(`skipped (not from our addr) : ${skippedNotMine}`);

// ---------- helpers ----------

function isOurAddress(email) {
  if (!email) return true;
  const me = (process.env.GOOGLE_EMAIL_ADDRESS ?? "").toLowerCase();
  if (!me) return true;
  return email.toLowerCase() === me;
}

function parseMessage(msg) {
  const headers = msg.payload?.headers ?? [];
  const get = (n) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
  const to = get("To");
  const subject = get("Subject") || "(no subject)";
  const dateRaw = get("Date");
  const fromRaw = get("From");

  const recipient = parseFirstEmail(to);
  if (!recipient) return null;

  const sentMs = Date.parse(dateRaw);
  if (Number.isNaN(sentMs)) return null;

  const body = extractBody(msg.payload);
  const tokenMatch = body.match(
    /\/(?:api\/cm\/(?:open|click)|pick-sheet\/shared)\/([0-9a-f-]{36})/i
  );
  const shareMatch = body.match(/\/pick-sheet\/shared\/([0-9a-f-]{36})/i);
  const yardMatch = subject.match(/Pick Sheet for\s+(.+)$/i);

  return {
    fromEmail: parseFirstEmail(fromRaw),
    recipientEmail: recipient.toLowerCase(),
    subject,
    sentAt: new Date(sentMs).toISOString(),
    sharePath: shareMatch ? `/pick-sheet/shared/${shareMatch[1]}` : null,
    shareToken: tokenMatch ? tokenMatch[1] : null,
    yardName: yardMatch ? yardMatch[1].trim() : null,
  };
}

function parseFirstEmail(raw) {
  if (!raw) return null;
  const first = raw.split(",")[0].trim();
  const m = first.match(/<([^>]+)>/);
  const email = (m ? m[1] : first).trim();
  return /@/.test(email) ? email : null;
}

function extractBody(part) {
  if (!part) return "";
  let out = "";
  const stack = [part];
  while (stack.length) {
    const p = stack.pop();
    if (!p) continue;
    if (p.parts?.length) {
      for (const c of p.parts) stack.push(c);
      continue;
    }
    const data = p.body?.data;
    if (!data) continue;
    try {
      const buf = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      out += "\n" + buf.toString("utf-8");
    } catch {
      // ignore
    }
  }
  return out;
}

async function resolveContact(parsed, cache) {
  const email = parsed.recipientEmail;
  const cached = cache.get(email);
  if (cached) return cached;

  if (DRY_RUN) {
    const fakeId = `dry-${email}`;
    cache.set(email, fakeId);
    stubsCreated++;
    return fakeId;
  }

  const stubId = randomUUID();
  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      id: stubId,
      email,
      first_name: null,
      last_name: null,
      phone: null,
      zip: null,
      last_activity_at: parsed.sentAt,
    })
    .select("id")
    .single();

  if (data?.id) {
    cache.set(email, data.id);
    stubsCreated++;
    return data.id;
  }

  // probably duplicate from a race; refetch
  const { data: existing } = await supabase
    .from("crm_contacts")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    cache.set(email, existing.id);
    return existing.id;
  }

  console.warn(`[contact] could not resolve ${email}: ${error?.message ?? "unknown"}`);
  return null;
}

async function loadContactCache() {
  const out = new Map();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("crm_contacts")
      .select("id,email")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) if (row.email) out.set(row.email.toLowerCase(), row.id);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function loadExistingGmailIds(allIds) {
  const out = new Set();
  if (allIds.length === 0) return out;
  // page in chunks to keep the URL short
  const CHUNK = 200;
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const slice = allIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("crm_messages")
      .select("gmail_message_id")
      .in("gmail_message_id", slice);
    if (error) throw new Error(`load existing: ${error.message}`);
    for (const r of data ?? []) if (r.gmail_message_id) out.add(r.gmail_message_id);
  }
  return out;
}

async function loadExistingByTokens(tokens) {
  const out = new Map();
  if (!tokens.length) return out;
  const CHUNK = 200;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("crm_messages")
      .select("id,tracking_token,gmail_message_id")
      .in("tracking_token", slice);
    if (error) throw new Error(`load by tokens: ${error.message}`);
    for (const r of data ?? []) if (r.tracking_token) out.set(r.tracking_token, r);
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function listAllMessageIds(q, max) {
  const ids = [];
  let pageToken = undefined;
  do {
    const url = new URL(`${GMAIL}/messages`);
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gmailGet(url.toString());
    for (const m of data.messages ?? []) {
      ids.push(m.id);
      if (ids.length >= max) return ids;
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function gmailGet(url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`gmail ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`gmail token error: ${data.error_description}`);
  return data.access_token;
}

function buildOverrideFetch(host, ip) {
  const agent = new Agent({
    connect: {
      lookup: (_hostname, options, cb) => {
        const family = ip.includes(":") ? 6 : 4;
        const result = { address: ip, family };
        if (options?.all) cb(null, [result]);
        else cb(null, result.address, result.family);
      },
    },
  });
  return async (input, init) => {
    const url =
      typeof input === "string" || input instanceof URL ? new URL(input) : new URL(input.url);
    if (url.hostname === host) return undiciFetch(url, { ...(init ?? {}), dispatcher: agent });
    return undiciFetch(url, init);
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry" || a === "--dry-run") out.dry = true;
    else if (a === "--limit") out.limit = argv[++i];
    else if (a === "--query") out.query = argv[++i];
  }
  return out;
}

function loadDotEnv(file) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", file);
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
