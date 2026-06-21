-- Retro-Gamers.it community user last activity tracking.
-- Run this file manually in the Supabase SQL Editor.
-- It adds a nullable last activity timestamp to reader profiles.

alter table public.profiles
  add column if not exists last_activity_at timestamptz null;

comment on column public.profiles.last_activity_at is
  'Last meaningful authenticated community activity recorded by the application.';

create or replace function public.touch_user_activity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_activity_at = now()
  where user_id = p_user_id;
end;
$$;

revoke all on function public.touch_user_activity(uuid) from public;
grant execute on function public.touch_user_activity(uuid) to service_role;

create index if not exists profiles_last_activity_at_idx
  on public.profiles (last_activity_at desc);

-- Existing profile RLS policies continue to apply to profile rows.
-- The frontend updates this field server-side through service-role API routes.

-- Force PostgREST to refresh its schema cache after adding the column/function.
notify pgrst, 'reload schema';
