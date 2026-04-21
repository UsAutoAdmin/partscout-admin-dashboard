# Part Scout — Vercel API (thin)

This repository is a **minimal Next.js** surface for **serverless routes** only: Zapier webhooks, CRM email open/click tracking, and a tiny home page.

**Full admin dashboard, email automation UI, and the local queue worker** should live in a **separate checkout** (e.g. another branch or repo) and are intentionally not in this project.

**Routes**

- `POST /api/webhooks/new-member` — auth + enqueue to `new_member_automation_queue` (see `ops/new-member-automation-queue.sql`)
- `GET /api/crm/track/open` — open pixel
- `GET /api/crm/track/click` — link redirect + click event

**Vercel env (typical):** `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEW_MEMBER_WEBHOOK_SECRET` (or `SKOOL_WEBHOOK_SECRET`).

**Full admin + queue worker (dequeue, Gmail, pick sheet) was removed from this branch.**  
Restore it with git from an earlier commit (e.g. `git show d8438ac:app/api/internal/new-member-dequeue/…`) or keep a long-lived branch (e.g. `dashboard`) that still contains the full app.

**This deploy no longer needs** `NEW_MEMBER_QUEUE_MODE` — the webhook **always** enqueues. Run the full worker in your other checkout so rows are processed.
