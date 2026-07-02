-- Saved articles for Retro-Gamers.it reader accounts.
-- Run manually in Supabase Dashboard -> SQL Editor.

create table if not exists public.saved_articles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id text not null,
  article_slug text not null,
  article_title text not null,
  article_language text not null default 'it',
  article_category text,
  article_url text not null,
  saved_at timestamptz not null default now(),
  unique (user_id, article_id)
);

create index if not exists saved_articles_user_saved_at_idx
  on public.saved_articles (user_id, saved_at desc);

alter table public.saved_articles enable row level security;

grant select, insert, delete on table public.saved_articles to authenticated;
grant all on table public.saved_articles to service_role;

drop policy if exists "Users can read own saved articles" on public.saved_articles;
create policy "Users can read own saved articles"
  on public.saved_articles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can add own saved articles" on public.saved_articles;
create policy "Users can add own saved articles"
  on public.saved_articles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove own saved articles" on public.saved_articles;
create policy "Users can remove own saved articles"
  on public.saved_articles
  for delete
  to authenticated
  using (auth.uid() = user_id);
