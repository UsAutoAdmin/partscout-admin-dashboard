-- Instagram Scheduler tables
-- Run this migration in Supabase SQL Editor

create table if not exists instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text not null unique,
  ig_username text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  ig_account_id uuid not null references instagram_accounts(id) on delete cascade,
  video_storage_path text not null,
  video_public_url text not null,
  caption text not null default '',
  post_type text not null default 'reel' check (post_type in ('reel', 'trial_reel')),
  graduation_strategy text default 'MANUAL' check (graduation_strategy in ('MANUAL', 'SS_PERFORMANCE')),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'publishing', 'published', 'failed')),
  ig_media_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_posts_due
  on scheduled_posts (scheduled_at)
  where status = 'scheduled';

create index if not exists idx_scheduled_posts_account
  on scheduled_posts (ig_account_id);

-- Enable RLS but allow service role full access
alter table instagram_accounts enable row level security;
alter table scheduled_posts enable row level security;

-- Supabase Storage bucket (create via dashboard or API)
-- insert into storage.buckets (id, name, public) values ('scheduled-videos', 'scheduled-videos', true);
