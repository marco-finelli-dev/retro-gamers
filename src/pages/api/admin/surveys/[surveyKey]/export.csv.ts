import type { APIRoute } from 'astro';
import {
  getCommunitySurveyAdminExportData,
  normalizeTechnicalId,
  type CommunitySurveyAdminExportAnswer,
  type CommunitySurveyAdminExportResponse,
  type CommunitySurveyLanguage,
  type CommunitySurveyPublic,
  type CommunitySurveyQuestion,
} from '../../../../../lib/community-surveys';
import { getUserSessionFromCookies } from '../../../../../lib/supabase/auth';

const CSV_CHOICE_SEPARATOR = ' | ';

const escapeCsvCell = (value: unknown) => {
  const text = value == null ? '' : String(value);

  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
};

const createCsv = (rows: unknown[][]) =>
  `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;

const sanitizeFilenamePart = (value: string) =>
  normalizeTechnicalId(value) || 'community-survey';

const getExportDate = () => new Date().toISOString().slice(0, 10);

const getUniqueQuestionColumns = (questions: CommunitySurveyQuestion[]) => {
  const seen = new Map<string, number>();

  return questions.map((question, index) => {
    const fallback = `question_${index + 1}`;
    const base = normalizeTechnicalId(question.questionId) || fallback;
    const count = seen.get(base) || 0;

    seen.set(base, count + 1);

    return count === 0 ? base : `${base}_${count + 1}`;
  });
};

const getSurveyForLanguage = (
  surveys: CommunitySurveyPublic[],
  language: CommunitySurveyLanguage | null,
  fallbackSurvey: CommunitySurveyPublic
) =>
  (language ? surveys.find((survey) => survey.language === language) : null) ||
  fallbackSurvey;

const getLocalizedQuestion = (
  survey: CommunitySurveyPublic,
  question: CommunitySurveyQuestion
) =>
  survey.questions.find((candidate) => candidate.questionId === question.questionId) ||
  question;

const getOptionLabel = (
  question: CommunitySurveyQuestion,
  optionId: string
) =>
  question.options.find((option) => option.optionId === optionId)?.label ||
  optionId;

const sortOptionIdsByQuestionOrder = (
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

const getAnswerForQuestion = (
  response: CommunitySurveyAdminExportResponse,
  question: CommunitySurveyQuestion
) =>
  response.answers.find((answer) => answer.questionId === question.questionId) ||
  null;

const getAnswerValue = ({
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

    return optionId ? getOptionLabel(localizedQuestion, optionId) : '';
  }

  return sortOptionIdsByQuestionOrder(answer.optionIds, localizedQuestion)
    .map((optionId) => getOptionLabel(localizedQuestion, optionId))
    .join(CSV_CHOICE_SEPARATOR);
};

const getStatusForExportError = (error: string) => {
  if (error === 'invalid_survey_key') return 400;
  if (error === 'survey_not_found') return 404;

  return 500;
};

export const GET: APIRoute = async ({ cookies, params }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return new Response('Unauthorized', {
      status: session.status || 401,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (session.profile.role !== 'admin') {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const surveyKey = normalizeTechnicalId(params.surveyKey);
  const result = await getCommunitySurveyAdminExportData(surveyKey);

  if (!result.ok) {
    return new Response(result.details || result.error, {
      status: getStatusForExportError(result.error),
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  }

  const { survey, surveys, questions, responses } = result.exportData;
  const questionColumns = getUniqueQuestionColumns(questions);
  const header = ['submitted_at', 'language', ...questionColumns];
  const rows = responses.map((response) => {
    const localizedSurvey = getSurveyForLanguage(surveys, response.language, survey);

    return [
      response.submittedAt || '',
      response.language || '',
      ...questions.map((question) => {
        const localizedQuestion = getLocalizedQuestion(localizedSurvey, question);
        const answer = getAnswerForQuestion(response, question);

        return getAnswerValue({
          answer,
          question,
          localizedQuestion,
        });
      }),
    ];
  });
  const csv = createCsv([header, ...rows]);
  const filename = `${sanitizeFilenamePart(survey.surveyKey)}-${getExportDate()}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
