-- Retro-Gamers.it Community Survey AI summaries v1.
-- Run manually in Supabase Dashboard -> SQL Editor after review.
--
-- Scope:
-- - stores the latest admin-generated qualitative summary for a Community Survey;
-- - stores only structured summary output and source counters;
-- - does not store raw open answers, prompts, response ids, tokens, IPs or user agents;
-- - keeps access server-side only via service role.

create table if not exists public.community_survey_summaries (
  survey_key text not null,
  summary_language text not null default 'it',
  summary jsonb not null,
  generated_at timestamptz not null default now(),
  source_text_answer_count integer not null,
  source_latest_response_at timestamptz null,
  model text not null,
  prompt_version text not null,
  updated_at timestamptz not null default now(),
  primary key (survey_key, summary_language),
  constraint community_survey_summaries_survey_key_format_check
    check (survey_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint community_survey_summaries_language_check
    check (summary_language in ('it', 'en')),
  constraint community_survey_summaries_summary_object_check
    check (jsonb_typeof(summary) = 'object'),
  constraint community_survey_summaries_source_count_check
    check (source_text_answer_count >= 0),
  constraint community_survey_summaries_model_not_empty_check
    check (nullif(btrim(model), '') is not null),
  constraint community_survey_summaries_prompt_version_not_empty_check
    check (nullif(btrim(prompt_version), '') is not null)
);

comment on table public.community_survey_summaries is
  'Latest admin-generated qualitative summaries for Community Survey open answers. Server-side API only.';
comment on column public.community_survey_summaries.survey_key is
  'Stable logical survey identifier shared by localized Sanity survey documents.';
comment on column public.community_survey_summaries.summary_language is
  'Language of the generated summary. V1 uses Italian summaries for admin analysis.';
comment on column public.community_survey_summaries.summary is
  'Structured summary output. Raw survey answers and prompts must not be stored here.';
comment on column public.community_survey_summaries.source_text_answer_count is
  'Number of significant open answers considered during generation.';
comment on column public.community_survey_summaries.source_latest_response_at is
  'Latest significant open-answer submission timestamp considered during generation.';

create or replace function public.set_community_survey_summaries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists community_survey_summaries_set_updated_at
  on public.community_survey_summaries;

create trigger community_survey_summaries_set_updated_at
before update on public.community_survey_summaries
for each row
execute function public.set_community_survey_summaries_updated_at();

create index if not exists community_survey_summaries_generated_idx
  on public.community_survey_summaries (survey_key, generated_at desc);

alter table public.community_survey_summaries enable row level security;

grant usage on schema public to service_role;
grant all on table public.community_survey_summaries to service_role;
revoke all on table public.community_survey_summaries from anon, authenticated;

-- No anon/authenticated RLS policies are created in v1.
-- Browser access must go through:
-- browser -> Astro admin endpoint/page -> service role -> database.

notify pgrst, 'reload schema';
