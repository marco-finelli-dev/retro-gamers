-- Retro-Gamers.it reader profile bio
-- Run this file manually in the Supabase SQL Editor.
-- It adds a short public biography field to reader profiles.

alter table public.profiles
  add column if not exists bio text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 500);
  end if;
end $$;

comment on column public.profiles.bio is
  'Short public biography shown on reader profiles. Plain text only, max 500 characters.';

-- Existing profile RLS policies continue to apply to the row.
-- The frontend updates this field server-side through the account profile endpoint.

-- Force PostgREST to refresh its schema cache after adding the column.
notify pgrst, 'reload schema';
