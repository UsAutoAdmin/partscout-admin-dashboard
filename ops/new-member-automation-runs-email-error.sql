-- Run in Supabase SQL editor if email_error column is missing.
alter table public.new_member_automation_runs
  add column if not exists email_error text;

comment on column public.new_member_automation_runs.email_error is
  'When email was not sent: min_parts, missing GOOGLE_* env, or Gmail API error string';
