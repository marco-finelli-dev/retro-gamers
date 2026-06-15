-- Retro-Gamers.it limited public comment editing.
-- Run this file manually in the Supabase SQL Editor before relying on edit metadata.
-- The frontend/API can update comment bodies without these columns, but edited_at
-- and edit_count keep a clear record of user edits.

alter table public.comments
  add column if not exists edited_at timestamptz null;

alter table public.comments
  add column if not exists edit_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comments_edit_count_non_negative'
  ) then
    alter table public.comments
      add constraint comments_edit_count_non_negative
      check (edit_count >= 0);
  end if;
end;
$$;

comment on column public.comments.edited_at is
  'Timestamp of the latest user edit made through the public comments UI.';

comment on column public.comments.edit_count is
  'Number of user edits made through the public comments UI.';

notify pgrst, 'reload schema';
