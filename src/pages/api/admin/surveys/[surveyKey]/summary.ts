import type { APIRoute } from 'astro';
import { generateCommunitySurveyOpenAnswerSummary } from '../../../../../lib/community-survey-open-answer-summaries.server';
import { normalizeTechnicalId, surveyJson } from '../../../../../lib/community-surveys';
import { getUserSessionFromCookies } from '../../../../../lib/supabase/auth';

export const POST: APIRoute = async ({ cookies, params }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return surveyJson(
      {
        ok: false,
        error: 'unauthorized',
        message: 'Accesso richiesto.',
      },
      session.status || 401
    );
  }

  if (session.profile.role !== 'admin') {
    return surveyJson(
      {
        ok: false,
        error: 'forbidden',
        message: 'Permesso insufficiente.',
      },
      403
    );
  }

  const surveyKey = normalizeTechnicalId(params.surveyKey);
  const result = await generateCommunitySurveyOpenAnswerSummary(surveyKey);

  if (!result.ok) {
    return surveyJson(
      {
        ok: false,
        error: result.error,
        message: result.message,
      },
      result.status
    );
  }

  return surveyJson({
    ok: true,
    state: result.state,
  });
};
