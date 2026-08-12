import type { APIRoute } from 'astro';
import {
  getPublishedQuizRuntimeBySlug,
  getQuizUrl,
} from '../../../lib/quiz';
import {
  fetchAttemptSnapshot,
  getAttemptPublicState,
  getAttemptRuntimeCompatibility,
  getQuestionTimerState,
  getPublicQuestion,
  getRpcIntegerOrNull,
  getRpcTimestampOrNull,
  getQuizGuestIdentity,
  getStartQuestionFailureResponse,
  getStartFailureResponse,
  json,
  normalizeLanguage,
  normalizeSlug,
  parseRpcJson,
  preflightAnswerKeys,
  selectQuestionOrderForAttempt,
  validateAttemptOwnership,
  validateQuizSnapshot,
  type AttemptSnapshot,
} from '../../../lib/quiz-server';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type StartPayload = {
  slug?: string;
  language?: string;
};

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

    const candidateQuestionOrder = selectQuestionOrderForAttempt(
      quizValidation.questionOrder,
      quizValidation.questionsPerAttempt
    );

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
        p_question_order: candidateQuestionOrder,
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

    const ownsAttempt = validateAttemptOwnership({
      attempt,
      userId,
      guestTokenHash: guestIdentity?.tokenHash || null,
    });

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

    const { data: questionStartData, error: questionStartError } =
      await supabaseAdmin.rpc('start_quiz_question', {
        p_attempt_id: attempt.id,
      });

    if (questionStartError) {
      console.error('Quiz question start RPC failed:', {
        quizKey: quiz.quizKey,
        attemptId: attempt.id,
        code: questionStartError.code,
        message: questionStartError.message,
      });

      return json({ ok: false, error: 'start_failed' }, 500);
    }

    const questionStartResult = parseRpcJson(questionStartData);

    if (!questionStartResult?.ok) {
      const failure = getStartQuestionFailureResponse(
        questionStartResult?.error,
        'start_failed'
      );

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
      console.error('Quiz question start RPC returned an inconsistent state:', {
        quizKey: quiz.quizKey,
        attemptId: attempt.id,
        expectedQuestionIndex: attempt.current_question_index,
        startedQuestionIndex: questionStartResult.questionIndex,
        questionStartedAt: questionStartResult.questionStartedAt,
      });

      return json({ ok: false, error: 'quiz_snapshot_unavailable' }, 503);
    }

    return json({
      ok: true,
      action: startResult.action || null,
      questionAction: questionStartResult.action || null,
      ...getAttemptPublicState(attempt),
      currentQuestionIndex: startedQuestionIndex,
      currentQuestionStartedAt,
      redirectRequired: false,
      ...getQuestionTimerState(currentQuestionStartedAt, attempt.time_limit_seconds),
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
