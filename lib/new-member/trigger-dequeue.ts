import { waitUntil } from "@vercel/functions";

/**
 * Fire-and-forget POST to /api/internal/new-member-dequeue so the queue is
 * processed on the same deployment (Vercel) without a local poller.
 *
 * On Vercel, und awaited `fetch` is often never sent when the handler returns;
 * `waitUntil` extends the runtime until the follow-up request is dispatched and finishes.
 */
export function scheduleDequeueFromBaseUrl(baseUrl: string): void {
  const secret = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
  if (!secret) {
    console.warn(
      "[trigger-dequeue] INTERNAL_NEW_MEMBER_SECRET is not set; cannot process queue on Vercel",
    );
    return;
  }
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/internal/new-member-dequeue`;
  const p = fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("[trigger-dequeue]", res.status, t.slice(0, 500));
      }
    })
    .catch((e) => console.error("[trigger-dequeue]", e));

  if (process.env.VERCEL) {
    waitUntil(p);
  } else {
    void p;
  }
}

export function scheduleDequeueFromEnv(): void {
  const base =
    process.env.NEW_MEMBER_DEQUEUE_BASE_URL?.trim().replace(/\/+$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}`.replace(/\/+$/, "") : null);
  if (!base) {
    console.warn(
      "[trigger-dequeue] Set NEW_MEMBER_DEQUEUE_BASE_URL or deploy on Vercel (VERCEL_URL) to chain the next job",
    );
    return;
  }
  scheduleDequeueFromBaseUrl(base);
}
