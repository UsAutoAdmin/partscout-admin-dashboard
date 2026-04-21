#!/usr/bin/env node
// Probe: list every Sent email matching pick-sheet patterns and show
// the unique subject prefixes, date range, and total count. No DB writes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(".env.local");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

const accessToken = await getAccessToken();

const queries = [
  'from:me subject:"pick sheet"',
  'from:me subject:"custom pick sheet"',
];

for (const q of queries) {
  console.log(`\n=== query: ${q} ===`);
  let pageToken = undefined;
  let count = 0;
  const subjects = new Map();
  const recipients = new Set();
  let oldest = null;
  let newest = null;
  do {
    const url = new URL(`${GMAIL}/messages`);
    url.searchParams.set("q", q);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await r.json();
    if (data.error) { console.error(data.error); break; }
    const msgs = data.messages ?? [];
    count += msgs.length;
    pageToken = data.nextPageToken;
    // sample first 30 of first page for header detail
    if (subjects.size < 5 && msgs.length > 0) {
      const sample = msgs.slice(0, 30);
      const heads = await Promise.all(
        sample.map((m) =>
          fetch(`${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json())
        )
      );
      for (const msg of heads) {
        const headers = msg.payload?.headers ?? [];
        const get = (n) => headers.find((h) => h.name === n)?.value ?? "";
        const subj = get("Subject");
        const to = get("To");
        const date = get("Date");
        const prefix = subj.replace(/\s+for\s+.*/i, "").slice(0, 60);
        subjects.set(prefix, (subjects.get(prefix) ?? 0) + 1);
        const emailMatch = to.match(/<([^>]+)>/);
        recipients.add((emailMatch ? emailMatch[1] : to).trim().toLowerCase());
        const ts = Date.parse(date);
        if (!Number.isNaN(ts)) {
          if (!oldest || ts < oldest) oldest = ts;
          if (!newest || ts > newest) newest = ts;
        }
      }
    }
  } while (pageToken && count < 5000);
  console.log(`  total matched: ${count}`);
  console.log(`  sample distinct subject prefixes (from first page):`);
  for (const [s, n] of subjects) console.log(`    ${n}x  ${s}`);
  console.log(`  sample distinct recipients seen: ${recipients.size}`);
  if (oldest && newest) {
    console.log(`  sample date range: ${new Date(oldest).toISOString()} -> ${new Date(newest).toISOString()}`);
  }
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
