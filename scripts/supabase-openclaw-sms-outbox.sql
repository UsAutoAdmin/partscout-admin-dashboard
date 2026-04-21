-- Run in Supabase SQL editor (once). SMS outbox for new-member webhook (Twilio or poller).
-- API: /api/internal/sms-outbox (legacy: /api/internal/openclaw/sms-pending)

create table if not exists public.openclaw_sms_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  to_e164 text not null,
  message text not null,
  share_url text,
  automation_run_id uuid,
  attempts int not null default 0,
  last_error text
);

create index if not exists openclaw_sms_outbox_pending_idx
  on public.openclaw_sms_outbox (created_at asc)
  where sent_at is null;

comment on table public.openclaw_sms_outbox is 'Pending SMS sends: Twilio from webhook or scripts/poll-sms-outbox.mjs';
