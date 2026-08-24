-- Retro-Gamers.it editorial comments v1.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - creates private article-level editorial comment threads;
-- - keeps Supabase as the authority for internal editorial collaboration;
-- - keeps Sanity as the authority for public article content;
-- - does not expose editorial comments directly to browser clients.
--
-- Requires:
-- - docs/supabase/editorial-editor-v1.sql
--
-- Safety notes:
-- - Astro server APIs must mediate every read/write through the service role.
-- - Do not store article bodies, Portable Text payloads, emails or secrets in
--   comment metadata.
-- - sanity_document_id is always the root Sanity article document id, without
--   the drafts. prefix.

create extension if not exists pgcrypto;

create table if not exists public.editorial_article_comments (
  id uuid primary key default gen_random_uuid(),
  sanity_document_id text not null references public.editorial_documents(sanity_document_id) on delete cascade,
  parent_id uuid null references public.editorial_article_comments(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  status text not null default 'open',
  resolved_by uuid null references auth.users(id) on delete set null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint editorial_article_comments_sanity_document_id_format_check
    check (
      sanity_document_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
      and sanity_document_id not like 'drafts.%'
    ),
  constraint editorial_article_comments_body_check
    check (char_length(trim(body)) > 0),
  constraint editorial_article_comments_status_check
    check (status in ('open', 'resolved')),
  constraint editorial_article_comments_resolved_state_check
    check (
      (
        status = 'open'
        and resolved_by is null
        and resolved_at is null
      )
      or (
        status = 'resolved'
        and resolved_at is not null
      )
    ),
  constraint editorial_article_comments_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.editorial_article_comments is
  'Private editorial article comments and replies for the custom editorial editor. Server-side editorial APIs only.';
comment on column public.editorial_article_comments.sanity_document_id is
  'Root Sanity article document id, without the drafts. prefix. Linked to editorial_documents.';
comment on column public.editorial_article_comments.parent_id is
  'Optional parent editorial comment id for replies within an article thread.';
comment on column public.editorial_article_comments.author_user_id is
  'Supabase Auth user id of the editorial user who wrote the comment.';
comment on column public.editorial_article_comments.body is
  'Internal editorial comment text. Not public content and never rendered on public article pages.';
comment on column public.editorial_article_comments.status is
  'Internal resolution state for the editorial comment thread.';
comment on column public.editorial_article_comments.metadata is
  'Small non-sensitive technical metadata for future editor features. Do not store article bodies, Portable Text, emails, tokens or secrets.';

create index if not exists editorial_article_comments_document_status_created_idx
  on public.editorial_article_comments (sanity_document_id, status, created_at desc);

create index if not exists editorial_article_comments_parent_id_idx
  on public.editorial_article_comments (parent_id);

create index if not exists editorial_article_comments_author_created_idx
  on public.editorial_article_comments (author_user_id, created_at desc);

drop trigger if exists set_editorial_article_comments_updated_at
  on public.editorial_article_comments;

create trigger set_editorial_article_comments_updated_at
before update on public.editorial_article_comments
for each row
execute function public.set_editorial_updated_at();

alter table public.editorial_article_comments enable row level security;

grant usage on schema public to service_role;
grant all on table public.editorial_article_comments to service_role;

revoke all on table public.editorial_article_comments from anon, authenticated;

notify pgrst, 'reload schema';
