-- Run once in Supabase SQL editor (if not already applied).

create table if not exists public.new_member_automation_queue (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists new_member_automation_queue_pending_idx
  on public.new_member_automation_queue (created_at asc)
  where status = 'pending';
