import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  getCommunitySurveyResponseState,
  getOpenCommunitySurveyByKey,
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
    const survey = await getOpenCommunitySurveyByKey(surveyKey, {
      language,
      surveyDocumentId,
    });

    if (!survey) {
      return surveyJson({ ok: false, error: 'survey_not_found' }, 404);
    }

    const responseState = await getCommunitySurveyResponseState(
      cookies,
      survey.surveyKey
    );

    return surveyJson({
      ok: true,
      survey,
      responseState,
    });
  } catch (error) {
    logApiError('community-surveys.get-api', error);

    return surveyJson({ ok: false, error: 'survey_unavailable' }, 500);
  }
};

export const POST: APIRoute = async () =>
  surveyJson({ ok: false, error: 'invalid_request' }, 405);
