-- Optional: if migrations were not applied yet
alter table public.new_member_automation_runs
  add column if not exists automation_yard_city text,
  add column if not exists automation_yard_state text,
  add column if not exists pick_email_deferred boolean not null default false,
  add column if not exists automation_estimated_worth numeric;
