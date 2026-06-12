-- Retro-Gamers.it reader profile avatars
-- Run this file manually in the Supabase SQL Editor.
-- It adds an optional Storage path for the avatar selected by a reader.

alter table public.profiles
  add column if not exists avatar_path text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_path_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_length
      check (avatar_path is null or length(avatar_path) <= 500);
  end if;
end $$;

comment on column public.profiles.avatar_path is
  'Path of the reader avatar file in the Supabase Storage avatars bucket.';

-- Force PostgREST to refresh its schema cache after creating this column.
notify pgrst, 'reload schema';
