import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { notifyApprovedComment } from '../../../../lib/supabase/comment-admin-notifications';
import { isMissingCommentModerationColumnError } from '../../../../lib/supabase/comment-moderation';
import { supabaseAdmin } from '../../../../lib/supabase/server';

type BulkModeratePayload = {
  ids?: unknown;
  action?: unknown;
};

const MAX_BULK_IDS = 50;
const allowedActions = new Set(['approve', 'reject']);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);

const getModerationReason = (action: string) => {
  if (action === 'reject') return 'Rifiutato da moderazione.';

  return null;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: BulkModeratePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const action = typeof payload.action === 'string' ? payload.action : '';

  if (!allowedActions.has(action)) {
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  }

  const rawIds = Array.isArray(payload.ids)
    ? payload.ids
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter(Boolean)
    : [];

  if (rawIds.length === 0) {
    return json({ ok: false, error: 'Nessun commento selezionato.' }, 400);
  }

  if (rawIds.length > MAX_BULK_IDS) {
    return json({ ok: false, error: `Puoi moderare al massimo ${MAX_BULK_IDS} commenti alla volta.` }, 400);
  }

  const validIds = [...new Set(rawIds.filter(isUuid))];

  if (validIds.length === 0) {
    return json({
      ok: true,
      updatedCount: 0,
      skippedCount: rawIds.length,
    });
  }

  const { data: existingComments, error: lookupError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, status, article_title, article_url, article_language, deleted_at')
    .in('id', validIds);

  if (lookupError) {
    logApiError('admin-comments-bulk-moderate.lookup', lookupError);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
  }

  const targetComments = (existingComments ?? []).filter(
    (comment) => comment.status === 'pending' && !comment.deleted_at
  );
  const targetIds = targetComments.map((comment) => comment.id).filter(Boolean);

  if (targetIds.length === 0) {
    return json({
      ok: true,
      updatedCount: 0,
      skippedCount: rawIds.length,
    });
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    moderation_reason: getModerationReason(action),
    moderated_at: now,
    moderated_by: session.user.id,
  };

  if (action === 'approve') {
    updatePayload.approved_at = now;
    updatePayload.approved_by = session.user.id;
    updatePayload.deleted_at = null;
  }

  let { data: updatedComments, error: updateError } = await supabaseAdmin
    .from('comments')
    .update(updatePayload)
    .in('id', targetIds)
    .eq('status', 'pending')
    .is('deleted_at', null)
    .select('id, status, approved_at, deleted_at');

  if (isMissingCommentModerationColumnError(updateError)) {
    const fallbackPayload = { ...updatePayload };
    delete fallbackPayload.moderation_reason;
    delete fallbackPayload.moderated_at;
    delete fallbackPayload.moderated_by;

    const fallbackResult = await supabaseAdmin
      .from('comments')
      .update(fallbackPayload)
      .in('id', targetIds)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .select('id, status, approved_at, deleted_at');

    updatedComments = fallbackResult.data;
    updateError = fallbackResult.error;
  }

  if (updateError) {
    logApiError('admin-comments-bulk-moderate.update', updateError);
    return json({ ok: false, error: 'Commenti non aggiornati. Riprova più tardi.' }, 500);
  }

  const updatedIds = new Set((updatedComments ?? []).map((comment) => comment.id));

  if (updatedIds.size > 0) {
    const { error: eventError } = await supabaseAdmin
      .from('moderation_events')
      .insert(
        [...updatedIds].map((commentId) => ({
          comment_id: commentId,
          moderator_id: session.user.id,
          action,
          note: `Moderazione bulk: ${action}`,
        }))
      );

    if (eventError) {
      logApiError('admin-comments-bulk-moderate.event', eventError);
    }
  }

  if (action === 'approve') {
    for (const comment of targetComments) {
      if (updatedIds.has(comment.id)) {
        await notifyApprovedComment(comment);
      }
    }
  }

  return json({
    ok: true,
    updatedCount: updatedIds.size,
    skippedCount: rawIds.length - updatedIds.size,
  });
};
