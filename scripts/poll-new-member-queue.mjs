#!/usr/bin/env node
/**
 * Run on your Mac with full .env (Gmail, Railway, etc.) while `next dev` (or `next start`) is up.
 * Env:
 *   INTERNAL_NEW_MEMBER_SECRET  — same as in .env for POST /api/internal/new-member-dequeue
 *   POLL_BASE_URL               — default http://127.0.0.1:3000
 *   POLL_INTERVAL_MS            — default 15000
 *
 *   npm run dev   # in another terminal
 *   node scripts/poll-new-member-queue.mjs
 */
const BASE = (process.env.POLL_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const SECRET = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
const INTERVAL = Math.max(3000, parseInt(process.env.POLL_INTERVAL_MS || "15000", 10) || 15000);

if (!SECRET) {
  console.error("Set INTERNAL_NEW_MEMBER_SECRET in the environment.");
  process.exit(1);
}

async function tick() {
  const res = await fetch(`${BASE}/api/internal/new-member-dequeue`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Bad JSON:", text.slice(0, 200));
    return;
  }
  if (data?.processed) {
    console.log(new Date().toISOString(), data.ok ? "ok" : "outcome", data.queueId || "", JSON.stringify(data.result || {}).slice(0, 200));
  }
}

async function main() {
  console.log(`Polling ${BASE}/api/internal/new-member-dequeue every ${INTERVAL}ms`);
  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error("tick error", e);
    }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main();
