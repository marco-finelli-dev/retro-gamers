import type { APIRoute } from 'astro';
import { HOME_SURVEY_KEY } from '../../../../lib/home-survey';
import { logApiError } from '../../../../lib/api-errors';
import {
  getCommunitySurveyAvailability,
  getCommunitySurveyGuestIdentity,
  getHomeCommunitySurveyResults,
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

    const isHomeSurvey = surveyKey === HOME_SURVEY_KEY;
    if (isHomeSurvey && (survey.questions.length !== 1 || survey.questions[0].type !== 'single')) {
      return surveyJson({ ok: false, error: 'survey_unavailable' }, 503);
    }
    const availability = getCommunitySurveyAvailability(survey);
    // Establish the existing anonymous identity before enabling the Home vote button.
    if (isHomeSurvey && availability.isOpen) getCommunitySurveyGuestIdentity(cookies);
    const responseState = (availability.isOpen || isHomeSurvey)
      ? await getCommunitySurveyResponseState(cookies, survey.surveyKey, { strict: isHomeSurvey })
      : { hasResponded: false, submittedAt: null };

    const results = isHomeSurvey && (responseState.hasResponded || availability.state === 'closed')
      ? await getHomeCommunitySurveyResults(survey)
      : undefined;

    return surveyJson({
      ok: true,
      survey,
      availability,
      responseState,
      ...(results ? { results } : {}),
    });
  } catch (error) {
    logApiError('community-surveys.get-api', error);

    return surveyJson({ ok: false, error: 'survey_unavailable' }, 500);
  }
};

export const POST: APIRoute = async () =>
  surveyJson({ ok: false, error: 'invalid_request' }, 405);
