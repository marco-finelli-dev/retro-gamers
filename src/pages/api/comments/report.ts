import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type ReportPayload = {
  commentId?: string;
  reason?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);

const isDuplicateReportError = (error: unknown) =>
  (error as { code?: string } | null)?.code === '23505';

const isCommentReportsUnavailable = (error: unknown) => {
  const apiError = error as { code?: string; message?: string } | null;
  const message = apiError?.message || '';

  return apiError?.code === '42P01'
    || apiError?.code === 'PGRST205'
    || message.includes('comment_reports');
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Devi effettuare il login per segnalare.' }, session.status || 401);
  }

  let payload: ReportPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const reason = String(payload.reason || '').trim();

  if (!commentId || !isUuid(commentId)) {
    return json({ ok: false, error: 'Commento non valido.' }, 400);
  }

  if (reason.length > 1000) {
    return json({ ok: false, error: 'La motivazione è troppo lunga.' }, 400);
  }

  const { data: comment, error: commentError } = await supabaseAdmin
    .from('comments')
    .select('id, status, user_id')
    .eq('id', commentId)
    .maybeSingle();

  if (commentError) {
    logApiError('comments-report.comment', commentError);
    return json({ ok: false, error: 'Segnalazione non disponibile. Riprova più tardi.' }, 500);
  }

  if (!comment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  if (comment.status !== 'approved') {
    return json({ ok: false, error: 'Puoi segnalare solo commenti pubblici.' }, 400);
  }

  if (comment.user_id === session.user.id) {
    return json({
      ok: false,
      code: 'own_comment',
      error: 'Non puoi segnalare un tuo commento.',
    }, 403);
  }

  const { error: insertError } = await supabaseAdmin
    .from('comment_reports')
    .insert({
      comment_id: commentId,
      reporter_id: session.user.id,
      reported_user_id: comment.user_id || null,
      reason: reason || null,
    });

  if (insertError) {
    if (isDuplicateReportError(insertError)) {
      return json({
        ok: false,
        code: 'duplicate_report',
        error: 'Hai già segnalato questo commento.',
      }, 409);
    }

    logApiError('comments-report.insert', insertError);
    return json({
      ok: false,
      error: isCommentReportsUnavailable(insertError)
        ? 'Segnalazioni non disponibili. Esegui lo SQL comment-reports.sql in Supabase.'
        : 'Segnalazione non inviata. Riprova più tardi.',
    }, isCommentReportsUnavailable(insertError) ? 503 : 500);
  }

  return json({ ok: true });
};
