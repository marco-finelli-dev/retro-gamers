-- Retro-Gamers.it account messages / internal notifications
-- Run this file manually in the Supabase SQL Editor.
-- It creates the first version of the reader notification center used by /account/messages/.

create table if not exists public.account_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('comment_approved', 'comment_reply', 'badge_unlocked', 'system')),
  title text not null,
  body text not null,
  action_label text null,
  action_url text null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists account_messages_user_created_idx
  on public.account_messages (user_id, created_at desc);

create index if not exists account_messages_user_read_idx
  on public.account_messages (user_id, is_read);

alter table public.account_messages enable row level security;

grant usage on schema public to authenticated, service_role;
grant all on public.account_messages to service_role;

drop policy if exists "Users can read own account messages" on public.account_messages;
create policy "Users can read own account messages"
  on public.account_messages
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update own read state" on public.account_messages;
create policy "Users can update own read state"
  on public.account_messages
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.account_messages from anon, authenticated;
grant select on public.account_messages to authenticated;
grant update (is_read, read_at) on public.account_messages to authenticated;

-- Inserts and server-side management are performed with the Supabase service role.
-- No public insert/delete policy is required.

-- Force PostgREST to refresh its schema cache after creating this table.
notify pgrst, 'reload schema';

-- TODO Community 3.0:
-- Add badge_unlocked messages when badge unlock logic becomes available.
