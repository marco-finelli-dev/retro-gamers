-- Retro-Gamers.it newsletter v1.
-- Run this file manually in the Supabase SQL Editor.
--
-- This schema prepares a lightweight newsletter system only.
-- It does not implement forms, APIs, automatic sends or digest logic.
--
-- Design notes:
-- - Newsletter subscriptions are separate from public.account_messages.
-- - Newsletter subscriptions are separate from operational comment emails.
-- - Newsletter unsubscribe tokens are separate from comment unsubscribe tokens.
-- - V1 does not use retro interests, followed authors or automatic recommendations.
--   Those features belong to a future V2/V3.
-- - Public subscribe/unsubscribe flows should be handled by server-side API routes
--   using the service role, not by direct anonymous table access.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid null references auth.users(id) on delete set null,
  language text not null default 'it',
  status text not null default 'pending',
  consent_at timestamptz null,
  confirmed_at timestamptz null,
  unsubscribed_at timestamptz null,
  unsubscribe_token text not null,
  confirmation_token text null,
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.newsletter_subscribers
  add column if not exists email text not null;

alter table public.newsletter_subscribers
  add column if not exists user_id uuid null references auth.users(id) on delete set null;

alter table public.newsletter_subscribers
  add column if not exists language text not null default 'it';

alter table public.newsletter_subscribers
  add column if not exists status text not null default 'pending';

alter table public.newsletter_subscribers
  add column if not exists consent_at timestamptz null;

alter table public.newsletter_subscribers
  add column if not exists confirmed_at timestamptz null;

alter table public.newsletter_subscribers
  add column if not exists unsubscribed_at timestamptz null;

alter table public.newsletter_subscribers
  add column if not exists unsubscribe_token text not null;

alter table public.newsletter_subscribers
  add column if not exists confirmation_token text null;

alter table public.newsletter_subscribers
  add column if not exists source text null;

alter table public.newsletter_subscribers
  add column if not exists created_at timestamptz not null default now();

alter table public.newsletter_subscribers
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_subscribers_language_check'
      and conrelid = 'public.newsletter_subscribers'::regclass
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_language_check
      check (language in ('it', 'en'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_subscribers_status_check'
      and conrelid = 'public.newsletter_subscribers'::regclass
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_status_check
      check (status in ('pending', 'active', 'unsubscribed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_subscribers_email_normalized'
      and conrelid = 'public.newsletter_subscribers'::regclass
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_email_normalized
      check (email = lower(btrim(email)) and email <> '');
  end if;
end;
$$;

create unique index if not exists newsletter_subscribers_email_lower_key
  on public.newsletter_subscribers (lower(email));

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status);

create index if not exists newsletter_subscribers_user_id_idx
  on public.newsletter_subscribers (user_id);

create unique index if not exists newsletter_subscribers_unsubscribe_token_key
  on public.newsletter_subscribers (unsubscribe_token);

create unique index if not exists newsletter_subscribers_confirmation_token_key
  on public.newsletter_subscribers (confirmation_token)
  where confirmation_token is not null;

create or replace function public.set_newsletter_subscribers_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_newsletter_subscribers_updated_at
  on public.newsletter_subscribers;

create trigger set_newsletter_subscribers_updated_at
before update on public.newsletter_subscribers
for each row
execute function public.set_newsletter_subscribers_updated_at();

alter table public.newsletter_subscribers enable row level security;

grant usage on schema public to authenticated, service_role;
grant all on table public.newsletter_subscribers to service_role;
revoke all on table public.newsletter_subscribers from anon, authenticated;
grant select, update on table public.newsletter_subscribers to authenticated;

drop policy if exists "Newsletter subscribers can read own subscription"
  on public.newsletter_subscribers;

create policy "Newsletter subscribers can read own subscription"
on public.newsletter_subscribers
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Newsletter subscribers can update own subscription"
  on public.newsletter_subscribers;

create policy "Newsletter subscribers can update own subscription"
on public.newsletter_subscribers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.newsletter_subscribers is
  'Newsletter subscriptions for Retro-Gamers.it. Separate from account_messages, comment notifications and comment unsubscribe tokens.';

comment on column public.newsletter_subscribers.email is
  'Lowercase subscriber email. Public APIs should normalize before insert/update.';

comment on column public.newsletter_subscribers.language is
  'Preferred newsletter language: it or en.';

comment on column public.newsletter_subscribers.status is
  'Newsletter state: pending, active or unsubscribed.';

comment on column public.newsletter_subscribers.unsubscribe_token is
  'Newsletter unsubscribe token. Do not reuse comment unsubscribe tokens.';

comment on column public.newsletter_subscribers.confirmation_token is
  'Optional double opt-in confirmation token for newsletter signup.';

create table if not exists public.newsletter_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid null references public.newsletter_subscribers(id) on delete set null,
  email text not null,
  campaign_key text null,
  email_type text not null default 'newsletter',
  status text not null default 'queued',
  resend_message_id text null,
  error_message text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.newsletter_delivery_logs
  add column if not exists subscriber_id uuid null references public.newsletter_subscribers(id) on delete set null;

alter table public.newsletter_delivery_logs
  add column if not exists email text not null;

alter table public.newsletter_delivery_logs
  add column if not exists campaign_key text null;

alter table public.newsletter_delivery_logs
  add column if not exists email_type text not null default 'newsletter';

alter table public.newsletter_delivery_logs
  add column if not exists status text not null default 'queued';

alter table public.newsletter_delivery_logs
  add column if not exists resend_message_id text null;

alter table public.newsletter_delivery_logs
  add column if not exists error_message text null;

alter table public.newsletter_delivery_logs
  add column if not exists sent_at timestamptz null;

alter table public.newsletter_delivery_logs
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_delivery_logs_status_check'
      and conrelid = 'public.newsletter_delivery_logs'::regclass
  ) then
    alter table public.newsletter_delivery_logs
      add constraint newsletter_delivery_logs_status_check
      check (status in ('queued', 'sent', 'failed', 'skipped'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'newsletter_delivery_logs_email_type_check'
      and conrelid = 'public.newsletter_delivery_logs'::regclass
  ) then
    alter table public.newsletter_delivery_logs
      add constraint newsletter_delivery_logs_email_type_check
      check (email_type in ('newsletter', 'confirmation', 'unsubscribe', 'manual'));
  end if;
end;
$$;

create index if not exists newsletter_delivery_logs_subscriber_id_idx
  on public.newsletter_delivery_logs (subscriber_id);

create index if not exists newsletter_delivery_logs_email_idx
  on public.newsletter_delivery_logs (email);

create index if not exists newsletter_delivery_logs_campaign_key_idx
  on public.newsletter_delivery_logs (campaign_key);

create index if not exists newsletter_delivery_logs_status_idx
  on public.newsletter_delivery_logs (status);

create index if not exists newsletter_delivery_logs_created_at_idx
  on public.newsletter_delivery_logs (created_at desc);

alter table public.newsletter_delivery_logs enable row level security;

grant all on table public.newsletter_delivery_logs to service_role;
revoke all on table public.newsletter_delivery_logs from anon, authenticated;

comment on table public.newsletter_delivery_logs is
  'Newsletter delivery audit log for future manual or semi-manual sends. V1 does not implement automatic sends.';

comment on column public.newsletter_delivery_logs.email_type is
  'Delivery type: newsletter, confirmation, unsubscribe or manual.';

comment on column public.newsletter_delivery_logs.campaign_key is
  'Optional campaign identifier for manual newsletter sends.';

-- Force PostgREST to refresh its schema cache after creating the tables.
notify pgrst, 'reload schema';
