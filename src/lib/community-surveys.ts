import { createHash, randomBytes } from 'node:crypto';
import { logApiError } from './api-errors';
import { publicFreshClient } from './sanity';
import { supabaseAdmin } from './supabase/server';

export type CommunitySurveyLanguage = 'it' | 'en';
export type CommunitySurveyStatus = 'draft' | 'open' | 'closed';
export type CommunitySurveyQuestionType = 'single' | 'multiple' | 'text';

export type CommunitySurveyOption = {
  optionId: string;
  label: string;
};

export type CommunitySurveyQuestion = {
  questionId: string;
  text: string;
  type: CommunitySurveyQuestionType;
  options: CommunitySurveyOption[];
};

export type CommunitySurveyTranslation = {
  _id: string;
  title: string;
  slug: string;
  language: CommunitySurveyLanguage;
};

export type CommunitySurveyPublic = {
  _id: string;
  title: string;
  slug: string;
  language: CommunitySurveyLanguage;
  surveyKey: string;
  description?: string;
  status: CommunitySurveyStatus;
  questions: CommunitySurveyQuestion[];
  translatedVersion?: CommunitySurveyTranslation | null;
  translatedVersions?: CommunitySurveyTranslation[];
};

export type CommunitySurveyResponseState = {
  hasResponded: boolean;
  submittedAt: string | null;
};

type SurveyCookies = {
  get: (name: string) => { value?: string } | undefined;
  set?: (name: string, value: string, options: Record<string, unknown>) => void;
};

type SurveyAnswerInput = {
  questionId?: unknown;
  optionId?: unknown;
  optionIds?: unknown;
  textAnswer?: unknown;
};

type SurveyAnswerInsert = {
  response_id: string;
  question_id: string;
  option_id: string | null;
  text_answer: string | null;
};

type SurveyResponseRow = {
  id: string;
  submitted_at: string | null;
};

export const COMMUNITY_SURVEY_GUEST_COOKIE_NAME = 'rg_survey_guest';
export const COMMUNITY_SURVEY_TEXT_MAX_LENGTH = 2000;
export const TECHNICAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const COMMUNITY_SURVEY_GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const communitySurveyFields = `
  _id,
  title,
  "slug": slug.current,
  language,
  surveyKey,
  description,
  status,
  questions[]{
    questionId,
    text,
    type,
    options[]{
      optionId,
      label
    }
  },
  translatedVersion->{
    _id,
    title,
    "slug": slug.current,
    language
  },
  "translatedVersions": *[
    _type == "communitySurvey" &&
    translatedVersion._ref == ^._id &&
    status == "open" &&
    defined(slug.current) &&
    !(_id in path("drafts.**"))
  ]{
    _id,
    title,
    "slug": slug.current,
    language
  }
`;

const openCommunitySurveyFilter = `
  _type == "communitySurvey" &&
  status == "open" &&
  defined(slug.current) &&
  !(_id in path("drafts.**"))
`;

export const surveyJson = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });

export const normalizeCommunitySurveyLanguage = (
  value: unknown
): CommunitySurveyLanguage | null => {
  if (value === 'it' || value === 'en') return value;

  return null;
};

export const isTechnicalId = (value: unknown) =>
  typeof value === 'string' && TECHNICAL_ID_PATTERN.test(value.trim());

export const normalizeTechnicalId = (value: unknown) => {
  const id = String(value || '').trim();

  return isTechnicalId(id) ? id : '';
};

export const normalizeCommunitySurveySlug = (value: unknown) =>
  normalizeTechnicalId(value);

const getCommunitySurveyGuestCookieOptions = () => ({
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
  maxAge: COMMUNITY_SURVEY_GUEST_COOKIE_MAX_AGE,
});

const createCommunitySurveyGuestToken = () => randomBytes(32).toString('base64url');

const isValidCommunitySurveyGuestToken = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,96}$/.test(value);

const hashCommunitySurveyGuestToken = (token: string) =>
  createHash('sha256')
    .update(`community-survey:${token}`, 'utf8')
    .digest('hex');

export const getCommunitySurveyGuestIdentity = (
  cookies: SurveyCookies,
  { createIfMissing = true } = {}
) => {
  const existingToken = cookies.get(COMMUNITY_SURVEY_GUEST_COOKIE_NAME)?.value || '';

  if (!isValidCommunitySurveyGuestToken(existingToken) && !createIfMissing) {
    return null;
  }

  const token = isValidCommunitySurveyGuestToken(existingToken)
    ? existingToken
    : createCommunitySurveyGuestToken();

  if (token !== existingToken && cookies.set) {
    cookies.set(
      COMMUNITY_SURVEY_GUEST_COOKIE_NAME,
      token,
      getCommunitySurveyGuestCookieOptions()
    );
  }

  return {
    tokenHash: hashCommunitySurveyGuestToken(token),
  };
};

const normalizeSurveyOption = (option: unknown): CommunitySurveyOption | null => {
  const value = option as Partial<CommunitySurveyOption> | null;
  const optionId = normalizeTechnicalId(value?.optionId);
  const label = String(value?.label || '').trim();

  if (!optionId || !label) return null;

  return {
    optionId,
    label,
  };
};

const normalizeSurveyQuestion = (question: unknown): CommunitySurveyQuestion | null => {
  const value = question as Partial<CommunitySurveyQuestion> | null;
  const questionId = normalizeTechnicalId(value?.questionId);
  const text = String(value?.text || '').trim();
  const type = value?.type;

  if (
    !questionId ||
    !text ||
    (type !== 'single' && type !== 'multiple' && type !== 'text')
  ) {
    return null;
  }

  const options = Array.isArray(value?.options)
    ? value.options.map(normalizeSurveyOption).filter(Boolean) as CommunitySurveyOption[]
    : [];

  if (type !== 'text') {
    if (options.length < 2) return null;

    const optionIds = options.map((option) => option.optionId);

    if (new Set(optionIds).size !== optionIds.length) return null;
  }

  return {
    questionId,
    text,
    type,
    options: type === 'text' ? [] : options,
  };
};

const normalizeSurveyTranslation = (
  translation: unknown
): CommunitySurveyTranslation | null => {
  const value = translation as Partial<CommunitySurveyTranslation> | null;
  const _id = String(value?._id || '').trim();
  const title = String(value?.title || '').trim();
  const slug = normalizeCommunitySurveySlug(value?.slug);
  const language = normalizeCommunitySurveyLanguage(value?.language);

  if (!_id || !title || !slug || !language) return null;

  return {
    _id,
    title,
    slug,
    language,
  };
};

const normalizeCommunitySurvey = (
  survey: unknown
): CommunitySurveyPublic | null => {
  const value = survey as Partial<CommunitySurveyPublic> | null;
  const _id = String(value?._id || '').trim();
  const title = String(value?.title || '').trim();
  const slug = normalizeCommunitySurveySlug(value?.slug);
  const language = normalizeCommunitySurveyLanguage(value?.language);
  const surveyKey = normalizeTechnicalId(value?.surveyKey);
  const status = value?.status;

  if (
    !_id ||
    !title ||
    !slug ||
    !language ||
    !surveyKey ||
    status !== 'open'
  ) {
    return null;
  }

  const questions = Array.isArray(value?.questions)
    ? value.questions.map(normalizeSurveyQuestion).filter(Boolean) as CommunitySurveyQuestion[]
    : [];
  const questionIds = questions.map((question) => question.questionId);

  if (questions.length < 1 || new Set(questionIds).size !== questionIds.length) {
    return null;
  }

  const translatedVersion = normalizeSurveyTranslation(value?.translatedVersion);
  const translatedVersions = Array.isArray(value?.translatedVersions)
    ? value.translatedVersions
        .map(normalizeSurveyTranslation)
        .filter(Boolean) as CommunitySurveyTranslation[]
    : [];

  return {
    _id,
    title,
    slug,
    language,
    surveyKey,
    description: String(value?.description || '').trim(),
    status,
    questions,
    translatedVersion,
    translatedVersions,
  };
};

export function getCommunitySurveyUrl(
  survey:
    | Pick<CommunitySurveyPublic, 'slug' | 'language'>
    | CommunitySurveyTranslation
    | null
    | undefined,
  lang: CommunitySurveyLanguage = survey?.language === 'en' ? 'en' : 'it'
) {
  const slug = typeof survey?.slug === 'string' ? survey.slug : '';

  if (!slug) {
    return lang === 'en'
      ? '/en/community/surveys/'
      : '/community/surveys/';
  }

  return lang === 'en'
    ? `/en/community/surveys/${slug}/`
    : `/community/surveys/${slug}/`;
}

export async function getOpenCommunitySurveyBySlug(
  slug: string,
  language: CommunitySurveyLanguage = 'it'
): Promise<CommunitySurveyPublic | null> {
  const normalizedSlug = normalizeCommunitySurveySlug(slug);

  if (!normalizedSlug) return null;

  const data = await publicFreshClient.fetch(
    `
      *[
        ${openCommunitySurveyFilter} &&
        slug.current == $slug &&
        language == $language
      ][0] {
        ${communitySurveyFields}
      }
    `,
    { slug: normalizedSlug, language }
  );

  return normalizeCommunitySurvey(data);
}

export async function getOpenCommunitySurveyByKey(
  surveyKey: string,
  {
    language = null,
    surveyDocumentId = '',
  }: {
    language?: CommunitySurveyLanguage | null;
    surveyDocumentId?: string | null;
  } = {}
): Promise<CommunitySurveyPublic | null> {
  const normalizedSurveyKey = normalizeTechnicalId(surveyKey);
  const normalizedDocumentId = String(surveyDocumentId || '').trim();

  if (!normalizedSurveyKey) return null;

  const data = await publicFreshClient.fetch(
    `
      *[
        ${openCommunitySurveyFilter} &&
        surveyKey == $surveyKey &&
        (!defined($language) || language == $language) &&
        ($surveyDocumentId == "" || _id == $surveyDocumentId)
      ] | order(language asc, _createdAt desc)[0] {
        ${communitySurveyFields}
      }
    `,
    {
      surveyKey: normalizedSurveyKey,
      language,
      surveyDocumentId: normalizedDocumentId,
    }
  );

  return normalizeCommunitySurvey(data);
}

export async function getCommunitySurveyResponseState(
  cookies: SurveyCookies,
  surveyKey: string
): Promise<CommunitySurveyResponseState> {
  const normalizedSurveyKey = normalizeTechnicalId(surveyKey);
  const identity = getCommunitySurveyGuestIdentity(cookies, {
    createIfMissing: false,
  });

  if (!normalizedSurveyKey || !identity) {
    return {
      hasResponded: false,
      submittedAt: null,
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('community_survey_responses')
      .select('id, submitted_at')
      .eq('survey_key', normalizedSurveyKey)
      .eq('respondent_token_hash', identity.tokenHash)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      hasResponded: Boolean(data),
      submittedAt: (data as SurveyResponseRow | null)?.submitted_at || null,
    };
  } catch (error) {
    logApiError('community-surveys.response-state', error);

    return {
      hasResponded: false,
      submittedAt: null,
    };
  }
}

const normalizeAnswerInputs = (answers: unknown): SurveyAnswerInput[] | null => {
  if (!Array.isArray(answers)) return null;

  return answers.filter((answer) =>
    answer && typeof answer === 'object' && !Array.isArray(answer)
  ) as SurveyAnswerInput[];
};

const getSubmittedAnswerMap = (answers: SurveyAnswerInput[]) => {
  const map = new Map<string, SurveyAnswerInput>();

  for (const answer of answers) {
    const questionId = normalizeTechnicalId(answer.questionId);

    if (!questionId || map.has(questionId)) {
      return null;
    }

    map.set(questionId, answer);
  }

  return map;
};

const normalizeTextAnswer = (value: unknown) => {
  if (typeof value !== 'string') return '';

  return value.trim();
};

const validateSubmittedAnswers = (
  survey: CommunitySurveyPublic,
  answers: unknown,
  responseId: string
): (
  | { ok: true; rows: SurveyAnswerInsert[] }
  | { ok: false; error: string; status: number; field?: string }
) => {
  const answerInputs = normalizeAnswerInputs(answers);

  if (!answerInputs) {
    return { ok: false, error: 'invalid_answers', status: 400 };
  }

  const answerMap = getSubmittedAnswerMap(answerInputs);

  if (!answerMap) {
    return { ok: false, error: 'invalid_answers', status: 400 };
  }

  const questionIds = new Set(survey.questions.map((question) => question.questionId));
  const unknownAnswer = answerInputs.find((answer) => {
    const questionId = normalizeTechnicalId(answer.questionId);

    return !questionId || !questionIds.has(questionId);
  });

  if (unknownAnswer) {
    return { ok: false, error: 'invalid_question', status: 422 };
  }

  const rows: SurveyAnswerInsert[] = [];

  for (const question of survey.questions) {
    const answer = answerMap.get(question.questionId);

    if (!answer) {
      return {
        ok: false,
        error: 'missing_answer',
        status: 422,
        field: question.questionId,
      };
    }

    const allowedOptionIds = new Set(
      question.options.map((option) => option.optionId)
    );

    if (question.type === 'single') {
      const optionId = normalizeTechnicalId(answer.optionId);

      if (!optionId || !allowedOptionIds.has(optionId)) {
        return {
          ok: false,
          error: 'invalid_option',
          status: 422,
          field: question.questionId,
        };
      }

      rows.push({
        response_id: responseId,
        question_id: question.questionId,
        option_id: optionId,
        text_answer: null,
      });

      continue;
    }

    if (question.type === 'multiple') {
      const optionIds = Array.isArray(answer.optionIds)
        ? answer.optionIds.map(normalizeTechnicalId).filter(Boolean)
        : [];
      const uniqueOptionIds = [...new Set(optionIds)];

      if (
        uniqueOptionIds.length < 1 ||
        uniqueOptionIds.length !== optionIds.length ||
        uniqueOptionIds.some((optionId) => !allowedOptionIds.has(optionId))
      ) {
        return {
          ok: false,
          error: 'invalid_option',
          status: 422,
          field: question.questionId,
        };
      }

      uniqueOptionIds.forEach((optionId) => {
        rows.push({
          response_id: responseId,
          question_id: question.questionId,
          option_id: optionId,
          text_answer: null,
        });
      });

      continue;
    }

    const textAnswer = normalizeTextAnswer(answer.textAnswer);

    if (!textAnswer) {
      return {
        ok: false,
        error: 'missing_answer',
        status: 422,
        field: question.questionId,
      };
    }

    if (textAnswer.length > COMMUNITY_SURVEY_TEXT_MAX_LENGTH) {
      return {
        ok: false,
        error: 'text_answer_too_long',
        status: 422,
        field: question.questionId,
      };
    }

    rows.push({
      response_id: responseId,
      question_id: question.questionId,
      option_id: null,
      text_answer: textAnswer,
    });
  }

  return {
    ok: true,
    rows,
  };
};

export async function submitCommunitySurveyResponse({
  surveyKey,
  surveyDocumentId,
  language,
  answers,
  cookies,
}: {
  surveyKey: string;
  surveyDocumentId?: string | null;
  language?: CommunitySurveyLanguage | null;
  answers: unknown;
  cookies: SurveyCookies;
}): Promise<
  | { ok: true; responseId: string; submittedAt: string | null }
  | { ok: false; error: string; status: number; field?: string }
> {
  const survey = await getOpenCommunitySurveyByKey(surveyKey, {
    language,
    surveyDocumentId,
  });

  if (!survey) {
    return { ok: false, error: 'survey_not_found', status: 404 };
  }

  const identity = getCommunitySurveyGuestIdentity(cookies);

  if (!identity) {
    return { ok: false, error: 'anonymous_identity_unavailable', status: 500 };
  }

  const { data: existingResponse, error: existingError } = await supabaseAdmin
    .from('community_survey_responses')
    .select('id, submitted_at')
    .eq('survey_key', survey.surveyKey)
    .eq('respondent_token_hash', identity.tokenHash)
    .maybeSingle();

  if (existingError) {
    logApiError('community-surveys.existing-response', existingError);

    return { ok: false, error: 'survey_submit_failed', status: 500 };
  }

  if (existingResponse) {
    return {
      ok: false,
      error: 'already_submitted',
      status: 409,
      field: (existingResponse as SurveyResponseRow).id,
    };
  }

  const provisionalValidation = validateSubmittedAnswers(
    survey,
    answers,
    '00000000-0000-4000-8000-000000000000'
  );

  if (!provisionalValidation.ok) {
    return provisionalValidation;
  }

  const { data: response, error: insertResponseError } = await supabaseAdmin
    .from('community_survey_responses')
    .insert({
      survey_key: survey.surveyKey,
      survey_document_id: survey._id,
      survey_language: survey.language,
      respondent_token_hash: identity.tokenHash,
    })
    .select('id, submitted_at')
    .single();

  if (insertResponseError) {
    if (insertResponseError.code === '23505') {
      return { ok: false, error: 'already_submitted', status: 409 };
    }

    logApiError('community-surveys.insert-response', insertResponseError);

    return { ok: false, error: 'survey_submit_failed', status: 500 };
  }

  const insertedResponse = response as SurveyResponseRow;
  const finalValidation = validateSubmittedAnswers(
    survey,
    answers,
    insertedResponse.id
  );

  if (!finalValidation.ok) {
    await supabaseAdmin
      .from('community_survey_responses')
      .delete()
      .eq('id', insertedResponse.id);

    return finalValidation;
  }

  const { error: insertAnswersError } = await supabaseAdmin
    .from('community_survey_answers')
    .insert(finalValidation.rows);

  if (insertAnswersError) {
    logApiError('community-surveys.insert-answers', insertAnswersError);

    await supabaseAdmin
      .from('community_survey_responses')
      .delete()
      .eq('id', insertedResponse.id);

    return { ok: false, error: 'survey_submit_failed', status: 500 };
  }

  return {
    ok: true,
    responseId: insertedResponse.id,
    submittedAt: insertedResponse.submitted_at || null,
  };
}
