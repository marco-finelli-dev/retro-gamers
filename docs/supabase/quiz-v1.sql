-- Retro-Gamers.it Quiz v1.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - creates the private answer key and attempt tables used by Astro server APIs;
-- - does not expose quiz internals to browser clients;
-- - does not create RPC functions for start/answer/finish yet.
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

-- No anon/authenticated RLS policies are created in v1.
-- Browser access must go through:
-- browser -> Astro endpoint -> HttpOnly session -> service role -> database.

notify pgrst, 'reload schema';
