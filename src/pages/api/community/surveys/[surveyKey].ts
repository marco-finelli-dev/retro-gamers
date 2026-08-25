import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  getCommunitySurveyAvailability,
  getCommunitySurveyResponseState,
  getPublishedCommunitySurveyByKey,
  normalizeCommunitySurveyLanguage,
  normalizeTechnicalId,
  surveyJson,
} from '../../../../lib/community-surveys';

export const GET: APIRoute = async ({ params, url, cookies }) => {
  const surveyKey = normalizeTechnicalId(params.surveyKey);
  const language = normalizeCommunitySurveyLanguage(url.searchParams.get('language'));
  const surveyDocumentId = String(url.searchParams.get('surveyDocumentId') || '').trim();

  if (!surveyKey) {
    return surveyJson({ ok: false, error: 'invalid_survey_key' }, 400);
  }

  try {
    const survey = await getPublishedCommunitySurveyByKey(surveyKey, {
      language,
      surveyDocumentId,
    });

    if (!survey) {
      return surveyJson({ ok: false, error: 'survey_not_found' }, 404);
    }

    const availability = getCommunitySurveyAvailability(survey);
    const responseState = availability.isOpen
      ? await getCommunitySurveyResponseState(cookies, survey.surveyKey)
      : { hasResponded: false, submittedAt: null };

    return surveyJson({
      ok: true,
      survey,
      availability,
      responseState,
    });
  } catch (error) {
    logApiError('community-surveys.get-api', error);

    return surveyJson({ ok: false, error: 'survey_unavailable' }, 500);
  }
};

export const POST: APIRoute = async () =>
  surveyJson({ ok: false, error: 'invalid_request' }, 405);
