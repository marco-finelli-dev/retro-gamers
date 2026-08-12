import type { APIRoute } from 'astro';
import { getPublishedQuizRuntimeById } from '../../../lib/quiz';
import {
  fetchAttemptSnapshot,
  getAttemptPublicState,
  getAttemptRuntimeCompatibility,
  getNonPlayableAttemptError,
  getPublicQuestion,
  getQuestionTimerState,
  getQuizGuestIdentity,
  getRpcIntegerOrNull,
  getRpcTimestampOrNull,
  getStartQuestionFailureResponse,
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

type NextPayload = {
  attemptId?: string;
};

const normalizeAttemptId = (value: unknown) => {
  const attemptId = String(value || '').trim();

  return isUuid(attemptId) ? attemptId : '';
};

export const POST: APIRoute = async ({ request, cookies }) => {
  let payload: NextPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const attemptId = normalizeAttemptId(payload.attemptId);

  if (!attemptId) {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const { data: attemptData, error: attemptError } =
      await fetchAttemptSnapshot(attemptId);

    if (attemptError) {
      console.error('Quiz next attempt fetch failed:', {
        attemptId,
        code: attemptError.code,
        message: attemptError.message,
      });

      return json({ ok: false, error: 'next_failed' }, 500);
    }

    const attempt = attemptData as AttemptSnapshot | null;

    if (!attempt) {
      return json({ ok: false, error: 'invalid_attempt' }, 404);
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
      console.error('Quiz next ownership mismatch:', {
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
    const currentQuestionId = attemptQuestionOrder[attempt.current_question_index];

    if (
      !currentQuestionId ||
      attempt.current_question_index < 0 ||
      attempt.current_question_index >= attempt.total_questions ||
      attemptQuestionOrder.length !== attempt.total_questions
    ) {
      return json({ ok: false, error: 'invalid_attempt' }, 409);
    }

    const attemptLanguage = normalizeLanguage(attempt.quiz_language);

    if (!attemptLanguage) {
      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const quiz = await getPublishedQuizRuntimeById(attempt.quiz_document_id);
    const quizValidation = validateQuizSnapshot(quiz, attemptLanguage);

    if (!quizValidation.ok || !quiz) {
      console.error('Quiz next runtime preload failed:', {
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
      console.error('Quiz next attempt snapshot is incompatible with loaded runtime:', {
        quizKey: attempt.quiz_key,
        quizDocumentId: attempt.quiz_document_id,
        attemptId: attempt.id,
        mismatches: compatibility.mismatches,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const question = getPublicQuestion(quiz, currentQuestionId);

    if (!question) {
      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    const { data: questionStartData, error: questionStartError } =
      await supabaseAdmin.rpc('start_quiz_question', {
        p_attempt_id: attempt.id,
      });

    if (questionStartError) {
      console.error('Quiz next question start RPC failed:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        code: questionStartError.code,
        message: questionStartError.message,
      });

      return json({ ok: false, error: 'next_failed' }, 500);
    }

    const questionStartResult = parseRpcJson(questionStartData);

    if (!questionStartResult?.ok) {
      const failure = getStartQuestionFailureResponse(questionStartResult?.error);

      return json({ ok: false, error: failure.error }, failure.status);
    }

    const startedQuestionIndex = getRpcIntegerOrNull(questionStartResult.questionIndex);
    const currentQuestionStartedAt = getRpcTimestampOrNull(
      questionStartResult.questionStartedAt
    );

    if (
      startedQuestionIndex !== attempt.current_question_index ||
      !currentQuestionStartedAt
    ) {
      console.error('Quiz next question start RPC returned an inconsistent state:', {
        quizKey: attempt.quiz_key,
        attemptId: attempt.id,
        expectedQuestionIndex: attempt.current_question_index,
        startedQuestionIndex: questionStartResult.questionIndex,
        questionStartedAt: questionStartResult.questionStartedAt,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    return json({
      ok: true,
      action: questionStartResult.action || null,
      ...getAttemptPublicState(attempt),
      currentQuestionIndex: startedQuestionIndex,
      currentQuestionStartedAt,
      ...getQuestionTimerState(currentQuestionStartedAt, attempt.time_limit_seconds),
      question,
    });
  } catch (error) {
    console.error('Quiz next endpoint failed:', {
      message: error instanceof Error ? error.message : String(error),
    });

    return json({ ok: false, error: 'next_failed' }, 500);
  }
};

export const GET: APIRoute = async () =>
  json({ ok: false, error: 'invalid_request' }, 405);
