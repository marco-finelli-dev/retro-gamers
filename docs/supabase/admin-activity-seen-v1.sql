-- Retro-Gamers.it admin activity seen checkpoints v1.
-- Run this file manually in the Supabase SQL Editor.
--
-- Scope:
-- - stores per-admin read checkpoints for administration dashboard categories;
-- - keeps operational source tables unchanged;
-- - separates "seen by this admin" from operational states such as pending/open;
-- - does not store a row for every source event.
--
-- Browser clients must use server-side admin endpoints. Do not expose this table
-- directly to anon/authenticated clients.

create table if not exists public.admin_activity_seen (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  seen_through timestamptz not null default '1970-01-01 00:00:00+00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_activity_seen_primary_key
    primary key (admin_user_id, category),
  constraint admin_activity_seen_category_check
    check (category in ('users', 'comments', 'surveys', 'newsletter'))
);

comment on table public.admin_activity_seen is
  'Per-admin read checkpoints for the administration dashboard inbox. Server-side admin API only.';
comment on column public.admin_activity_seen.admin_user_id is
  'Authenticated admin whose read state is being tracked.';
comment on column public.admin_activity_seen.category is
  'Administration activity category covered by this checkpoint.';
comment on column public.admin_activity_seen.seen_through is
  'Events in the category with timestamp <= this value are considered seen by this admin.';

create index if not exists admin_activity_seen_admin_updated_idx
  on public.admin_activity_seen (admin_user_id, updated_at desc);

create or replace function public.set_admin_activity_seen_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_activity_seen_updated_at
  on public.admin_activity_seen;

create trigger set_admin_activity_seen_updated_at
before update on public.admin_activity_seen
for each row
execute function public.set_admin_activity_seen_updated_at();

alter table public.admin_activity_seen enable row level security;

grant usage on schema public to service_role;
grant all on table public.admin_activity_seen to service_role;

revoke all on table public.admin_activity_seen from anon, authenticated;

-- No anon/authenticated RLS policies are created in v1.
-- Browser access must go through:
-- browser -> Astro admin endpoint -> service role -> database.

notify pgrst, 'reload schema';
