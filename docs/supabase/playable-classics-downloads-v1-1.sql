-- Playable Classics downloads V1.1: multi-package log metadata.
-- Run manually in Supabase Dashboard -> SQL Editor after the V1 log table exists.
--
-- Scope:
-- - keeps existing logs and columns;
-- - adds optional package identifier/title for multi-package downloads;
-- - does not expose storage paths publicly;
-- - keeps inserts reserved for the server-side API with service role.

alter table if exists public.playable_classic_download_logs
  add column if not exists package_id text null;

alter table if exists public.playable_classic_download_logs
  add column if not exists package_title text null;

comment on column public.playable_classic_download_logs.package_id is
  'Stable playableClassic download package id, such as dos-freeware or amiga-disk-images.';

comment on column public.playable_classic_download_logs.package_title is
  'Human-readable package title at the time the signed URL was generated.';

create index if not exists playable_classic_download_logs_package_downloaded_at_idx
  on public.playable_classic_download_logs (package_id, downloaded_at desc);

create index if not exists playable_classic_download_logs_slug_package_downloaded_at_idx
  on public.playable_classic_download_logs (slug, package_id, downloaded_at desc);
