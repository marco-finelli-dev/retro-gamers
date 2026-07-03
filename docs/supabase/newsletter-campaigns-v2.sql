-- Retro-Gamers.it newsletter campaigns v2.
-- Run this file manually in the Supabase SQL Editor after newsletter-v1.sql.
--
-- V2 adds editorial newsletter campaigns while keeping subscriptions,
-- operational emails and account_messages separate.
--
-- Safety notes:
-- - No cron or automatic sends are implemented by this schema.
-- - Campaigns are managed server-side through protected admin APIs.
-- - Newsletter unsubscribe links remain subscriber-specific.
-- - Regular users and anonymous visitors have no direct table access.

create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  language text not null default 'it',
  status text not null default 'draft',
  title text not null,
  subject text not null,
  preheader text null,
  intro text null,
  content_html text null,
  content_text text null,
  cta_label text null,
  cta_url text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  test_sent_at timestamptz null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.newsletter_campaigns
  add column if not exists language text not null default 'it';

alter table public.newsletter_campaigns
  add column if not exists status text not null default 'draft';

alter table public.newsletter_campaigns
  add column if not exists title text not null;

alter table public.newsletter_campaigns
  add column if not exists subject text not null;

alter table public.newsletter_campaigns
  add column if not exists preheader text null;

alter table public.newsletter_campaigns
  add column if not exists intro text null;

alter table public.newsletter_campaigns
  add column if not exists content_html text null;

alter table public.newsletter_campaigns
  add column if not exists content_text text null;

alter table public.newsletter_campaigns
  add column if not exists cta_label text null;

alter table public.newsletter_campaigns
  add column if not exists cta_url text null;

alter table public.newsletter_campaigns
  add column if not exists created_by uuid null references auth.users(id) on delete set null;

alter table public.newsletter_campaigns
  add column if not exists updated_by uuid null references auth.users(id) on delete set null;

alter table public.newsletter_campaigns
  add column if not exists test_sent_at timestamptz null;

alter table public.newsletter_campaigns
  add column if not exists sent_at timestamptz null;

alter table public.newsletter_campaigns
  add column if not exists created_at timestamptz not null default now();

alter table public.newsletter_campaigns
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_campaigns_language_check'
      and conrelid = 'public.newsletter_campaigns'::regclass
  ) then
    alter table public.newsletter_campaigns
      add constraint newsletter_campaigns_language_check
      check (language in ('it', 'en'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_campaigns_status_check'
      and conrelid = 'public.newsletter_campaigns'::regclass
  ) then
    alter table public.newsletter_campaigns
      add constraint newsletter_campaigns_status_check
      check (status in ('draft', 'test_sent', 'sending', 'sent', 'cancelled'));
  end if;
end;
$$;

create table if not exists public.newsletter_campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  position int not null default 0,
  type text not null default 'external_link',
  title text not null,
  description text null,
  url text null,
  image_url text null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_campaign_items
  add column if not exists campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade;

alter table public.newsletter_campaign_items
  add column if not exists position int not null default 0;

alter table public.newsletter_campaign_items
  add column if not exists type text not null default 'external_link';

alter table public.newsletter_campaign_items
  add column if not exists title text not null;

alter table public.newsletter_campaign_items
  add column if not exists description text null;

alter table public.newsletter_campaign_items
  add column if not exists url text null;

alter table public.newsletter_campaign_items
  add column if not exists image_url text null;

alter table public.newsletter_campaign_items
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_campaign_items_type_check'
      and conrelid = 'public.newsletter_campaign_items'::regclass
  ) then
    alter table public.newsletter_campaign_items
      add constraint newsletter_campaign_items_type_check
      check (type in ('article', 'review', 'feature', 'guide', 'external_link', 'text'));
  end if;
end;
$$;

create index if not exists newsletter_campaigns_status_idx
  on public.newsletter_campaigns (status);

create index if not exists newsletter_campaigns_language_idx
  on public.newsletter_campaigns (language);

create index if not exists newsletter_campaigns_created_at_idx
  on public.newsletter_campaigns (created_at desc);

create index if not exists newsletter_campaign_items_campaign_id_idx
  on public.newsletter_campaign_items (campaign_id, position);

create or replace function public.set_newsletter_campaigns_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_newsletter_campaigns_updated_at
  on public.newsletter_campaigns;

create trigger set_newsletter_campaigns_updated_at
before update on public.newsletter_campaigns
for each row
execute function public.set_newsletter_campaigns_updated_at();

alter table public.newsletter_delivery_logs
  add column if not exists campaign_id uuid null references public.newsletter_campaigns(id) on delete set null;

alter table public.newsletter_delivery_logs
  add column if not exists provider_message_id text null;

create index if not exists newsletter_delivery_logs_campaign_id_idx
  on public.newsletter_delivery_logs (campaign_id);

alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_campaign_items enable row level security;

grant all on table public.newsletter_campaigns to service_role;
grant all on table public.newsletter_campaign_items to service_role;
revoke all on table public.newsletter_campaigns from anon, authenticated;
revoke all on table public.newsletter_campaign_items from anon, authenticated;

comment on table public.newsletter_campaigns is
  'Editorial newsletter campaigns. Managed only by protected server-side admin APIs.';

comment on table public.newsletter_campaign_items is
  'Ordered editorial blocks and recommended links for newsletter campaigns.';

comment on column public.newsletter_delivery_logs.campaign_id is
  'Optional relation to newsletter_campaigns for editorial sends.';

comment on column public.newsletter_delivery_logs.provider_message_id is
  'Provider delivery id for campaign sends. resend_message_id remains for V1 compatibility.';

notify pgrst, 'reload schema';
