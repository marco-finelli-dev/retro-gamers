import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import {
  normalizeCommunitySurveyLanguage,
  normalizeTechnicalId,
  submitCommunitySurveyResponse,
  surveyJson,
} from '../../../../../lib/community-surveys';

type SurveyResponsePayload = {
  surveyDocumentId?: unknown;
  language?: unknown;
  answers?: unknown;
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const surveyKey = normalizeTechnicalId(params.surveyKey);

  if (!surveyKey) {
    return surveyJson({ ok: false, error: 'invalid_survey_key' }, 400);
  }

  let payload: SurveyResponsePayload;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return surveyJson({ ok: false, error: 'invalid_request' }, 400);
    }

    payload = parsed as SurveyResponsePayload;
  } catch {
    return surveyJson({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const result = await submitCommunitySurveyResponse({
      surveyKey,
      surveyDocumentId:
        typeof payload.surveyDocumentId === 'string'
          ? payload.surveyDocumentId
          : '',
      language: normalizeCommunitySurveyLanguage(payload.language),
      answers: payload.answers,
      cookies,
    });

    if (!result.ok) {
      return surveyJson(
        {
          ok: false,
          error: result.error,
          field: result.field,
        },
        result.status
      );
    }

    return surveyJson(
      {
        ok: true,
        responseId: result.responseId,
        submittedAt: result.submittedAt,
      },
      201
    );
  } catch (error) {
    logApiError('community-surveys.responses-api', error);

    return surveyJson({ ok: false, error: 'survey_submit_failed' }, 500);
  }
};

export const GET: APIRoute = async () =>
  surveyJson({ ok: false, error: 'invalid_request' }, 405);
