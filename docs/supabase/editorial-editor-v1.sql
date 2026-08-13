-- Retro-Gamers.it editorial editor v1 foundation.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - creates private editorial identity, ownership and audit tables;
-- - keeps Supabase as the authority for editorial permissions and workflow;
-- - keeps Sanity as the authority for public author and article content;
-- - does not expose editorial tables directly to browser clients.
--
-- Safety notes:
-- - Astro server APIs must mediate every write through the service role.
-- - Do not store Supabase user ids in public Sanity documents.
-- - Do not store article bodies, Portable Text payloads, emails or secrets in
--   the audit log.

create extension if not exists pgcrypto;

create table if not exists public.editorial_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sanity_author_id text not null,
  editorial_role text not null,
  status text not null default 'active',
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_profiles_sanity_author_id_unique unique (sanity_author_id),
  constraint editorial_profiles_sanity_author_id_format_check
    check (
      sanity_author_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
      and sanity_author_id not like 'drafts.%'
    ),
  constraint editorial_profiles_editorial_role_check
    check (editorial_role in ('contributor', 'editor', 'editorial_admin')),
  constraint editorial_profiles_status_check
    check (status in ('active', 'suspended'))
);

comment on table public.editorial_profiles is
  'Private mapping between a Supabase account and a public Sanity author identity. Server-side editorial APIs only.';
comment on column public.editorial_profiles.user_id is
  'Supabase Auth user id. Community profile.role does not grant editorial permissions automatically.';
comment on column public.editorial_profiles.sanity_author_id is
  'Root Sanity author document id. Never expose Supabase user ids in Sanity public documents.';
comment on column public.editorial_profiles.editorial_role is
  'Application-level editorial role. Separate from public Sanity author.role metadata.';
comment on column public.editorial_profiles.status is
  'Operational editorial access state. Suspended users keep the mapping but lose editor actions.';

create table if not exists public.editorial_documents (
  sanity_document_id text primary key,
  owner_user_id uuid not null references public.editorial_profiles(user_id) on delete restrict,
  sanity_author_id text not null,
  workflow_status text not null default 'draft',
  submitted_at timestamptz null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editorial_documents_sanity_document_id_format_check
    check (
      sanity_document_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
      and sanity_document_id not like 'drafts.%'
    ),
  constraint editorial_documents_sanity_author_id_format_check
    check (
      sanity_author_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
      and sanity_author_id not like 'drafts.%'
    ),
  constraint editorial_documents_workflow_status_check
    check (workflow_status in ('draft', 'submitted', 'changes_requested', 'approved', 'published')),
  constraint editorial_documents_reviewed_at_check
    check (
      reviewed_at is null
      or submitted_at is null
      or reviewed_at >= submitted_at
    )
);

comment on table public.editorial_documents is
  'Private ownership and workflow metadata for Sanity article root document ids.';
comment on column public.editorial_documents.sanity_document_id is
  'Root Sanity article document id, without the drafts. prefix.';
comment on column public.editorial_documents.owner_user_id is
  'Authoritative application owner. Do not trust owner ids sent by the browser.';
comment on column public.editorial_documents.sanity_author_id is
  'Snapshot of the Sanity author expected on the article. Mismatches are application conflicts, not automatic transfers.';
comment on column public.editorial_documents.workflow_status is
  'Application workflow state for the custom editorial editor.';

create table if not exists public.editorial_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  sanity_document_id text null,
  previous_workflow_status text null,
  next_workflow_status text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint editorial_audit_log_action_check
    check (
      action in (
        'editorial_profile_linked',
        'editorial_profile_updated',
        'editorial_profile_suspended',
        'editorial_author_created',
        'article_created',
        'article_saved',
        'article_submitted',
        'article_returned',
        'article_approved',
        'article_published',
        'image_uploaded'
      )
    ),
  constraint editorial_audit_log_sanity_document_id_format_check
    check (
      sanity_document_id is null
      or (
        sanity_document_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
        and sanity_document_id not like 'drafts.%'
      )
    ),
  constraint editorial_audit_log_previous_workflow_status_check
    check (
      previous_workflow_status is null
      or previous_workflow_status in ('draft', 'submitted', 'changes_requested', 'approved', 'published')
    ),
  constraint editorial_audit_log_next_workflow_status_check
    check (
      next_workflow_status is null
      or next_workflow_status in ('draft', 'submitted', 'changes_requested', 'approved', 'published')
    ),
  constraint editorial_audit_log_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.editorial_audit_log is
  'Minimal application audit log for server-side editorial operations performed against Sanity.';
comment on column public.editorial_audit_log.metadata is
  'Small technical metadata only. Do not store article bodies, Portable Text, emails, tokens or secrets.';

create index if not exists editorial_profiles_status_role_idx
  on public.editorial_profiles (status, editorial_role);

create index if not exists editorial_documents_owner_workflow_idx
  on public.editorial_documents (owner_user_id, workflow_status, updated_at desc);

create index if not exists editorial_documents_workflow_updated_idx
  on public.editorial_documents (workflow_status, updated_at desc);

create index if not exists editorial_documents_sanity_author_id_idx
  on public.editorial_documents (sanity_author_id);

create index if not exists editorial_audit_log_document_created_idx
  on public.editorial_audit_log (sanity_document_id, created_at desc)
  where sanity_document_id is not null;

create index if not exists editorial_audit_log_actor_created_idx
  on public.editorial_audit_log (actor_user_id, created_at desc)
  where actor_user_id is not null;

create or replace function public.set_editorial_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = clock_timestamp();
  end if;

  return new;
end;
$$;

drop trigger if exists set_editorial_profiles_updated_at
  on public.editorial_profiles;

create trigger set_editorial_profiles_updated_at
before update on public.editorial_profiles
for each row
execute function public.set_editorial_updated_at();

drop trigger if exists set_editorial_documents_updated_at
  on public.editorial_documents;

create trigger set_editorial_documents_updated_at
before update on public.editorial_documents
for each row
execute function public.set_editorial_updated_at();

alter table public.editorial_profiles enable row level security;
alter table public.editorial_documents enable row level security;
alter table public.editorial_audit_log enable row level security;

grant usage on schema public to service_role;
grant all on table public.editorial_profiles to service_role;
grant all on table public.editorial_documents to service_role;
grant all on table public.editorial_audit_log to service_role;

revoke all on table public.editorial_profiles from anon, authenticated;
revoke all on table public.editorial_documents from anon, authenticated;
revoke all on table public.editorial_audit_log from anon, authenticated;

revoke all on function public.set_editorial_updated_at() from public;
grant execute on function public.set_editorial_updated_at() to service_role;

notify pgrst, 'reload schema';
