-- Retro-Gamers.it private messages v1
-- Run this file manually in the Supabase SQL Editor.
-- It creates 1:1 private conversations, message blocks and moderation reports.

create table if not exists public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references auth.users(id) on delete cascade,
  user_two uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_conversations_no_self check (user_one <> user_two),
  constraint private_conversations_unique_pair unique (user_one, user_two)
);

create table if not exists public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  deleted_by_sender boolean not null default false,
  deleted_by_recipient boolean not null default false
);

create table if not exists public.private_message_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint private_message_blocks_no_self check (blocker_id <> blocked_id),
  constraint private_message_blocks_unique unique (blocker_id, blocked_id)
);

create table if not exists public.private_message_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  message_id uuid null references public.private_messages(id) on delete set null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id)
);

create index if not exists private_conversations_user_one_idx
  on public.private_conversations (user_one, updated_at desc);

create index if not exists private_conversations_user_two_idx
  on public.private_conversations (user_two, updated_at desc);

create index if not exists private_messages_conversation_created_idx
  on public.private_messages (conversation_id, created_at);

create index if not exists private_messages_unread_idx
  on public.private_messages (conversation_id, sender_id, read_at);

create index if not exists private_messages_sender_created_idx
  on public.private_messages (sender_id, created_at desc);

create index if not exists private_message_blocks_blocker_idx
  on public.private_message_blocks (blocker_id, blocked_id);

create index if not exists private_message_blocks_blocked_idx
  on public.private_message_blocks (blocked_id, blocker_id);

create index if not exists private_message_reports_status_created_idx
  on public.private_message_reports (status, created_at desc);

create or replace function public.set_private_conversation_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.private_conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists private_messages_touch_conversation
  on public.private_messages;

create trigger private_messages_touch_conversation
after insert on public.private_messages
for each row
execute function public.set_private_conversation_updated_at();

alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
alter table public.private_message_blocks enable row level security;
alter table public.private_message_reports enable row level security;

grant usage on schema public to authenticated, service_role;
grant all on public.private_conversations to service_role;
grant all on public.private_messages to service_role;
grant all on public.private_message_blocks to service_role;
grant all on public.private_message_reports to service_role;

-- The frontend uses server-side API routes with the Supabase service role for all
-- private message reads/writes. No direct browser select/insert/update policy is
-- required for authenticated users in v1.
revoke all on public.private_conversations from anon, authenticated;
revoke all on public.private_messages from anon, authenticated;
revoke all on public.private_message_blocks from anon, authenticated;
revoke all on public.private_message_reports from anon, authenticated;

-- Force PostgREST to refresh its schema cache after creating these tables.
notify pgrst, 'reload schema';
