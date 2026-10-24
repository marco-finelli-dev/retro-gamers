import { logApiError } from './api-errors';
import {
  getOpenCommunitySurveyForLanguage,
  type CommunitySurveyLanguage,
  type CommunitySurveyPublic,
} from './community-surveys';

type NavigationSurveyRequest = {
  navigationSurveys?: Map<CommunitySurveyLanguage, Promise<CommunitySurveyPublic | null>>;
};

// Astro.locals belongs to one request. Sharing the promise also deduplicates
// concurrently rendered slots, including the article CTA, without a global cache.
export function getNavigationSurvey(
  locals: NavigationSurveyRequest,
  language: CommunitySurveyLanguage
): Promise<CommunitySurveyPublic | null> {
  const pending = locals.navigationSurveys ??= new Map();
  let survey = pending.get(language);
  if (!survey) {
    survey = getOpenCommunitySurveyForLanguage(language).catch((error) => {
      logApiError('navigation.survey', error);
      return null;
    });
    pending.set(language, survey);
  }
  return survey;
}
