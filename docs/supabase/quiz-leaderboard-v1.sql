-- Retro-Gamers.it Quiz leaderboard v1
--
-- Incremental SQL for the public leaderboard read model.
-- Apply from the Supabase SQL editor after quiz-v1.sql is installed.

create or replace function public.get_quiz_leaderboard(
  p_quiz_key text,
  p_limit integer default 10,
  p_user_id uuid default null
)
returns table (
  rank integer,
  username text,
  display_name text,
  avatar_path text,
  badge_key text,
  correct_count integer,
  total_questions integer,
  total_elapsed_ms integer,
  quiz_language text,
  completed_at timestamptz,
  is_current_user boolean,
  total_eligible bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
begin
  if p_quiz_key is null or p_quiz_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Invalid quiz key'
      using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 10), 1), 100);

  return query
  with eligible as (
    select
      a.user_id,
      p.username,
      p.display_name,
      p.avatar_path,
      p.badge_key,
      a.correct_count,
      a.total_questions,
      a.total_elapsed_ms,
      a.quiz_language,
      a.completed_at
    from public.quiz_attempts as a
    inner join public.profiles as p
      on p.user_id = a.user_id
    where a.quiz_key = p_quiz_key
      and a.mode = 'official'
      and a.status = 'completed'
      and a.user_id is not null
      and p.status = 'active'
      and p.role not in ('admin', 'moderator')
      and a.completed_at is not null
  ),
  ranked as (
    select
      row_number() over (
        order by
          eligible.correct_count desc,
          eligible.total_elapsed_ms asc,
          eligible.completed_at asc
      ) as entry_rank,
      count(*) over () as eligible_count,
      eligible.*
    from eligible
  )
  select
    ranked.entry_rank::integer,
    ranked.username,
    ranked.display_name,
    ranked.avatar_path,
    ranked.badge_key,
    ranked.correct_count,
    ranked.total_questions,
    ranked.total_elapsed_ms,
    ranked.quiz_language,
    ranked.completed_at,
    (p_user_id is not null and ranked.user_id = p_user_id) as is_current_user,
    ranked.eligible_count
  from ranked
  where ranked.entry_rank <= v_limit
     or (p_user_id is not null and ranked.user_id = p_user_id)
  order by ranked.entry_rank asc;
end;
$$;

comment on function public.get_quiz_leaderboard(text, integer, uuid) is
  'Returns the public official leaderboard for a quiz, excluding staff and private attempt data. Server-side service role only.';

revoke all on function public.get_quiz_leaderboard(text, integer, uuid) from public;
revoke execute on function public.get_quiz_leaderboard(text, integer, uuid) from anon, authenticated;
grant execute on function public.get_quiz_leaderboard(text, integer, uuid) to service_role;
