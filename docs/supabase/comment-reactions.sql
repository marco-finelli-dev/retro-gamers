-- Retro-Gamers.it comment reactions.
-- Run this in Supabase Dashboard -> SQL Editor before enabling the frontend feature.

create table if not exists public.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists comment_reactions_comment_id_idx
  on public.comment_reactions (comment_id);

create index if not exists comment_reactions_user_id_idx
  on public.comment_reactions (user_id);

grant all on table public.comment_reactions to service_role;
grant select, insert, update, delete on table public.comment_reactions to authenticated;

create or replace function public.set_comment_reactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_comment_reactions_updated_at on public.comment_reactions;

create trigger set_comment_reactions_updated_at
before update on public.comment_reactions
for each row
execute function public.set_comment_reactions_updated_at();

alter table public.comment_reactions enable row level security;

drop policy if exists "Users can read reactions on approved comments"
  on public.comment_reactions;

drop policy if exists "Users can read their own reactions"
  on public.comment_reactions;

-- Public aggregate counts are served by the server API.
-- Direct row reads stay limited to the authenticated user's own reactions.
create policy "Users can read their own reactions"
on public.comment_reactions
for select
to authenticated
using (
  auth.uid() = user_id
);

drop policy if exists "Users can add their own reaction to approved comments"
  on public.comment_reactions;

create policy "Users can add their own reaction to approved comments"
on public.comment_reactions
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.comments
    where comments.id = comment_reactions.comment_id
      and comments.status = 'approved'
  )
);

drop policy if exists "Users can update their own reaction"
  on public.comment_reactions;

create policy "Users can update their own reaction"
on public.comment_reactions
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and reaction in ('like', 'dislike')
  and exists (
    select 1
    from public.comments
    where comments.id = comment_reactions.comment_id
      and comments.status = 'approved'
  )
);

drop policy if exists "Users can delete their own reaction"
  on public.comment_reactions;

create policy "Users can delete their own reaction"
on public.comment_reactions
for delete
to authenticated
using (auth.uid() = user_id);
