import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { isMissingCommentModerationColumnError } from '../../../../lib/supabase/comment-moderation';
import {
  createCommentApprovedAccountMessage,
  createReplyAccountMessage,
} from '../../../../lib/supabase/account-messages';
import {
  sendCommentApprovedEmail,
  sendReplyApprovedEmail,
} from '../../../../lib/supabase/comment-emails';
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
} from '../../../../lib/supabase/comment-subscriptions';

type ModeratePayload = {
  commentId?: string;
  action?: 'approve' | 'reject' | 'pending' | 'soft_delete' | 'hard_delete' | 'spam' | 'delete' | 'restore';
  note?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const actionToStatus = {
  approve: 'approved',
  reject: 'rejected',
  spam: 'spam',
  delete: 'deleted',
  restore: 'pending',
  pending: 'pending',
} as const;

const normalizeAction = (action?: ModeratePayload['action']) => {
  if (action === 'restore') return 'pending';
  if (action === 'delete') return 'soft_delete';

  return action;
};

const getDefaultModerationReason = (action: string) => {
  if (action === 'reject') return 'Rifiutato da moderazione.';
  if (action === 'pending') return 'Rimesso in revisione.';
  if (action === 'soft_delete') return 'Nascosto da moderazione.';
  if (action === 'spam') return 'Segnato come spam.';

  return `Moderazione manuale: ${action}`;
};

const isMissingOptionalModerationTableError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function getAuthUserEmail(userId?: string | null) {
  if (!userId) return null;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

async function notifyApprovedComment(comment: {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
  article_title?: string | null;
  article_url?: string | null;
  article_language?: 'it' | 'en' | string | null;
}) {
  const language = comment.article_language === 'en' ? 'en' : 'it';
  const articleTitle = comment.article_title || 'Retro-Gamers.it';
  const articleUrl = comment.article_url || '/';
  const authorEmail = await getAuthUserEmail(comment.user_id);
  const accountMessageResult = await createCommentApprovedAccountMessage(comment);

  if (!accountMessageResult.ok && !accountMessageResult.skipped) {
    console.error('Account message for approved comment failed:', accountMessageResult.error);
  }

  try {
    await sendCommentApprovedEmail({
      to: authorEmail,
      userId: comment.user_id,
      commentId: comment.id,
      articleTitle,
      articleUrl,
      language,
    });
  } catch (error) {
    console.error('Comment approval email failed:', error);
  }

  if (!comment.parent_id) {
    return;
  }

  const { data: parentComment, error: parentError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, article_title, article_url, article_language')
    .eq('id', comment.parent_id)
    .maybeSingle();

  if (parentError || !parentComment || !parentComment.user_id) {
    return;
  }

  if (parentComment.user_id === comment.user_id) {
    return;
  }

  const replyMessageResult = await createReplyAccountMessage(comment, parentComment);

  if (!replyMessageResult.ok && !replyMessageResult.skipped) {
    console.error('Account message for comment reply failed:', replyMessageResult.error);
  }

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('comment_subscriptions')
    .select('id, unsubscribe_token')
    .eq('user_id', parentComment.user_id)
    .eq('comment_id', parentComment.id)
    .eq('type', 'replies_to_comment')
    .eq('is_active', true)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return;
  }

  const parentEmail = await getAuthUserEmail(parentComment.user_id);
  let unsubscribeToken = subscription.unsubscribe_token;

  if (!unsubscribeToken) {
    const nextUnsubscribeToken = createUnsubscribeToken();

    const { error: tokenError } = await supabaseAdmin
      .from('comment_subscriptions')
      .update({ unsubscribe_token: nextUnsubscribeToken })
      .eq('id', subscription.id);

    unsubscribeToken = tokenError ? null : nextUnsubscribeToken;
  }

  try {
    await sendReplyApprovedEmail({
      to: parentEmail,
      userId: parentComment.user_id,
      commentId: comment.id,
      articleTitle: parentComment.article_title || articleTitle,
      articleUrl: parentComment.article_url || articleUrl,
      language: parentComment.article_language === 'en' ? 'en' : 'it',
      unsubscribeUrl: unsubscribeToken ? buildUnsubscribeUrl(unsubscribeToken) : null,
    });
  } catch (error) {
    console.error('Reply notification email failed:', error);
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const isAdmin = session.profile.role === 'admin';

  let payload: ModeratePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const action = normalizeAction(payload.action);

  if (!commentId) {
    return json({ ok: false, error: 'Commento mancante.' }, 400);
  }

  if (!isUuid(commentId)) {
    return json({ ok: false, error: 'ID commento non valido.' }, 400);
  }

  if (!action || (
    !(action in actionToStatus) &&
    action !== 'soft_delete' &&
    action !== 'hard_delete'
  )) {
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  }

  if (action === 'hard_delete' && !isAdmin) {
    return json({ ok: false, error: 'Solo gli admin possono cancellare definitivamente un commento.' }, 403);
  }

  const nextStatus = action in actionToStatus
    ? actionToStatus[action as keyof typeof actionToStatus]
    : null;

  const { data: existingComment, error: existingCommentError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, status, article_title, article_url, article_language, deleted_at')
    .eq('id', commentId)
    .maybeSingle();

  if (existingCommentError) {
    logApiError('admin-comments-moderate.lookup', existingCommentError);
    return json({ ok: false, error: 'Commento non disponibile. Riprova più tardi.' }, 500);
  }

  if (!existingComment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  if (action === 'hard_delete') {
    const { data: childComments, error: childrenError } = await supabaseAdmin
      .from('comments')
      .select('id')
      .eq('parent_id', commentId);

    if (childrenError) {
      logApiError('admin-comments-moderate.hard-delete-children', childrenError);
      return json({ ok: false, error: 'Cancellazione non disponibile. Riprova più tardi.' }, 500);
    }

    const commentIds = [
      ...(childComments ?? []).map((comment) => comment.id).filter(Boolean),
      commentId,
    ];

    for (const table of ['comment_subscriptions', 'moderation_events']) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .in('comment_id', commentIds);

      if (error && !isMissingOptionalModerationTableError(error)) {
        logApiError(`admin-comments-moderate.hard-delete-${table}`, error);
        return json({ ok: false, error: 'Cancellazione non completata. Riprova più tardi.' }, 500);
      }
    }

    const childIds = commentIds.filter((id) => id !== commentId);

    if (childIds.length > 0) {
      const { error: childDeleteError } = await supabaseAdmin
        .from('comments')
        .delete()
        .in('id', childIds);

      if (childDeleteError) {
        logApiError('admin-comments-moderate.hard-delete-child-comments', childDeleteError);
        return json({ ok: false, error: 'Cancellazione delle risposte non completata.' }, 500);
      }
    }

    const { error: hardDeleteError } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (hardDeleteError) {
      logApiError('admin-comments-moderate.hard-delete-comment', hardDeleteError);
      return json({ ok: false, error: 'Commento non cancellato definitivamente.' }, 500);
    }

    return json({
      ok: true,
      comment: {
        id: commentId,
        deleted: true,
      },
    });
  }

  const updatePayload: Record<string, unknown> = {
    ...(nextStatus ? { status: nextStatus } : {}),
    moderation_reason: action === 'approve'
      ? null
      : payload.note?.trim() || getDefaultModerationReason(action),
    moderated_at: new Date().toISOString(),
    moderated_by: session.user.id,
  };

  if (action === 'approve') {
    updatePayload.approved_at = new Date().toISOString();
    updatePayload.approved_by = session.user.id;
    updatePayload.deleted_at = null;
  }

  if (action === 'soft_delete') {
    updatePayload.deleted_at = new Date().toISOString();
  }

  if (action === 'pending') {
    updatePayload.approved_at = null;
    updatePayload.approved_by = null;
    updatePayload.deleted_at = null;
  }

  let { data: comment, error: updateError } = await supabaseAdmin
    .from('comments')
    .update(updatePayload)
    .eq('id', commentId)
    .select('id, status, approved_at, deleted_at')
    .single();

  if (isMissingCommentModerationColumnError(updateError)) {
    const fallbackPayload = { ...updatePayload };
    delete fallbackPayload.moderation_reason;
    delete fallbackPayload.moderated_at;
    delete fallbackPayload.moderated_by;

    const fallbackResult = await supabaseAdmin
      .from('comments')
      .update(fallbackPayload)
      .eq('id', commentId)
      .select('id, status, approved_at, deleted_at')
      .single();

    comment = fallbackResult.data;
    updateError = fallbackResult.error;
  }

  if (updateError) {
    logApiError('admin-comments-moderate.update', updateError);
    return json({ ok: false, error: 'Commento non aggiornato. Riprova più tardi.' }, 500);
  }

  const { error: eventError } = await supabaseAdmin
    .from('moderation_events')
    .insert({
      comment_id: commentId,
      moderator_id: session.user.id,
      action,
      note: payload.note?.trim() || null,
    });

  if (eventError) {
    logApiError('admin-comments-moderate.event', eventError);
    if (action === 'approve' && existingComment.status !== 'approved') {
      await notifyApprovedComment(existingComment);
    }

    return json({
      ok: true,
      warning: 'Evento di moderazione non registrato.',
      comment,
    });
  }

  if (action === 'approve' && existingComment.status !== 'approved') {
    await notifyApprovedComment(existingComment);
  }

  return json({
    ok: true,
    comment,
  });
};
