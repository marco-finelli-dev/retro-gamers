-- Retro-Gamers.it reader ratings for review articles v1.
-- Run this file manually in the Supabase SQL Editor.
-- Ratings are stored per canonical Sanity review id and authenticated user.

create table if not exists public.review_ratings (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(3,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_ratings_score_range check (score >= 1 and score <= 10),
  constraint review_ratings_score_half_step check (score * 2 = floor(score * 2)),
  constraint review_ratings_unique_post_user unique (post_id, user_id)
);

create index if not exists review_ratings_post_id_idx
  on public.review_ratings (post_id);

create index if not exists review_ratings_user_id_idx
  on public.review_ratings (user_id);

grant usage on schema public to authenticated, service_role;
grant all on table public.review_ratings to service_role;
grant select, insert, update, delete on table public.review_ratings to authenticated;

create or replace function public.set_review_ratings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_review_ratings_updated_at
  on public.review_ratings;

create trigger set_review_ratings_updated_at
before update on public.review_ratings
for each row
execute function public.set_review_ratings_updated_at();

alter table public.review_ratings enable row level security;

drop policy if exists "Users can read their own review ratings"
  on public.review_ratings;

create policy "Users can read their own review ratings"
on public.review_ratings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own review rating"
  on public.review_ratings;

create policy "Users can insert their own review rating"
on public.review_ratings
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own review rating"
  on public.review_ratings;

create policy "Users can update their own review rating"
on public.review_ratings
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and score >= 1
  and score <= 10
  and score * 2 = floor(score * 2)
);

drop policy if exists "Users can delete their own review rating"
  on public.review_ratings;

create policy "Users can delete their own review rating"
on public.review_ratings
for delete
to authenticated
using (auth.uid() = user_id);

-- Public summaries are served by server-side API routes with the service role.
-- Do not grant direct anonymous row reads.
revoke all on table public.review_ratings from anon;

-- Force PostgREST to refresh its schema cache after creating the table.
notify pgrst, 'reload schema';
