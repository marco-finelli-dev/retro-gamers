import { createHash, randomBytes, randomInt } from 'node:crypto';
import { urlFor } from './image';
import {
  MAX_QUESTIONS_PER_ATTEMPT,
  getQuizQuestionsPerAttempt,
  type QuizLanguage,
  type QuizRuntime,
  type QuizRuntimeQuestion,
} from './quiz';
import { supabaseAdmin } from './supabase/server';

export type AttemptSnapshot = {
  id: string;
  quiz_key: string;
  quiz_document_id: string;
  quiz_slug: string;
  quiz_language: string;
  mode: string;
  status: string;
  question_order: unknown;
  current_question_index: number;
  current_question_started_at: string | null;
  time_limit_seconds: number;
  correct_count: number;
  total_questions: number;
  total_elapsed_ms: number;
  expires_at: string;
  user_id: string | null;
  guest_token_hash: string | null;
};

type AnswerKeyRow = {
  question_id: string;
  correct_answer_id: string;
};

type QuizCookies = {
  get: (name: string) => { value?: string } | undefined;
  set?: (name: string, value: string, options: Record<string, unknown>) => void;
};

export const QUIZ_GUEST_COOKIE_NAME = 'rg_quiz_guest';
export const TECHNICAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const QUIZ_GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

export const isTechnicalId = (value: unknown) =>
  typeof value === 'string' && TECHNICAL_ID_PATTERN.test(value.trim());

export const isUuid = (value: unknown) =>
  typeof value === 'string' && UUID_PATTERN.test(value.trim());

export const normalizeLanguage = (value: unknown): QuizLanguage | null => {
  if (value === 'it' || value === 'en') return value;
  return null;
};

export const normalizeSlug = (value: unknown) => {
  const slug = String(value || '').trim();

  return isTechnicalId(slug) ? slug : '';
};

const getQuizGuestCookieOptions = () => ({
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
  maxAge: QUIZ_GUEST_COOKIE_MAX_AGE,
});

const createQuizGuestToken = () => randomBytes(32).toString('base64url');

const isValidQuizGuestToken = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{32,96}$/.test(value);

const hashQuizGuestToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const getQuizGuestIdentity = (
  cookies: QuizCookies,
  { createIfMissing = true } = {}
) => {
  const existingToken = cookies.get(QUIZ_GUEST_COOKIE_NAME)?.value || '';

  if (!isValidQuizGuestToken(existingToken) && !createIfMissing) {
    return null;
  }

  const token = isValidQuizGuestToken(existingToken)
    ? existingToken
    : createQuizGuestToken();

  if (token !== existingToken && cookies.set) {
    cookies.set(QUIZ_GUEST_COOKIE_NAME, token, getQuizGuestCookieOptions());
  }

  return {
    tokenHash: hashQuizGuestToken(token),
  };
};

export const getQuestionOrder = (quiz: QuizRuntime) => {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];

  return questions
    .map((question) => String(question.questionId || '').trim())
    .filter(Boolean);
};

export const getVisibleAnswerIds = (question: QuizRuntimeQuestion) => {
  const answers = Array.isArray(question.answers) ? question.answers : [];

  return answers
    .map((answer) => String(answer.answerId || '').trim())
    .filter(Boolean);
};

const isValidRuntimeQuestion = (question: QuizRuntimeQuestion | null | undefined) => {
  if (!question) return false;

  const questionId = String(question.questionId || '').trim();

  if (question.questionId !== questionId || !isTechnicalId(questionId)) {
    return false;
  }

  if (!String(question.text || '').trim()) {
    return false;
  }

  const answers = Array.isArray(question.answers) ? question.answers : [];
  const answerIds = getVisibleAnswerIds(question);

  return (
    answers.length === 4 &&
    answerIds.length === 4 &&
    new Set(answerIds).size === answerIds.length &&
    answers.every((answer) => {
      const answerId = String(answer.answerId || '').trim();

      return (
        answer.answerId === answerId &&
        isTechnicalId(answerId) &&
        Boolean(String(answer.text || '').trim())
      );
    })
  );
};

const getRuntimeQuestionMap = (quiz: QuizRuntime) => {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];

  return new Map(
    questions
      .map((question) => [String(question.questionId || '').trim(), question] as const)
      .filter(([questionId]) => Boolean(questionId))
  );
};

export const validateQuizSnapshot = (
  quiz: QuizRuntime | null,
  language: QuizLanguage
): (
  | { ok: true; questionOrder: string[]; questionsPerAttempt: number }
  | { ok: false; error: 'quiz_not_found' | 'quiz_not_ready'; status: number; details: string }
) => {
  if (!quiz) {
    return {
      ok: false,
      error: 'quiz_not_found',
      status: 404,
      details: 'missing_quiz',
    };
  }

  if (
    quiz.language !== language ||
    !isTechnicalId(quiz.quizKey) ||
    !isTechnicalId(quiz.slug) ||
    !Number.isInteger(quiz.timeLimitSeconds) ||
    Number(quiz.timeLimitSeconds) < 5 ||
    Number(quiz.timeLimitSeconds) > 120
  ) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'invalid_quiz_identity',
    };
  }

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const questionOrder = getQuestionOrder(quiz);
  const questionsPerAttempt = getQuizQuestionsPerAttempt(quiz);

  if (questions.length < 1 || questionOrder.length !== questions.length) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'invalid_question_order',
    };
  }

  if (new Set(questionOrder).size !== questionOrder.length) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'duplicate_question_id',
    };
  }

  const invalidQuestion = questions.find((question) => !isValidRuntimeQuestion(question));

  if (invalidQuestion) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'invalid_question',
    };
  }

  if (
    !Number.isInteger(questionsPerAttempt) ||
    questionsPerAttempt < 1 ||
    questionsPerAttempt > MAX_QUESTIONS_PER_ATTEMPT ||
    questionsPerAttempt > questions.length
  ) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'invalid_questions_per_attempt',
    };
  }

  return {
    ok: true,
    questionOrder,
    questionsPerAttempt,
  };
};

export const selectQuestionOrderForAttempt = (
  questionOrder: string[],
  questionsPerAttempt: number
) => {
  if (questionsPerAttempt >= questionOrder.length) {
    return [...questionOrder];
  }

  const shuffled = [...questionOrder];

  for (let index = 0; index < questionsPerAttempt; index += 1) {
    const swapIndex = randomInt(index, shuffled.length);
    const currentQuestionId = shuffled[index];

    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = currentQuestionId;
  }

  return shuffled.slice(0, questionsPerAttempt);
};

export const preflightAnswerKeys = async (quiz: QuizRuntime, questionOrder: string[]) => {
  const { data, error } = await supabaseAdmin
    .from('quiz_answer_keys')
    .select('question_id, correct_answer_id')
    .eq('quiz_key', quiz.quizKey);

  if (error) {
    console.warn('Quiz answer key preflight failed:', {
      quizKey: quiz.quizKey,
      quizId: quiz._id,
      code: error.code,
      message: error.message,
    });

    return {
      ok: false,
      reason: 'answer_key_query_failed',
    };
  }

  const keys = new Map(
    ((data || []) as AnswerKeyRow[]).map((row) => [row.question_id, row.correct_answer_id])
  );
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const invalidQuestionIds: string[] = [];
  const missingQuestionIds: string[] = [];

  for (const questionId of questionOrder) {
    const question = questions.find((item) => item.questionId === questionId);
    const correctAnswerId = keys.get(questionId);

    if (!correctAnswerId) {
      missingQuestionIds.push(questionId);
      continue;
    }

    if (!getVisibleAnswerIds(question || {}).includes(correctAnswerId)) {
      invalidQuestionIds.push(questionId);
    }
  }

  if (missingQuestionIds.length > 0 || invalidQuestionIds.length > 0) {
    console.warn('Quiz answer key preflight rejected start:', {
      quizKey: quiz.quizKey,
      quizId: quiz._id,
      missingQuestionIds,
      invalidQuestionIds,
    });

    return {
      ok: false,
      reason: 'answer_key_mismatch',
    };
  }

  return {
    ok: true,
  };
};

export const parseRpcJson = (value: unknown) => {
  if (typeof value !== 'string') return value as Record<string, unknown> | null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const getRpcIntegerOrNull = (value: unknown) => {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
};

export const getRpcTimestampOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;

  const timestamp = value.trim();

  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
};

export const getStartFailureResponse = (error: unknown) => {
  if (
    error === 'invalid_quiz_key' ||
    error === 'invalid_quiz_language' ||
    error === 'invalid_time_limit' ||
    error === 'invalid_question_order'
  ) {
    return {
      error: 'quiz_not_ready',
      status: 503,
    };
  }

  return {
    error: 'start_failed',
    status: 500,
  };
};

export const getAnswerFailureResponse = (error: unknown) => {
  if (
    error === 'invalid_question_id' ||
    error === 'missing_answer' ||
    error === 'invalid_answer_id'
  ) {
    return { error, status: 400 };
  }

  if (error === 'invalid_attempt') {
    return { error, status: 404 };
  }

  if (error === 'attempt_expired') {
    return { error, status: 410 };
  }

  if (
    error === 'already_answered' ||
    error === 'attempt_completed' ||
    error === 'attempt_abandoned' ||
    error === 'attempt_not_active' ||
    error === 'question_not_started' ||
    error === 'wrong_question'
  ) {
    return { error, status: 409 };
  }

  if (error === 'missing_answer_key') {
    return { error, status: 503 };
  }

  return {
    error: 'answer_failed',
    status: 500,
  };
};

export const getStartQuestionFailureResponse = (
  error: unknown,
  fallbackError = 'next_failed'
) => {
  if (error === 'invalid_attempt') {
    return { error, status: 404 };
  }

  if (error === 'attempt_expired') {
    return { error, status: 410 };
  }

  if (
    error === 'attempt_completed' ||
    error === 'attempt_abandoned' ||
    error === 'attempt_not_active'
  ) {
    return { error, status: 409 };
  }

  return {
    error: fallbackError,
    status: 500,
  };
};

export const normalizeQuestionOrder = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeQuestionOrder(parsed);
    } catch {
      return [];
    }
  }

  return [];
};

const createdActions = new Set([
  'created_official',
  'created_training',
  'created_guest',
]);

export const getAttemptRuntimeCompatibility = (
  attempt: AttemptSnapshot,
  quiz: QuizRuntime,
  runtimeQuestionOrder: string[],
  action: unknown
) => {
  const attemptQuestionOrder = normalizeQuestionOrder(attempt.question_order);
  const mismatches: string[] = [];
  const isCreatedAttempt = typeof action === 'string' && createdActions.has(action);
  const runtimeQuestionIdSet = new Set(runtimeQuestionOrder);
  const runtimeQuestionMap = getRuntimeQuestionMap(quiz);
  const expectedQuestionsPerAttempt = getQuizQuestionsPerAttempt(quiz);

  if (attempt.quiz_document_id !== quiz._id) mismatches.push('quiz_document_id');
  if (attempt.quiz_key !== quiz.quizKey) mismatches.push('quiz_key');
  if (attempt.quiz_language !== quiz.language) mismatches.push('quiz_language');
  if (attemptQuestionOrder.length !== Number(attempt.total_questions)) {
    mismatches.push('question_order_length');
  }
  if (new Set(attemptQuestionOrder).size !== attemptQuestionOrder.length) {
    mismatches.push('question_order_duplicates');
  }
  if (attemptQuestionOrder.some((questionId) => !runtimeQuestionIdSet.has(questionId))) {
    mismatches.push('question_order_unknown_question');
  }
  if (
    attemptQuestionOrder.some((questionId) =>
      !isValidRuntimeQuestion(runtimeQuestionMap.get(questionId))
    )
  ) {
    mismatches.push('question_order_invalid_question');
  }
  if (
    isCreatedAttempt &&
    attemptQuestionOrder.length !== expectedQuestionsPerAttempt
  ) {
    mismatches.push('questions_per_attempt');
  }
  if (Number(attempt.time_limit_seconds) !== Number(quiz.timeLimitSeconds)) {
    mismatches.push('time_limit_seconds');
  }
  if (isCreatedAttempt && attempt.quiz_slug !== quiz.slug) {
    mismatches.push('quiz_slug');
  }

  return {
    ok: mismatches.length === 0,
    attemptQuestionOrder,
    isCreatedAttempt,
    slugChanged: !isCreatedAttempt && attempt.quiz_slug !== quiz.slug,
    mismatches,
  };
};

export const getQuestionImage = (question: QuizRuntimeQuestion) => {
  if (!question.image?.asset) return null;

  return {
    url: urlFor(question.image)
      .width(960)
      .height(540)
      .fit('crop')
      .quality(76)
      .auto('format')
      .url(),
    alt: String(question.image.alt || '').trim(),
  };
};

export const getPublicQuestion = (quiz: QuizRuntime, questionId: string) => {
  const question = (quiz.questions || []).find((item) => item.questionId === questionId);

  if (!question) return null;

  return {
    questionId: question.questionId,
    text: question.text,
    image: getQuestionImage(question),
    answers: (question.answers || []).map((answer) => ({
      answerId: answer.answerId,
      text: answer.text,
    })),
  };
};

export const getQuestionTimerState = (
  startedAt: string | null | undefined,
  timeLimitSeconds: number
) => {
  if (!startedAt) {
    return {
      remainingMs: 0,
      questionExpired: false,
    };
  }

  const startedAtMs = new Date(startedAt).getTime();
  const limitMs = Math.max(0, Number(timeLimitSeconds || 0) * 1000);

  if (!Number.isFinite(startedAtMs) || limitMs <= 0) {
    return {
      remainingMs: 0,
      questionExpired: true,
    };
  }

  const remainingMs = Math.max(0, limitMs - Math.max(0, Date.now() - startedAtMs));

  return {
    remainingMs,
    questionExpired: remainingMs === 0,
  };
};

export const getTimerState = (attempt: AttemptSnapshot) =>
  getQuestionTimerState(attempt.current_question_started_at, attempt.time_limit_seconds);

export const getAttemptPublicState = (attempt: AttemptSnapshot) => ({
  attemptId: attempt.id,
  mode: attempt.mode,
  status: attempt.status,
  quizKey: attempt.quiz_key,
  quizLanguage: attempt.quiz_language,
  currentQuestionIndex: attempt.current_question_index,
  currentQuestionStartedAt: attempt.current_question_started_at,
  timeLimitSeconds: attempt.time_limit_seconds,
  totalQuestions: attempt.total_questions,
  correctCount: attempt.correct_count,
  totalElapsedMs: attempt.total_elapsed_ms,
  expiresAt: attempt.expires_at,
});

export const fetchAttemptSnapshot = async (attemptId: string) =>
  supabaseAdmin
    .from('quiz_attempts')
    .select(`
      id,
      quiz_key,
      quiz_document_id,
      quiz_slug,
      quiz_language,
      mode,
      status,
      question_order,
      current_question_index,
      current_question_started_at,
      time_limit_seconds,
      correct_count,
      total_questions,
      total_elapsed_ms,
      expires_at,
      user_id,
      guest_token_hash
    `)
    .eq('id', attemptId)
    .maybeSingle();

export const validateAttemptOwnership = ({
  attempt,
  userId,
  guestTokenHash,
}: {
  attempt: AttemptSnapshot;
  userId: string | null;
  guestTokenHash: string | null;
}) =>
  userId
    ? attempt.user_id === userId && ['official', 'training'].includes(attempt.mode)
    : (
        attempt.user_id === null &&
        attempt.mode === 'guest' &&
        attempt.guest_token_hash === guestTokenHash
      );

export const getNonPlayableAttemptError = (status: string) => {
  if (status === 'active') return null;
  if (status === 'completed') return { error: 'attempt_completed', status: 409 };
  if (status === 'abandoned') return { error: 'attempt_abandoned', status: 409 };
  if (status === 'expired') return { error: 'attempt_expired', status: 410 };

  return { error: 'attempt_not_active', status: 409 };
};
