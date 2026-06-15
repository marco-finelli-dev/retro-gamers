-- Retro-Gamers.it public comment reports v1.
-- Run this file manually in the Supabase SQL Editor.
-- It creates reports for approved public comments and replies.

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid null references auth.users(id) on delete set null,
  reason text null,
  status text not null default 'open' check (status in ('open', 'resolved', 'archived')),
  resolved_by uuid null references auth.users(id) on delete set null,
  resolved_at timestamptz null,
  admin_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comment_reports_unique_comment_reporter unique (comment_id, reporter_id)
);

create index if not exists comment_reports_comment_id_idx
  on public.comment_reports (comment_id);

create index if not exists comment_reports_reporter_id_idx
  on public.comment_reports (reporter_id);

create index if not exists comment_reports_reported_user_id_idx
  on public.comment_reports (reported_user_id);

create index if not exists comment_reports_status_idx
  on public.comment_reports (status);

create index if not exists comment_reports_created_at_idx
  on public.comment_reports (created_at desc);

create or replace function public.set_comment_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_comment_reports_updated_at on public.comment_reports;

create trigger set_comment_reports_updated_at
before update on public.comment_reports
for each row
execute function public.set_comment_reports_updated_at();

alter table public.comment_reports enable row level security;

grant usage on schema public to authenticated, service_role;
grant all on public.comment_reports to service_role;

-- The frontend uses server-side API routes with the Supabase service role for
-- creating and moderating comment reports. No direct browser policy is required
-- for authenticated users in v1.
revoke all on public.comment_reports from anon, authenticated;

-- Force PostgREST to refresh its schema cache after creating the table.
notify pgrst, 'reload schema';
