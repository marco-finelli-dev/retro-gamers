import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies, isBlockedProfileStatus } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type UpdateCommentPayload = {
  commentId?: string;
  body?: string;
};

type EditableComment = {
  id: string;
  user_id: string | null;
  status: string | null;
  created_at: string | null;
  edit_count?: number | null;
};

const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;
const COMMENT_MIN_LENGTH = 3;
const COMMENT_MAX_LENGTH = 3000;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isMissingCommentEditColumnError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    ((message.includes('edited_at') || message.includes('edit_count')) &&
      (message.includes('column') || message.includes('schema cache')))
  );
};

const getEditableComment = async (commentId: string, includeEditColumns = true) => {
  const select = includeEditColumns
    ? 'id, user_id, status, created_at, edit_count'
    : 'id, user_id, status, created_at';

  return supabaseAdmin
    .from('comments')
    .select(select)
    .eq('id', commentId)
    .maybeSingle();
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({
      ok: false,
      error: session.error || 'Devi effettuare il login per modificare un commento.',
    }, session.status || 401);
  }

  if (isBlockedProfileStatus(session.profile.status)) {
    return json({ ok: false, error: 'Account bloccato.' }, 403);
  }

  let payload: UpdateCommentPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const body = String(payload.body || '').trim();

  if (!commentId || !isUuid(commentId)) {
    return json({ ok: false, error: 'Commento non valido.' }, 400);
  }

  if (body.length < COMMENT_MIN_LENGTH) {
    return json({ ok: false, error: 'Il commento è troppo breve.' }, 400);
  }

  if (body.length > COMMENT_MAX_LENGTH) {
    return json({ ok: false, error: 'Il commento è troppo lungo. Massimo 3000 caratteri.' }, 400);
  }

  let hasEditColumns = true;
  let { data: comment, error: commentError } = await getEditableComment(commentId, true);

  if (isMissingCommentEditColumnError(commentError)) {
    hasEditColumns = false;
    const fallbackResult = await getEditableComment(commentId, false);
    comment = fallbackResult.data;
    commentError = fallbackResult.error;
  }

  if (commentError) {
    logApiError('comments-update.comment', commentError);
    return json({ ok: false, error: 'Commento non aggiornato. Riprova più tardi.' }, 500);
  }

  const editableComment = comment as EditableComment | null;

  if (!editableComment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  if (editableComment.user_id !== session.user.id) {
    return json({ ok: false, error: 'Non puoi modificare questo commento.' }, 403);
  }

  if (editableComment.status !== 'pending' && editableComment.status !== 'approved') {
    return json({ ok: false, error: 'Questo commento non può essere modificato.' }, 403);
  }

  if (editableComment.status === 'approved') {
    const createdAt = editableComment.created_at
      ? new Date(editableComment.created_at).getTime()
      : NaN;
    const editWindowIsOpen = Number.isFinite(createdAt)
      && Date.now() - createdAt <= COMMENT_EDIT_WINDOW_MS;

    if (!editWindowIsOpen) {
      return json({
        ok: false,
        code: 'edit_window_expired',
        error: 'Il tempo per modificare questo commento è scaduto.',
      }, 403);
    }
  }

  const editedAt = new Date().toISOString();
  const updatePayload: Record<string, unknown> = { body };

  if (hasEditColumns) {
    updatePayload.edited_at = editedAt;
    updatePayload.edit_count = Math.max(0, Number(editableComment.edit_count || 0)) + 1;
  }

  let { data: updatedComment, error: updateError } = await supabaseAdmin
    .from('comments')
    .update(updatePayload)
    .eq('id', editableComment.id)
    .eq('user_id', session.user.id)
    .select('id, status, body')
    .single();

  if (hasEditColumns && isMissingCommentEditColumnError(updateError)) {
    hasEditColumns = false;
    const fallbackResult = await supabaseAdmin
      .from('comments')
      .update({ body })
      .eq('id', editableComment.id)
      .eq('user_id', session.user.id)
      .select('id, status, body')
      .single();

    updatedComment = fallbackResult.data;
    updateError = fallbackResult.error;
  }

  if (updateError) {
    logApiError('comments-update.update', updateError);
    return json({ ok: false, error: 'Commento non aggiornato. Riprova più tardi.' }, 500);
  }

  return json({
    ok: true,
    comment: updatedComment,
    editMetadataSaved: hasEditColumns,
  });
};
