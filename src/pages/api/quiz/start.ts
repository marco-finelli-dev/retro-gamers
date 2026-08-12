import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { urlFor } from '../../../lib/image';
import {
  getPublishedQuizRuntimeBySlug,
  getQuizUrl,
  type QuizLanguage,
  type QuizRuntime,
  type QuizRuntimeQuestion,
} from '../../../lib/quiz';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type StartPayload = {
  slug?: string;
  language?: string;
};

type AttemptSnapshot = {
  id: string;
  quiz_key: string;
  quiz_document_id: string;
  quiz_slug: string;
  quiz_language: string;
  mode: string;
  status: string;
  question_order: unknown;
  current_question_index: number;
  current_question_started_at: string;
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

const QUIZ_GUEST_COOKIE_NAME = 'rg_quiz_guest';
const QUIZ_GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const TECHNICAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

const isTechnicalId = (value: unknown) =>
  typeof value === 'string' && TECHNICAL_ID_PATTERN.test(value.trim());

const normalizeLanguage = (value: unknown): QuizLanguage | null => {
  if (value === 'it' || value === 'en') return value;
  return null;
};

const normalizeSlug = (value: unknown) => {
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

const getQuizGuestIdentity = (cookies: {
  get: (name: string) => { value?: string } | undefined;
  set: (name: string, value: string, options: Record<string, unknown>) => void;
}) => {
  const existingToken = cookies.get(QUIZ_GUEST_COOKIE_NAME)?.value || '';
  const token = isValidQuizGuestToken(existingToken)
    ? existingToken
    : createQuizGuestToken();

  if (token !== existingToken) {
    cookies.set(QUIZ_GUEST_COOKIE_NAME, token, getQuizGuestCookieOptions());
  }

  return {
    tokenHash: hashQuizGuestToken(token),
  };
};

const getQuestionOrder = (quiz: QuizRuntime) => {
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];

  return questions
    .map((question) => String(question.questionId || '').trim())
    .filter(Boolean);
};

const getVisibleAnswerIds = (question: QuizRuntimeQuestion) => {
  const answers = Array.isArray(question.answers) ? question.answers : [];

  return answers
    .map((answer) => String(answer.answerId || '').trim())
    .filter(Boolean);
};

const validateQuizSnapshot = (quiz: QuizRuntime | null, language: QuizLanguage) => {
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

  const invalidQuestion = questions.find((question) => {
    if (!isTechnicalId(question.questionId) || !String(question.text || '').trim()) {
      return true;
    }

    const answers = Array.isArray(question.answers) ? question.answers : [];
    const answerIds = getVisibleAnswerIds(question);

    return (
      answers.length !== 4 ||
      answerIds.length !== 4 ||
      new Set(answerIds).size !== answerIds.length ||
      answers.some((answer) => !isTechnicalId(answer.answerId) || !String(answer.text || '').trim())
    );
  });

  if (invalidQuestion) {
    return {
      ok: false,
      error: 'quiz_not_ready',
      status: 503,
      details: 'invalid_question',
    };
  }

  return {
    ok: true,
    questionOrder,
  };
};

const preflightAnswerKeys = async (quiz: QuizRuntime, questionOrder: string[]) => {
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

const parseRpcJson = (value: unknown) => {
  if (typeof value !== 'string') return value as Record<string, unknown> | null;

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getStartFailureResponse = (error: unknown) => {
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

const normalizeQuestionOrder = (value: unknown): string[] => {
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

const areQuestionOrdersEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((questionId, index) => questionId === right[index]);

const createdActions = new Set([
  'created_official',
  'created_training',
  'created_guest',
]);

const getAttemptRuntimeCompatibility = (
  attempt: AttemptSnapshot,
  quiz: QuizRuntime,
  runtimeQuestionOrder: string[],
  action: unknown
) => {
  const attemptQuestionOrder = normalizeQuestionOrder(attempt.question_order);
  const mismatches: string[] = [];
  const isCreatedAttempt = typeof action === 'string' && createdActions.has(action);

  if (attempt.quiz_document_id !== quiz._id) mismatches.push('quiz_document_id');
  if (attempt.quiz_key !== quiz.quizKey) mismatches.push('quiz_key');
  if (attempt.quiz_language !== quiz.language) mismatches.push('quiz_language');
  if (!areQuestionOrdersEqual(attemptQuestionOrder, runtimeQuestionOrder)) {
    mismatches.push('question_order');
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

const getQuestionImage = (question: QuizRuntimeQuestion) => {
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

const getPublicQuestion = (quiz: QuizRuntime, questionId: string) => {
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

const getTimerState = (attempt: AttemptSnapshot) => {
  const startedAtMs = new Date(attempt.current_question_started_at).getTime();
  const limitMs = Math.max(0, Number(attempt.time_limit_seconds || 0) * 1000);

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

const getAttemptPublicState = (attempt: AttemptSnapshot) => ({
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

const fetchAttemptSnapshot = async (attemptId: string) =>
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

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: StartPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const slug = normalizeSlug(payload.slug);
  const language = normalizeLanguage(payload.language);

  if (!slug || !language) {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const quiz = await getPublishedQuizRuntimeBySlug(slug, language);
    const quizValidation = validateQuizSnapshot(quiz, language);

    if (!quizValidation.ok || !quiz) {
      if (quizValidation.error === 'quiz_not_ready') {
        console.warn('Quiz snapshot preflight rejected start:', {
          slug,
          language,
          details: quizValidation.details,
        });
      }

      return json({ ok: false, error: quizValidation.error }, quizValidation.status);
    }

    const answerKeyPreflight = await preflightAnswerKeys(quiz, quizValidation.questionOrder);

    if (!answerKeyPreflight.ok) {
      return json({ ok: false, error: 'quiz_not_ready' }, 503);
    }

    const session = await getUserSessionFromCookies(cookies);

    if (session.user?.id && (session.error || !session.profile)) {
      return json({ ok: false, error: 'invalid_request' }, session.status || 401);
    }

    const userId = session.user?.id || null;
    const guestIdentity = userId ? null : getQuizGuestIdentity(cookies);

    const { data: startData, error: startError } = await supabaseAdmin.rpc(
      'start_or_resume_quiz',
      {
        p_quiz_key: quiz.quizKey,
        p_quiz_document_id: quiz._id,
        p_quiz_slug: quiz.slug,
        p_quiz_language: language,
        p_question_order: quizValidation.questionOrder,
        p_time_limit_seconds: quiz.timeLimitSeconds,
        p_user_id: userId,
        p_guest_token_hash: guestIdentity?.tokenHash || null,
      }
    );

    if (startError) {
      console.error('Quiz start RPC failed:', {
        quizKey: quiz.quizKey,
        quizId: quiz._id,
        code: startError.code,
        message: startError.message,
      });

      return json({ ok: false, error: 'start_failed' }, 500);
    }

    const startResult = parseRpcJson(startData);

    if (!startResult?.ok || !startResult.attemptId) {
      const failure = getStartFailureResponse(startResult?.error);

      console.warn('Quiz start RPC rejected request:', {
        quizKey: quiz.quizKey,
        quizId: quiz._id,
        error: startResult?.error || 'invalid_rpc_response',
      });

      return json({ ok: false, error: failure.error }, failure.status);
    }

    const { data: attemptData, error: attemptError } =
      await fetchAttemptSnapshot(String(startResult.attemptId));

    if (attemptError) {
      console.error('Quiz attempt snapshot fetch failed:', {
        quizKey: quiz.quizKey,
        attemptId: startResult.attemptId,
        code: attemptError.code,
        message: attemptError.message,
      });

      return json({ ok: false, error: 'attempt_not_found' }, 500);
    }

    const attempt = attemptData as AttemptSnapshot | null;

    if (!attempt) {
      return json({ ok: false, error: 'attempt_not_found' }, 500);
    }

    const ownsAttempt = userId
      ? attempt.user_id === userId && ['official', 'training'].includes(attempt.mode)
      : (
          attempt.user_id === null &&
          attempt.mode === 'guest' &&
          attempt.guest_token_hash === guestIdentity?.tokenHash
        );

    if (!ownsAttempt) {
      console.error('Quiz attempt ownership mismatch:', {
        quizKey: quiz.quizKey,
        attemptId: attempt.id,
        mode: attempt.mode,
        authenticated: Boolean(userId),
      });

      return json({ ok: false, error: 'attempt_ownership_error' }, 403);
    }

    if (attempt.quiz_language !== language) {
      const resumeLanguage = normalizeLanguage(attempt.quiz_language) || 'it';

      return json({
        ok: true,
        action: startResult.action || null,
        ...getAttemptPublicState(attempt),
        redirectRequired: true,
        resumeUrl: getQuizUrl(
          {
            slug: attempt.quiz_slug,
            language: resumeLanguage,
          },
          resumeLanguage
        ),
      });
    }

    const compatibility = getAttemptRuntimeCompatibility(
      attempt,
      quiz,
      quizValidation.questionOrder,
      startResult.action
    );

    if (!compatibility.ok) {
      console.error('Quiz attempt snapshot is incompatible with loaded runtime:', {
        quizKey: attempt.quiz_key,
        quizDocumentId: attempt.quiz_document_id,
        attemptId: attempt.id,
        action: startResult.action || null,
        mismatches: compatibility.mismatches,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    if (compatibility.slugChanged) {
      console.warn('Quiz attempt resumed with a stale slug snapshot:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        snapshotSlug: attempt.quiz_slug,
        currentSlug: quiz.slug,
      });
    }

    const attemptQuestionOrder = compatibility.attemptQuestionOrder;
    const currentQuestionId = attemptQuestionOrder[attempt.current_question_index];
    const question = currentQuestionId
      ? getPublicQuestion(quiz, currentQuestionId)
      : null;

    if (
      attempt.status !== 'active' ||
      !currentQuestionId ||
      attemptQuestionOrder.length !== attempt.total_questions ||
      !question
    ) {
      console.error('Quiz attempt state cannot resolve current question:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        status: attempt.status,
        currentQuestionIndex: attempt.current_question_index,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    return json({
      ok: true,
      action: startResult.action || null,
      ...getAttemptPublicState(attempt),
      redirectRequired: false,
      ...getTimerState(attempt),
      question,
    });
  } catch (error) {
    console.error('Quiz start endpoint failed:', {
      message: error instanceof Error ? error.message : String(error),
    });

    return json({ ok: false, error: 'start_failed' }, 500);
  }
};

export const GET: APIRoute = async () =>
  json({ ok: false, error: 'invalid_request' }, 405);
