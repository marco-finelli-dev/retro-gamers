-- Retro-Gamers.it reader badge assignments
-- Run this file manually in the Supabase SQL Editor.
-- It keeps public.user_badges as the badge catalog and adds per-user ownership.

create table if not exists public.user_badge_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null references public.user_badges(key) on delete cascade,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index if not exists user_badge_assignments_user_idx
  on public.user_badge_assignments (user_id, created_at desc);

create index if not exists user_badge_assignments_badge_idx
  on public.user_badge_assignments (badge_key);

-- Backfill the current selected badge for existing profiles.
insert into public.user_badge_assignments (user_id, badge_key)
select profiles.user_id, profiles.badge_key
from public.profiles
where profiles.badge_key is not null
on conflict (user_id, badge_key) do nothing;

alter table public.user_badge_assignments enable row level security;

grant usage on schema public to authenticated, service_role;
grant all on public.user_badge_assignments to service_role;

drop policy if exists "Users can read own badge assignments" on public.user_badge_assignments;
create policy "Users can read own badge assignments"
  on public.user_badge_assignments
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_badge_assignments from anon, authenticated;
grant select on public.user_badge_assignments to authenticated;

-- Inserts, deletes and admin management are performed server-side with the Supabase service role.
-- No public insert/update/delete policy is required.

-- Force PostgREST to refresh its schema cache after creating this table.
notify pgrst, 'reload schema';
