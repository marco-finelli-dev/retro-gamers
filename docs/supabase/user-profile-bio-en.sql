-- Retro-Gamers.it reader profile English bio
-- Run this file manually in the Supabase SQL Editor.
-- It adds an optional English public biography field to reader profiles.

alter table public.profiles
  add column if not exists bio_en text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_en_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_bio_en_length
      check (bio_en is null or char_length(bio_en) <= 500);
  end if;
end $$;

comment on column public.profiles.bio_en is
  'Optional English public biography shown on English reader profiles. Plain text only, max 500 characters.';

-- Existing profile RLS policies continue to apply to the row.
-- The frontend updates this field server-side through the account profile endpoint.

-- Force PostgREST to refresh its schema cache after adding the column.
notify pgrst, 'reload schema';
