import {
  getCommunitySurveyAvailability,
  getPublishedCommunitySurveyBySlug,
  type CommunitySurveyLanguage,
  type CommunitySurveyPublic,
} from './community-surveys';
import { logApiError } from './api-errors';

type SurveyPageResult =
  | { status: 200; survey: CommunitySurveyPublic }
  | { status: 404 | 503 };

// Only the route chooses the HTTP status. An upstream failure is not absence.
export async function loadCommunitySurveyPage(
  slug: string,
  language: CommunitySurveyLanguage,
): Promise<SurveyPageResult> {
  try {
    const survey = await getPublishedCommunitySurveyBySlug(slug, language);
    if (!survey || getCommunitySurveyAvailability(survey).state === 'draft') {
      return { status: 404 };
    }
    return { status: 200, survey };
  } catch (error) {
    logApiError('community-survey.page', error);
    return { status: 503 };
  }
}
