-- Retro-Gamers.it Quiz v1.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - creates the private answer key and attempt tables used by Astro server APIs;
-- - does not expose quiz internals to browser clients;
-- - creates only the submit_quiz_answer RPC for atomic answer submission;
-- - does not create start/resume/leaderboard RPC functions yet.
--
-- Editorial rule:
-- once a quiz has received official attempts, do not change quizKey, questionId,
-- answerId, the correct answer, the substantial question structure or the
-- competitive timer in an incompatible way. Pure copy fixes are allowed. If the
-- competitive structure changes, create a new quizKey.

create extension if not exists pgcrypto;

create table if not exists public.quiz_answer_keys (
  quiz_key text not null,
  question_id text not null,
  correct_answer_id text not null,
  explanation_it text null,
  explanation_en text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_answer_keys_primary_key primary key (quiz_key, question_id),
  constraint quiz_answer_keys_quiz_key_format_check
    check (quiz_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint quiz_answer_keys_question_id_format_check
    check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint quiz_answer_keys_correct_answer_id_format_check
    check (correct_answer_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.quiz_answer_keys is
  'Private answer key for Retro-Gamers quiz questions. Server-side API only.';
comment on column public.quiz_answer_keys.quiz_key is
  'Stable logical quiz identifier shared by the Italian and English Sanity quiz documents.';
comment on column public.quiz_answer_keys.question_id is
  'Stable question identifier from Sanity. Must match the localized quiz documents.';
comment on column public.quiz_answer_keys.correct_answer_id is
  'Private correct answer identifier. Never expose this table directly to browser clients.';
comment on column public.quiz_answer_keys.explanation_it is
  'Optional Italian explanation shown after the server has locked an answer.';
comment on column public.quiz_answer_keys.explanation_en is
  'Optional English explanation shown after the server has locked an answer.';

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_key text not null,
  quiz_document_id text not null,
  quiz_slug text not null,
  quiz_language text not null,
  user_id uuid null references auth.users(id) on delete cascade,
  guest_token_hash text null,
  status text not null default 'active',
  mode text not null,
  question_order jsonb not null,
  current_question_index integer not null default 0,
  current_question_started_at timestamptz not null default now(),
  time_limit_seconds integer not null,
  correct_count integer not null default 0,
  total_questions integer not null,
  total_elapsed_ms integer not null default 0,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  completed_at timestamptz null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_attempts_quiz_key_format_check
    check (quiz_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint quiz_attempts_quiz_document_id_not_empty_check
    check (nullif(btrim(quiz_document_id), '') is not null),
  constraint quiz_attempts_quiz_slug_not_empty_check
    check (nullif(btrim(quiz_slug), '') is not null),
  constraint quiz_attempts_quiz_language_check
    check (quiz_language in ('it', 'en')),
  constraint quiz_attempts_status_check
    check (status in ('active', 'completed', 'abandoned', 'expired')),
  constraint quiz_attempts_mode_check
    check (mode in ('official', 'training', 'guest')),
  constraint quiz_attempts_identity_shape_check
    check (
      (
        mode in ('official', 'training')
        and user_id is not null
        and guest_token_hash is null
      )
      or
      (
        mode = 'guest'
        and user_id is null
        and nullif(btrim(guest_token_hash), '') is not null
      )
    ),
  constraint quiz_attempts_question_order_array_check
    check (jsonb_typeof(question_order) = 'array'),
  constraint quiz_attempts_question_order_count_check
    check (
      case
        when jsonb_typeof(question_order) = 'array'
          then jsonb_array_length(question_order) = total_questions
        else false
      end
    ),
  constraint quiz_attempts_current_question_index_check
    check (current_question_index >= 0 and current_question_index <= total_questions),
  constraint quiz_attempts_time_limit_seconds_check
    check (time_limit_seconds between 5 and 120),
  constraint quiz_attempts_correct_count_check
    check (correct_count >= 0 and correct_count <= total_questions),
  constraint quiz_attempts_total_questions_check
    check (total_questions > 0),
  constraint quiz_attempts_total_elapsed_ms_check
    check (total_elapsed_ms >= 0),
  constraint quiz_attempts_completed_at_check
    check (
      completed_at is null
      or completed_at >= started_at
    ),
  constraint quiz_attempts_expires_at_check
    check (expires_at > started_at)
);

comment on table public.quiz_attempts is
  'Quiz attempts created and advanced only by Retro-Gamers Astro server APIs.';
comment on column public.quiz_attempts.quiz_key is
  'Logical competition key shared across localized Sanity quiz documents.';
comment on column public.quiz_attempts.mode is
  'Attempt mode: official first attempt, authenticated training attempt or guest attempt.';
comment on column public.quiz_attempts.question_order is
  'JSON array of questionId values fixed at attempt start for validation and resume.';
comment on column public.quiz_attempts.current_question_started_at is
  'Server-authoritative start time for the current question. Browser timers are cosmetic.';
comment on column public.quiz_attempts.expires_at is
  'Set by the API, initially planned as started_at + 2 hours.';

create unique index if not exists quiz_attempts_one_official_per_user_quiz_idx
  on public.quiz_attempts (quiz_key, user_id)
  where mode = 'official' and user_id is not null;

create index if not exists quiz_attempts_user_quiz_created_idx
  on public.quiz_attempts (user_id, quiz_key, created_at desc)
  where user_id is not null;

create index if not exists quiz_attempts_leaderboard_idx
  on public.quiz_attempts (
    quiz_key,
    correct_count desc,
    total_elapsed_ms asc,
    completed_at asc
  )
  where mode = 'official' and status = 'completed';

create index if not exists quiz_attempts_expires_at_idx
  on public.quiz_attempts (expires_at);

create table if not exists public.quiz_attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id text not null,
  answer_id text null,
  question_index integer not null,
  is_correct boolean not null,
  timed_out boolean not null default false,
  question_started_at timestamptz not null,
  answered_at timestamptz not null,
  elapsed_ms integer not null,
  created_at timestamptz not null default now(),
  constraint quiz_attempt_answers_question_id_format_check
    check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint quiz_attempt_answers_answer_id_format_check
    check (
      answer_id is null
      or answer_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint quiz_attempt_answers_timeout_shape_check
    check (
      (
        timed_out = false
        and answer_id is not null
      )
      or
      (
        timed_out = true
        and answer_id is null
        and is_correct = false
      )
    ),
  constraint quiz_attempt_answers_question_index_check
    check (question_index >= 0),
  constraint quiz_attempt_answers_elapsed_ms_check
    check (elapsed_ms >= 0),
  constraint quiz_attempt_answers_answered_at_check
    check (answered_at >= question_started_at),
  constraint quiz_attempt_answers_unique_attempt_question
    unique (attempt_id, question_id),
  constraint quiz_attempt_answers_unique_attempt_question_index
    unique (attempt_id, question_index)
);

comment on table public.quiz_attempt_answers is
  'Locked answers submitted for a quiz attempt. One row per question.';
comment on column public.quiz_attempt_answers.is_correct is
  'Server-computed result, derived from quiz_answer_keys after the answer is locked.';
comment on column public.quiz_attempt_answers.timed_out is
  'True when the server-authoritative timer has expired for this question.';

create or replace function public.set_quiz_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_quiz_answer_keys_updated_at
  on public.quiz_answer_keys;

create trigger set_quiz_answer_keys_updated_at
before update on public.quiz_answer_keys
for each row
execute function public.set_quiz_updated_at();

drop trigger if exists set_quiz_attempts_updated_at
  on public.quiz_attempts;

create trigger set_quiz_attempts_updated_at
before update on public.quiz_attempts
for each row
execute function public.set_quiz_updated_at();

create or replace function public.submit_quiz_answer(
  p_attempt_id uuid,
  p_question_id text,
  p_answer_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_answer_key public.quiz_answer_keys%rowtype;
  v_existing_answer public.quiz_attempt_answers%rowtype;
  v_now timestamptz;
  v_answered_at timestamptz;
  v_question_id text;
  v_answer_id text;
  v_expected_question_id text;
  v_elapsed_ms integer;
  v_grace_ms integer := 1000;
  v_limit_ms integer;
  v_timed_out boolean;
  v_is_correct boolean := false;
  v_is_last_question boolean;
  v_next_question_index integer;
  v_new_status text;
  v_new_correct_count integer;
  v_new_total_elapsed_ms integer;
  v_explanation text;
begin
  v_question_id := nullif(btrim(p_question_id), '');
  v_answer_id := nullif(btrim(p_answer_id), '');

  select *
  into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_attempt'
    );
  end if;

  if v_question_id is null or v_question_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_question_id',
      'status', v_attempt.status
    );
  end if;

  select *
  into v_existing_answer
  from public.quiz_attempt_answers
  where attempt_id = p_attempt_id
    and question_id = v_question_id;

  if found then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_answered',
      'status', v_attempt.status,
      'questionIndex', v_existing_answer.question_index,
      'isCorrect', v_existing_answer.is_correct,
      'timedOut', v_existing_answer.timed_out,
      'elapsedMs', v_existing_answer.elapsed_ms
    );
  end if;

  if v_attempt.status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'error',
        case v_attempt.status
          when 'completed' then 'attempt_completed'
          when 'abandoned' then 'attempt_abandoned'
          when 'expired' then 'attempt_expired'
          else 'attempt_not_active'
        end,
      'status', v_attempt.status
    );
  end if;

  v_now := clock_timestamp();

  if v_attempt.expires_at <= v_now then
    update public.quiz_attempts
    set
      status = 'expired',
      last_activity_at = v_now,
      updated_at = v_now
    where id = v_attempt.id;

    return jsonb_build_object(
      'ok', false,
      'error', 'attempt_expired',
      'status', 'expired'
    );
  end if;

  if v_attempt.current_question_index < 0
    or v_attempt.current_question_index >= v_attempt.total_questions then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_attempt',
      'status', v_attempt.status
    );
  end if;

  v_expected_question_id := v_attempt.question_order ->> v_attempt.current_question_index;

  if v_expected_question_id is null or v_expected_question_id = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_attempt',
      'status', v_attempt.status
    );
  end if;

  if v_question_id <> v_expected_question_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'wrong_question',
      'status', v_attempt.status,
      'questionIndex', v_attempt.current_question_index
    );
  end if;

  select *
  into v_answer_key
  from public.quiz_answer_keys
  where quiz_key = v_attempt.quiz_key
    and question_id = v_expected_question_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error', 'missing_answer_key',
      'status', v_attempt.status,
      'questionIndex', v_attempt.current_question_index
    );
  end if;

  v_answered_at := clock_timestamp();
  v_elapsed_ms := greatest(
    0,
    floor(extract(epoch from (v_answered_at - v_attempt.current_question_started_at)) * 1000)::integer
  );
  v_limit_ms := (v_attempt.time_limit_seconds * 1000) + v_grace_ms;
  v_timed_out := v_elapsed_ms > v_limit_ms;

  if v_timed_out then
    v_answer_id := null;
    v_is_correct := false;
  else
    if v_answer_id is null then
      return jsonb_build_object(
        'ok', false,
        'error', 'missing_answer',
        'status', v_attempt.status,
        'questionIndex', v_attempt.current_question_index
      );
    end if;

    if v_answer_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      return jsonb_build_object(
        'ok', false,
        'error', 'invalid_answer_id',
        'status', v_attempt.status,
        'questionIndex', v_attempt.current_question_index
      );
    end if;

    -- Sanity owns the four visible answerId values for each localized question.
    -- This RPC only verifies correctness against the private answer key. The
    -- Astro API must validate that p_answer_id belongs to the current Sanity
    -- question before calling this function.
    v_is_correct := v_answer_id = v_answer_key.correct_answer_id;
  end if;

  v_is_last_question := v_attempt.current_question_index = v_attempt.total_questions - 1;
  v_next_question_index :=
    case
      when v_is_last_question then v_attempt.total_questions
      else v_attempt.current_question_index + 1
    end;
  v_new_status := case when v_is_last_question then 'completed' else 'active' end;
  v_new_correct_count := v_attempt.correct_count + case when v_is_correct then 1 else 0 end;
  v_new_total_elapsed_ms := v_attempt.total_elapsed_ms + v_elapsed_ms;
  v_explanation :=
    case
      when v_attempt.quiz_language = 'en' then v_answer_key.explanation_en
      else v_answer_key.explanation_it
    end;

  begin
    insert into public.quiz_attempt_answers (
      attempt_id,
      question_id,
      answer_id,
      question_index,
      is_correct,
      timed_out,
      question_started_at,
      answered_at,
      elapsed_ms
    )
    values (
      v_attempt.id,
      v_expected_question_id,
      v_answer_id,
      v_attempt.current_question_index,
      v_is_correct,
      v_timed_out,
      v_attempt.current_question_started_at,
      v_answered_at,
      v_elapsed_ms
    );
  exception
    when unique_violation then
      return jsonb_build_object(
        'ok', false,
        'error', 'already_answered',
        'status', v_attempt.status,
        'questionIndex', v_attempt.current_question_index
      );
  end;

  update public.quiz_attempts
  set
    status = v_new_status,
    current_question_index = v_next_question_index,
    current_question_started_at =
      case
        when v_is_last_question then current_question_started_at
        else v_answered_at
      end,
    correct_count = v_new_correct_count,
    total_elapsed_ms = v_new_total_elapsed_ms,
    last_activity_at = v_answered_at,
    completed_at = case when v_is_last_question then v_answered_at else completed_at end,
    updated_at = v_answered_at
  where id = v_attempt.id;

  return jsonb_build_object(
    'ok', true,
    'status', v_new_status,
    'questionIndex', v_attempt.current_question_index,
    'isCorrect', v_is_correct,
    'timedOut', v_timed_out,
    'elapsedMs', v_elapsed_ms,
    'correctCount', v_new_correct_count,
    'totalQuestions', v_attempt.total_questions,
    'totalElapsedMs', v_new_total_elapsed_ms,
    'completed', v_is_last_question,
    'explanation', v_explanation,
    'nextQuestionIndex',
      case
        when v_is_last_question then null
        else v_next_question_index
      end
  );
end;
$$;

comment on function public.submit_quiz_answer(uuid, text, text) is
  'Atomically locks an active quiz attempt, records the current answer, advances or completes the attempt, and returns a structured JSON result.';

alter table public.quiz_answer_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_attempt_answers enable row level security;

grant usage on schema public to service_role;

grant all on table public.quiz_answer_keys to service_role;
grant all on table public.quiz_attempts to service_role;
grant all on table public.quiz_attempt_answers to service_role;

revoke all on table public.quiz_answer_keys from anon, authenticated;
revoke all on table public.quiz_attempts from anon, authenticated;
revoke all on table public.quiz_attempt_answers from anon, authenticated;

revoke all on function public.submit_quiz_answer(uuid, text, text) from public;
revoke execute on function public.submit_quiz_answer(uuid, text, text) from anon, authenticated;
grant execute on function public.submit_quiz_answer(uuid, text, text) to service_role;

-- No anon/authenticated RLS policies are created in v1.
-- Browser access must go through:
-- browser -> Astro endpoint -> HttpOnly session -> service role -> database.

notify pgrst, 'reload schema';
