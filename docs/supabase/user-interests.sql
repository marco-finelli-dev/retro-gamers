-- Retro-Gamers.it user interests.
-- Run manually in Supabase Dashboard -> SQL Editor.

create table if not exists public.user_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  target_slug text not null,
  target_name text not null,
  target_extra text,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id),
  constraint user_interests_target_type_check
    check (target_type in ('platform', 'creator', 'company'))
);

create index if not exists user_interests_user_created_at_idx
  on public.user_interests (user_id, created_at desc);

create index if not exists user_interests_user_target_type_idx
  on public.user_interests (user_id, target_type);

alter table public.user_interests enable row level security;

grant select, insert, delete on table public.user_interests to authenticated;
grant all on table public.user_interests to service_role;

drop policy if exists "Users can read own interests" on public.user_interests;
create policy "Users can read own interests"
  on public.user_interests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add own interests" on public.user_interests;
create policy "Users can add own interests"
  on public.user_interests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove own interests" on public.user_interests;
create policy "Users can remove own interests"
  on public.user_interests
  for delete
  to authenticated
  using (auth.uid() = user_id);
