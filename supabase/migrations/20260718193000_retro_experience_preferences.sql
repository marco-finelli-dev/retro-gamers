-- Private profile preferences used by the authenticated Retro Experience UI.
alter table public.profiles
  add column if not exists preferred_language text;

alter table public.profiles
  add column if not exists retro_experience text;

update public.profiles
set preferred_language = 'it'
where preferred_language is null
   or preferred_language not in ('it', 'en');

update public.profiles
set retro_experience = 'standard'
where retro_experience is null
   or retro_experience not in ('standard', 'amiga', 'monkey');

alter table public.profiles
  alter column preferred_language set default 'it',
  alter column preferred_language set not null,
  alter column retro_experience set default 'standard',
  alter column retro_experience set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_preferred_language_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_language_check
      check (preferred_language in ('it', 'en'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_retro_experience_check'
  ) then
    alter table public.profiles
      add constraint profiles_retro_experience_check
      check (retro_experience in ('standard', 'amiga', 'monkey'));
  end if;
end
$$;

comment on column public.profiles.preferred_language is
  'Private account preference for the user-facing language (it or en).';

comment on column public.profiles.retro_experience is
  'Private account preference for the optional retro UI experience.';
