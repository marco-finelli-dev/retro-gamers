import { createHash, randomBytes } from 'node:crypto';
import { logApiError } from './api-errors';
import { getPublishedReadClient } from './sanity';
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

export type CommunitySurveyImage = {
  alt?: string;
  crop?: Record<string, unknown>;
  hotspot?: Record<string, unknown>;
  asset?: {
    _id?: string;
    url?: string;
  };
};

export type CommunitySurveyPublic = {
  _id: string;
  title: string;
  slug: string;
  language: CommunitySurveyLanguage;
  surveyKey: string;
  description?: string;
  excerpt?: string;
  cardImage?: CommunitySurveyImage;
  status: CommunitySurveyStatus;
  questions: CommunitySurveyQuestion[];
  translatedVersion?: CommunitySurveyTranslation | null;
  translatedVersions?: CommunitySurveyTranslation[];
};

export type CommunitySurveyResponseState = {
  hasResponded: boolean;
  submittedAt: string | null;
};

export type CommunitySurveyChoiceResult = CommunitySurveyOption & {
  count: number;
  percentage: number;
};

export type CommunitySurveyTextAnswerResult = {
  id: string;
  responseId: string;
  text: string;
  submittedAt: string | null;
  createdAt: string | null;
};

export type CommunitySurveyQuestionResult = {
  questionId: string;
  text: string;
  type: CommunitySurveyQuestionType;
  responseCount: number;
  answerCount: number;
  options: CommunitySurveyChoiceResult[];
  textAnswers: CommunitySurveyTextAnswerResult[];
};

export type CommunitySurveyAdminResults = {
  survey: CommunitySurveyPublic;
  surveys: CommunitySurveyPublic[];
  totalResponses: number;
  languageCounts: Record<CommunitySurveyLanguage, number>;
  latestResponseAt: string | null;
  questions: CommunitySurveyQuestionResult[];
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

type SurveyAdminResponseRow = SurveyResponseRow & {
  survey_language?: string | null;
};

type SurveyAdminAnswerRow = {
  id: string;
  response_id: string;
  question_id: string;
  option_id: string | null;
  text_answer: string | null;
  created_at: string | null;
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
  excerpt,
  cardImage {
    asset->{ _id, url },
    crop,
    hotspot,
    alt
  },
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

const communitySurveyAdminFilter = `
  _type == "communitySurvey" &&
  surveyKey == $surveyKey &&
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

const normalizeSurveyImage = (image: unknown): CommunitySurveyImage | undefined => {
  const value = image as CommunitySurveyImage | null;

  if (!value || typeof value !== 'object' || !value.asset) return undefined;
  if (!value.asset._id && !value.asset.url) return undefined;

  return {
    asset: value.asset,
    crop: value.crop,
    hotspot: value.hotspot,
    alt: String(value.alt || '').trim(),
  };
};

const normalizeCommunitySurvey = (
  survey: unknown,
  { requireOpen = true } = {}
): CommunitySurveyPublic | null => {
  const value = survey as Partial<CommunitySurveyPublic> | null;
  const _id = String(value?._id || '').trim();
  const title = String(value?.title || '').trim();
  const slug = normalizeCommunitySurveySlug(value?.slug);
  const language = normalizeCommunitySurveyLanguage(value?.language);
  const surveyKey = normalizeTechnicalId(value?.surveyKey);
  const status = value?.status;
  const cardImage = normalizeSurveyImage(value?.cardImage);

  if (
    !_id ||
    !title ||
    !slug ||
    !language ||
    !surveyKey ||
    (status !== 'draft' && status !== 'open' && status !== 'closed') ||
    (requireOpen && status !== 'open')
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
    excerpt: String(value?.excerpt || '').trim(),
    cardImage,
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

  const data = await getPublishedReadClient().fetch(
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

export async function getOpenCommunitySurveyForLanguage(
  language: CommunitySurveyLanguage = 'it'
): Promise<CommunitySurveyPublic | null> {
  const normalizedLanguage = normalizeCommunitySurveyLanguage(language) || 'it';

  const data = await getPublishedReadClient().fetch(
    `
      *[
        ${openCommunitySurveyFilter} &&
        language == $language
      ] | order(_createdAt desc)[0] {
        ${communitySurveyFields}
      }
    `,
    { language: normalizedLanguage }
  );

  return normalizeCommunitySurvey(data);
}

export async function getCommunitySurveyAdminDocumentsByKey(
  surveyKey: string
): Promise<CommunitySurveyPublic[]> {
  const normalizedSurveyKey = normalizeTechnicalId(surveyKey);

  if (!normalizedSurveyKey) return [];

  const data = await getPublishedReadClient().fetch(
    `
      *[
        ${communitySurveyAdminFilter}
      ] | order(language desc, _createdAt desc) {
        ${communitySurveyFields}
      }
    `,
    { surveyKey: normalizedSurveyKey }
  );

  return (Array.isArray(data) ? data : [])
    .map((survey) => normalizeCommunitySurvey(survey, { requireOpen: false }))
    .filter(Boolean) as CommunitySurveyPublic[];
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

  const data = await getPublishedReadClient().fetch(
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

const roundPercentage = (value: number) => {
  if (!Number.isFinite(value)) return 0;

  return Math.round(value * 10) / 10;
};

const getPrimarySurveyDocument = (surveys: CommunitySurveyPublic[]) =>
  surveys.find((survey) => survey.language === 'it') || surveys[0] || null;

export async function getCommunitySurveyAdminResults(
  surveyKey: string
): Promise<
  | { ok: true; results: CommunitySurveyAdminResults }
  | { ok: false; error: 'invalid_survey_key' | 'survey_not_found' | 'results_unavailable'; details?: string }
> {
  const normalizedSurveyKey = normalizeTechnicalId(surveyKey);

  if (!normalizedSurveyKey) {
    return { ok: false, error: 'invalid_survey_key' };
  }

  const surveys = await getCommunitySurveyAdminDocumentsByKey(normalizedSurveyKey);
  const survey = getPrimarySurveyDocument(surveys);

  if (!survey) {
    return { ok: false, error: 'survey_not_found' };
  }

  const { data: responseData, error: responsesError } = await supabaseAdmin
    .from('community_survey_responses')
    .select('id, survey_language, submitted_at')
    .eq('survey_key', normalizedSurveyKey)
    .order('submitted_at', { ascending: false });

  if (responsesError) {
    logApiError('community-surveys.admin-responses', responsesError);

    return {
      ok: false,
      error: 'results_unavailable',
      details: responsesError.message,
    };
  }

  const responses = (responseData || []) as SurveyAdminResponseRow[];
  const responseIds = responses
    .map((response) => String(response.id || '').trim())
    .filter(Boolean);
  const responseMap = new Map(responses.map((response) => [response.id, response]));
  const languageCounts: Record<CommunitySurveyLanguage, number> = {
    it: 0,
    en: 0,
  };

  responses.forEach((response) => {
    const language = normalizeCommunitySurveyLanguage(response.survey_language);

    if (language) {
      languageCounts[language] += 1;
    }
  });

  let answers: SurveyAdminAnswerRow[] = [];

  if (responseIds.length > 0) {
    const { data: answerData, error: answersError } = await supabaseAdmin
      .from('community_survey_answers')
      .select('id, response_id, question_id, option_id, text_answer, created_at')
      .in('response_id', responseIds)
      .order('created_at', { ascending: false });

    if (answersError) {
      logApiError('community-surveys.admin-answers', answersError);

      return {
        ok: false,
        error: 'results_unavailable',
        details: answersError.message,
      };
    }

    answers = (answerData || []) as SurveyAdminAnswerRow[];
  }

  const totalResponses = responses.length;
  const questions = survey.questions.map((question): CommunitySurveyQuestionResult => {
    const questionAnswers = answers.filter(
      (answer) => answer.question_id === question.questionId
    );

    if (question.type === 'text') {
      const textAnswers = questionAnswers
        .map((answer) => {
          const text = String(answer.text_answer || '').trim();

          if (!text) return null;

          return {
            id: answer.id,
            responseId: answer.response_id,
            text,
            submittedAt: responseMap.get(answer.response_id)?.submitted_at || null,
            createdAt: answer.created_at || null,
          };
        })
        .filter(Boolean) as CommunitySurveyTextAnswerResult[];

      return {
        questionId: question.questionId,
        text: question.text,
        type: question.type,
        responseCount: textAnswers.length,
        answerCount: textAnswers.length,
        options: [],
        textAnswers,
      };
    }

    const counts = new Map<string, number>();

    questionAnswers.forEach((answer) => {
      const optionId = normalizeTechnicalId(answer.option_id);

      if (!optionId) return;

      counts.set(optionId, (counts.get(optionId) || 0) + 1);
    });

    const options = question.options.map((option) => {
      const count = counts.get(option.optionId) || 0;

      return {
        ...option,
        count,
        percentage: totalResponses > 0
          ? roundPercentage((count / totalResponses) * 100)
          : 0,
      };
    });

    return {
      questionId: question.questionId,
      text: question.text,
      type: question.type,
      responseCount: questionAnswers.length,
      answerCount: questionAnswers.length,
      options,
      textAnswers: [],
    };
  });

  return {
    ok: true,
    results: {
      survey,
      surveys,
      totalResponses,
      languageCounts,
      latestResponseAt: responses[0]?.submitted_at || null,
      questions,
    },
  };
}
