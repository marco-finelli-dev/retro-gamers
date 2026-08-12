import type { APIRoute } from 'astro';
import { getPublishedQuizRuntimeById } from '../../../lib/quiz';
import {
  fetchAttemptSnapshot,
  getAnswerFailureResponse,
  getAttemptRuntimeCompatibility,
  getNonPlayableAttemptError,
  getPublicQuestion,
  getQuizGuestIdentity,
  getVisibleAnswerIds,
  isTechnicalId,
  isUuid,
  json,
  normalizeLanguage,
  normalizeQuestionOrder,
  parseRpcJson,
  validateAttemptOwnership,
  validateQuizSnapshot,
  type AttemptSnapshot,
} from '../../../lib/quiz-server';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type AnswerPayload = {
  attemptId?: string;
  questionId?: string;
  answerId?: string | null;
};

const normalizeAttemptId = (value: unknown) => {
  const attemptId = String(value || '').trim();

  return isUuid(attemptId) ? attemptId : '';
};

const normalizeQuestionId = (value: unknown) => {
  const questionId = String(value || '').trim();

  return isTechnicalId(questionId) ? questionId : '';
};

const normalizeAnswerId = (value: unknown) => {
  if (value === null) return null;

  if (typeof value !== 'string') {
    return undefined;
  }

  const answerId = value.trim();

  return isTechnicalId(answerId) ? answerId : undefined;
};

const getRpcNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
};

const getRpcIntegerOrNull = (value: unknown) => {
  const number = Number(value);

  return Number.isInteger(number) ? number : null;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: AnswerPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const attemptId = normalizeAttemptId(payload.attemptId);
  const questionId = normalizeQuestionId(payload.questionId);
  const answerId = normalizeAnswerId(payload.answerId);

  if (!attemptId || !questionId || answerId === undefined) {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const { data: attemptData, error: attemptError } =
      await fetchAttemptSnapshot(attemptId);

    if (attemptError) {
      console.error('Quiz answer attempt fetch failed:', {
        attemptId,
        code: attemptError.code,
        message: attemptError.message,
      });

      return json({ ok: false, error: 'answer_failed' }, 500);
    }

    const attempt = attemptData as AttemptSnapshot | null;

    if (!attempt) {
      return json({ ok: false, error: 'attempt_not_found' }, 404);
    }

    const session = await getUserSessionFromCookies(cookies);

    if (session.user?.id && (session.error || !session.profile)) {
      return json({ ok: false, error: 'invalid_request' }, session.status || 401);
    }

    const userId = session.user?.id || null;
    const guestIdentity = userId
      ? null
      : getQuizGuestIdentity(cookies, { createIfMissing: false });
    const ownsAttempt = validateAttemptOwnership({
      attempt,
      userId,
      guestTokenHash: guestIdentity?.tokenHash || null,
    });

    if (!ownsAttempt) {
      console.error('Quiz answer ownership mismatch:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        mode: attempt.mode,
        authenticated: Boolean(userId),
      });

      return json({ ok: false, error: 'attempt_ownership_error' }, 403);
    }

    const terminalError = getNonPlayableAttemptError(attempt.status);

    if (terminalError) {
      return json({ ok: false, error: terminalError.error }, terminalError.status);
    }

    const attemptQuestionOrder = normalizeQuestionOrder(attempt.question_order);
    const expectedQuestionId = attemptQuestionOrder[attempt.current_question_index];

    if (
      !expectedQuestionId ||
      attempt.current_question_index < 0 ||
      attempt.current_question_index >= attempt.total_questions ||
      attemptQuestionOrder.length !== attempt.total_questions
    ) {
      return json({ ok: false, error: 'invalid_attempt' }, 409);
    }

    if (questionId !== expectedQuestionId) {
      return json({ ok: false, error: 'wrong_question' }, 409);
    }

    const attemptLanguage = normalizeLanguage(attempt.quiz_language);

    if (!attemptLanguage) {
      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const quiz = await getPublishedQuizRuntimeById(attempt.quiz_document_id);
    const quizValidation = validateQuizSnapshot(quiz, attemptLanguage);

    if (!quizValidation.ok || !quiz) {
      console.error('Quiz answer runtime preload failed:', {
        quizKey: attempt.quiz_key,
        quizDocumentId: attempt.quiz_document_id,
        attemptId: attempt.id,
        details: quizValidation.details,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const compatibility = getAttemptRuntimeCompatibility(
      attempt,
      quiz,
      quizValidation.questionOrder,
      'resumed_official'
    );

    if (!compatibility.ok) {
      console.error('Quiz answer attempt snapshot is incompatible with loaded runtime:', {
        quizKey: attempt.quiz_key,
        quizDocumentId: attempt.quiz_document_id,
        attemptId: attempt.id,
        mismatches: compatibility.mismatches,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const currentQuestion = getPublicQuestion(quiz, expectedQuestionId);

    if (!currentQuestion) {
      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    if (answerId !== null && !getVisibleAnswerIds(currentQuestion).includes(answerId)) {
      return json({ ok: false, error: 'invalid_answer_id' }, 400);
    }

    const { data: answerData, error: answerError } = await supabaseAdmin.rpc(
      'submit_quiz_answer',
      {
        p_attempt_id: attempt.id,
        p_question_id: questionId,
        p_answer_id: answerId,
      }
    );

    if (answerError) {
      console.error('Quiz answer RPC failed:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        code: answerError.code,
        message: answerError.message,
      });

      return json({ ok: false, error: 'answer_failed' }, 500);
    }

    const answerResult = parseRpcJson(answerData);

    if (!answerResult?.ok) {
      const failure = getAnswerFailureResponse(answerResult?.error);

      return json({ ok: false, error: failure.error }, failure.status);
    }

    const completed = answerResult.completed === true;
    const nextQuestionIndex = completed
      ? null
      : getRpcIntegerOrNull(answerResult.nextQuestionIndex);
    const awaitingNext = !completed && answerResult.awaitingNext === true;

    if (!completed) {
      if (!awaitingNext) {
        console.error('Quiz answer RPC did not return the expected awaiting-next state:', {
          quizKey: attempt.quiz_key,
          attemptId: attempt.id,
          awaitingNext: answerResult.awaitingNext,
        });

        return json({ ok: false, error: 'answer_failed' }, 500);
      }

      if (
        nextQuestionIndex === null ||
        nextQuestionIndex < 0 ||
        nextQuestionIndex >= attemptQuestionOrder.length
      ) {
        console.error('Quiz answer RPC returned an invalid next question index:', {
          quizKey: attempt.quiz_key,
          attemptId: attempt.id,
          nextQuestionIndex: answerResult.nextQuestionIndex,
        });

        return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
      }
    }

    return json({
      ok: true,
      status: String(answerResult.status || ''),
      questionIndex: getRpcNumber(answerResult.questionIndex),
      isCorrect: answerResult.isCorrect === true,
      timedOut: answerResult.timedOut === true,
      elapsedMs: getRpcNumber(answerResult.elapsedMs),
      correctCount: getRpcNumber(answerResult.correctCount),
      totalQuestions: getRpcNumber(answerResult.totalQuestions),
      totalElapsedMs: getRpcNumber(answerResult.totalElapsedMs),
      completed,
      explanation: typeof answerResult.explanation === 'string'
        ? answerResult.explanation
        : null,
      awaitingNext,
      nextQuestionIndex,
      nextQuestionStartedAt: null,
      nextQuestion: null,
    });
  } catch (error) {
    console.error('Quiz answer endpoint failed:', {
      message: error instanceof Error ? error.message : String(error),
    });

    return json({ ok: false, error: 'answer_failed' }, 500);
  }
};

export const GET: APIRoute = async () =>
  json({ ok: false, error: 'invalid_request' }, 405);
