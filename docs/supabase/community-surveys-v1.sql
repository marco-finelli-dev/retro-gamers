-- Retro-Gamers.it Community Surveys v1.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - stores anonymous public survey responses submitted through Astro server APIs;
-- - keeps Sanity as the authority for survey questions and labels;
-- - keeps Supabase as the authority for submitted anonymous answers;
-- - does not expose survey response tables directly to browser clients;
-- - does not store email addresses, raw IP addresses or authenticated user ids.
--
-- Privacy rule:
-- respondent_token_hash must be derived server-side from a dedicated survey
-- guest token. Do not reuse comment identity hashes and do not store the raw
-- token in the database.

create extension if not exists pgcrypto;

create table if not exists public.community_survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_key text not null,
  survey_document_id text not null,
  survey_language text not null,
  respondent_token_hash text not null,
  submitted_at timestamptz not null default now(),
  constraint community_survey_responses_survey_key_format_check
    check (survey_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_survey_responses_document_id_not_empty_check
    check (nullif(btrim(survey_document_id), '') is not null),
  constraint community_survey_responses_language_check
    check (survey_language in ('it', 'en')),
  constraint community_survey_responses_token_hash_not_empty_check
    check (nullif(btrim(respondent_token_hash), '') is not null),
  constraint community_survey_responses_unique_respondent
    unique (survey_key, respondent_token_hash)
);

comment on table public.community_survey_responses is
  'Anonymous Community Survey V1 response envelopes. Server-side API only.';
comment on column public.community_survey_responses.survey_key is
  'Stable logical survey identifier shared by localized Sanity survey documents.';
comment on column public.community_survey_responses.survey_document_id is
  'Sanity communitySurvey document id used when the response was submitted.';
comment on column public.community_survey_responses.survey_language is
  'Language of the Sanity survey document used by the respondent.';
comment on column public.community_survey_responses.respondent_token_hash is
  'Server-side hash of a dedicated anonymous survey token. Never store the raw token.';

create table if not exists public.community_survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.community_survey_responses(id) on delete cascade,
  question_id text not null,
  option_id text null,
  text_answer text null,
  created_at timestamptz not null default now(),
  constraint community_survey_answers_question_id_format_check
    check (question_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_survey_answers_option_id_format_check
    check (
      option_id is null
      or option_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  constraint community_survey_answers_answer_shape_check
    check (
      (
        option_id is not null
        and text_answer is null
      )
      or
      (
        option_id is null
        and nullif(btrim(text_answer), '') is not null
      )
    )
);

comment on table public.community_survey_answers is
  'Anonymous Community Survey V1 answers. Multiple-choice questions may create more than one option row.';
comment on column public.community_survey_answers.response_id is
  'Parent anonymous survey response envelope.';
comment on column public.community_survey_answers.question_id is
  'Stable question id from the Sanity communitySurvey document.';
comment on column public.community_survey_answers.option_id is
  'Stable selected option id from Sanity for single/multiple questions.';
comment on column public.community_survey_answers.text_answer is
  'Free-text answer for text questions. Keep V1 copy concise and avoid collecting sensitive data.';

create index if not exists community_survey_responses_survey_submitted_idx
  on public.community_survey_responses (survey_key, submitted_at desc);

create index if not exists community_survey_responses_document_language_idx
  on public.community_survey_responses (survey_document_id, survey_language);

create index if not exists community_survey_answers_response_id_idx
  on public.community_survey_answers (response_id);

create index if not exists community_survey_answers_question_option_idx
  on public.community_survey_answers (question_id, option_id);

alter table public.community_survey_responses enable row level security;
alter table public.community_survey_answers enable row level security;

grant usage on schema public to service_role;

grant all on table public.community_survey_responses to service_role;
grant all on table public.community_survey_answers to service_role;

revoke all on table public.community_survey_responses from anon, authenticated;
revoke all on table public.community_survey_answers from anon, authenticated;

-- No anon/authenticated RLS policies are created in v1.
-- Browser access must go through:
-- browser -> Astro endpoint -> HttpOnly anonymous token -> service role -> database.

notify pgrst, 'reload schema';
