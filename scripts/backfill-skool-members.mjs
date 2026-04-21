#!/usr/bin/env node
// Backfill historical Skool community members into crm_contacts.
//
// Source: CSV exported from Skool ("community_members.csv").
// Strategy:
//   - parse CSV (RFC4180-ish: handles quoted fields with embedded commas)
//   - skip rows with no email
//   - lowercase + trim email for dedupe
//   - SELECT existing emails from crm_contacts; only INSERT new rows so we
//     never clobber data the live Zapier webhook has already written
//   - chunked inserts (200 per request) for safety
//
// Usage:
//   node scripts/backfill-skool-members.mjs path/to/community_members.csv [--dry]
//
// Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local auto-loaded).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch } from "undici";

// --- env ---------------------------------------------------------------
loadDotEnv(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OVERRIDE_IP = process.env.SUPABASE_OVERRIDE_IP;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// --- args --------------------------------------------------------------
const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--")) ?? "";
const dryRun = args.includes("--dry");
if (!csvPath) {
  console.error("Usage: node scripts/backfill-skool-members.mjs <csv> [--dry]");
  process.exit(1);
}
const absCsvPath = path.resolve(csvPath);
if (!fs.existsSync(absCsvPath)) {
  console.error(`CSV not found: ${absCsvPath}`);
  process.exit(1);
}

// --- parse -------------------------------------------------------------
const rawCsv = fs.readFileSync(absCsvPath, "utf-8");
const records = parseCsv(rawCsv);
const header = records.shift();
if (!header) {
  console.error("CSV is empty");
  process.exit(1);
}
const colIdx = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());

const idxFirst = colIdx("FirstName");
const idxLast = colIdx("LastName");
const idxEmail = colIdx("Email");
const idxJoined = colIdx("JoinedDate");
// Skool form is variable: scan Question1/2/3 for the one containing "zip".
const questionIdx = [colIdx("Question1"), colIdx("Question2"), colIdx("Question3")];
const answerIdx = [colIdx("Answer1"), colIdx("Answer2"), colIdx("Answer3")];

if ([idxFirst, idxLast, idxEmail, idxJoined].some((i) => i < 0)) {
  console.error("CSV missing required columns FirstName/LastName/Email/JoinedDate");
  process.exit(1);
}

const cleaned = [];
const seen = new Set();
let skippedNoEmail = 0;
let skippedDupInCsv = 0;
for (const row of records) {
  const email = (row[idxEmail] ?? "").trim().toLowerCase();
  if (!email) { skippedNoEmail += 1; continue; }
  if (seen.has(email)) { skippedDupInCsv += 1; continue; }
  seen.add(email);

  const first_name = nullIfBlank(row[idxFirst]);
  const last_name = nullIfBlank(row[idxLast]);
  const joinedRaw = (row[idxJoined] ?? "").trim();
  const joined_at = parseSkoolDate(joinedRaw);

  let zip = null;
  for (let i = 0; i < questionIdx.length; i++) {
    const q = (row[questionIdx[i]] ?? "").toLowerCase();
    if (q.includes("zip")) {
      const ans = (row[answerIdx[i]] ?? "").trim();
      if (ans) { zip = ans.replace(/[^0-9-]/g, "").slice(0, 10) || null; }
      break;
    }
  }

  cleaned.push({
    email,
    first_name,
    last_name,
    zip,
    created_at: joined_at,
    last_activity_at: joined_at,
  });
}

console.log(`csv rows parsed=${records.length}  with email=${cleaned.length}  skipped(no_email)=${skippedNoEmail}  skipped(dup_in_csv)=${skippedDupInCsv}`);

// --- dedupe vs DB ------------------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: OVERRIDE_IP ? { fetch: buildOverrideFetch(new URL(SUPABASE_URL).hostname, OVERRIDE_IP) } : undefined,
});
if (OVERRIDE_IP) console.log(`[supabase] pinning ${new URL(SUPABASE_URL).hostname} -> ${OVERRIDE_IP}`);

const existingEmails = await fetchAllExistingEmails(supabase);
console.log(`existing crm_contacts emails in DB: ${existingEmails.size}`);

const toInsert = cleaned.filter((r) => !existingEmails.has(r.email));
console.log(`new rows to insert: ${toInsert.length}`);
console.log(`overlap (kept as-is): ${cleaned.length - toInsert.length}`);

if (toInsert.length === 0) {
  console.log("Nothing to backfill. Done.");
  process.exit(0);
}

if (dryRun) {
  console.log("--dry: not inserting. First 5 rows would be:");
  for (const r of toInsert.slice(0, 5)) console.log("  ", r);
  process.exit(0);
}

// --- chunked insert ----------------------------------------------------
const CHUNK = 200;
let inserted = 0;
for (let i = 0; i < toInsert.length; i += CHUNK) {
  const batch = toInsert.slice(i, i + CHUNK);
  const { error, count } = await supabase
    .from("crm_contacts")
    .insert(batch, { count: "exact" });
  if (error) {
    console.error(`batch ${i / CHUNK + 1} failed:`, error.message);
    process.exit(1);
  }
  inserted += count ?? batch.length;
  console.log(`  inserted batch ${i / CHUNK + 1} (${batch.length} rows, running total ${inserted})`);
}

console.log(`\nDone. Inserted ${inserted} historical Skool members.`);
console.log(`Total crm_contacts now: ${existingEmails.size + inserted}`);

// =======================================================================
// helpers
// =======================================================================

function nullIfBlank(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function parseSkoolDate(raw) {
  // CSV format: "2026-04-19 15:20:08" - assume Skool exports in UTC.
  if (!raw) return null;
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchAllExistingEmails(client) {
  const set = new Set();
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("crm_contacts")
      .select("email")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetchExistingEmails: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.email) set.add(row.email.trim().toLowerCase());
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return set;
}

// Tiny RFC4180-ish CSV parser (handles "" inside quotes and embedded commas/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field); field = "";
      } else if (c === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
      } else if (c === "\r") {
        // skip CR; will be paired with LF
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field); rows.push(row);
  }
  return rows;
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
    const url = typeof input === "string" || input instanceof URL ? new URL(input) : new URL(input.url);
    if (url.hostname === host) return undiciFetch(url, { ...(init ?? {}), dispatcher: agent });
    return undiciFetch(url, init);
  };
}

function loadDotEnv(file) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", file);
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
