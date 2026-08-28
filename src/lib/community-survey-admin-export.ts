import type {
  CommunitySurveyAdminExportAnswer,
  CommunitySurveyAdminExportData,
  CommunitySurveyAdminExportResponse,
  CommunitySurveyLanguage,
  CommunitySurveyPublic,
  CommunitySurveyQuestion,
} from './community-surveys';
import { normalizeTechnicalId } from './community-surveys';

export const COMMUNITY_SURVEY_EXPORT_CHOICE_SEPARATOR = ' | ';

export const getCommunitySurveyExportDate = () => new Date().toISOString().slice(0, 10);

export const sanitizeCommunitySurveyExportFilenamePart = (value: string) =>
  normalizeTechnicalId(value) || 'community-survey';

export const getUniqueCommunitySurveyQuestionColumns = (questions: CommunitySurveyQuestion[]) => {
  const seen = new Map<string, number>();

  return questions.map((question, index) => {
    const fallback = `question_${index + 1}`;
    const base = normalizeTechnicalId(question.questionId) || fallback;
    const count = seen.get(base) || 0;

    seen.set(base, count + 1);

    return count === 0 ? base : `${base}_${count + 1}`;
  });
};

export const getCommunitySurveyForLanguage = (
  surveys: CommunitySurveyPublic[],
  language: CommunitySurveyLanguage | null,
  fallbackSurvey: CommunitySurveyPublic
) =>
  (language ? surveys.find((survey) => survey.language === language) : null) ||
  fallbackSurvey;

export const getLocalizedCommunitySurveyQuestion = (
  survey: CommunitySurveyPublic,
  question: CommunitySurveyQuestion
) =>
  survey.questions.find((candidate) => candidate.questionId === question.questionId) ||
  question;

export const getCommunitySurveyOptionLabel = (
  question: CommunitySurveyQuestion,
  optionId: string
) =>
  question.options.find((option) => option.optionId === optionId)?.label ||
  optionId;

export const sortCommunitySurveyOptionIdsByQuestionOrder = (
  optionIds: string[],
  question: CommunitySurveyQuestion
) => {
  const optionOrder = new Map(
    question.options.map((option, index) => [option.optionId, index])
  );

  return [...new Set(optionIds)].sort((a, b) => {
    const aIndex = optionOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = optionOrder.get(b) ?? Number.MAX_SAFE_INTEGER;

    if (aIndex !== bIndex) return aIndex - bIndex;

    return a.localeCompare(b);
  });
};

export const getCommunitySurveyAnswerForQuestion = (
  response: CommunitySurveyAdminExportResponse,
  question: CommunitySurveyQuestion
) =>
  response.answers.find((answer) => answer.questionId === question.questionId) ||
  null;

export const getCommunitySurveyExportAnswerValue = ({
  answer,
  question,
  localizedQuestion,
}: {
  answer: CommunitySurveyAdminExportAnswer | null;
  question: CommunitySurveyQuestion;
  localizedQuestion: CommunitySurveyQuestion;
}) => {
  if (!answer) return '';

  if (question.type === 'text') {
    return answer.textAnswer ?? '';
  }

  if (question.type === 'single') {
    const optionId = answer.optionIds[0] || '';

    return optionId ? getCommunitySurveyOptionLabel(localizedQuestion, optionId) : '';
  }

  return sortCommunitySurveyOptionIdsByQuestionOrder(answer.optionIds, localizedQuestion)
    .map((optionId) => getCommunitySurveyOptionLabel(localizedQuestion, optionId))
    .join(COMMUNITY_SURVEY_EXPORT_CHOICE_SEPARATOR);
};

export const buildCommunitySurveyRawExportRows = ({
  survey,
  surveys,
  questions,
  responses,
}: CommunitySurveyAdminExportData) => {
  const questionColumns = getUniqueCommunitySurveyQuestionColumns(questions);
  const header = ['submitted_at', 'language', ...questionColumns];
  const rows = responses.map((response) => {
    const localizedSurvey = getCommunitySurveyForLanguage(surveys, response.language, survey);

    return [
      response.submittedAt || '',
      response.language || '',
      ...questions.map((question) => {
        const localizedQuestion = getLocalizedCommunitySurveyQuestion(localizedSurvey, question);
        const answer = getCommunitySurveyAnswerForQuestion(response, question);

        return getCommunitySurveyExportAnswerValue({
          answer,
          question,
          localizedQuestion,
        });
      }),
    ];
  });

  return {
    header,
    rows,
  };
};
