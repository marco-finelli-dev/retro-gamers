-- Playable Classics download logs for Retro-Gamers.it.
-- Run manually in Supabase Dashboard -> SQL Editor.
--
-- V0 scope:
-- - prepares a minimal log table for future authenticated downloads;
-- - does not create or expose any public file URL;
-- - does not require direct browser writes to this table;
-- - actual downloads should be served by a server-side endpoint with service role.

create table if not exists public.playable_classic_download_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  playable_classic_id text not null,
  slug text not null,
  package_name text null,
  package_version text null,
  storage_path text not null,
  downloaded_at timestamptz not null default now(),
  user_agent text null,
  -- Optional future field. Store only a one-way hash, never the raw IP address.
  ip_hash text null
);

comment on table public.playable_classic_download_logs is
  'Minimal server-side log for future authenticated Playable Classics downloads.';

comment on column public.playable_classic_download_logs.playable_classic_id is
  'Sanity document id for the playableClassic entry.';

comment on column public.playable_classic_download_logs.storage_path is
  'Private Supabase Storage path used server-side. Do not expose in public frontend responses.';

comment on column public.playable_classic_download_logs.ip_hash is
  'Optional one-way hash for abuse prevention. Raw IP addresses should not be stored in V0.';

create index if not exists playable_classic_download_logs_user_downloaded_at_idx
  on public.playable_classic_download_logs (user_id, downloaded_at desc);

create index if not exists playable_classic_download_logs_classic_downloaded_at_idx
  on public.playable_classic_download_logs (playable_classic_id, downloaded_at desc);

create index if not exists playable_classic_download_logs_slug_downloaded_at_idx
  on public.playable_classic_download_logs (slug, downloaded_at desc);

alter table public.playable_classic_download_logs enable row level security;

grant usage on schema public to authenticated, service_role;

revoke all on public.playable_classic_download_logs from anon, authenticated;
grant select on public.playable_classic_download_logs to authenticated;
grant all on public.playable_classic_download_logs to service_role;

drop policy if exists "Users can read own playable classic download logs"
  on public.playable_classic_download_logs;

create policy "Users can read own playable classic download logs"
  on public.playable_classic_download_logs
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Inserts are intentionally reserved for the server-side API with service_role.
-- If a future implementation allows authenticated direct inserts, add a policy
-- with check (auth.uid() = user_id), but keep storage_path hidden from public UI.

-- Future private bucket, to create manually from Supabase Dashboard or SQL only
-- when downloads are ready:
--
-- insert into storage.buckets (
--   id,
--   name,
--   public
-- )
-- values (
--   'playable-classics',
--   'playable-classics',
--   false
-- )
-- on conflict (id) do update set
--   public = excluded.public;
--
-- Do not add public storage.objects select policies for this bucket.
-- Signed URLs should be generated server-side after checking the user session,
-- the Sanity playableClassic fields and the private storage_path.
