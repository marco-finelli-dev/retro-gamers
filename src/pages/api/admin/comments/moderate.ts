import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';
import {
  sendCommentApprovedEmail,
  sendReplyApprovedEmail,
} from '../../../../lib/supabase/comment-emails';

type ModeratePayload = {
  commentId?: string;
  action?: 'approve' | 'reject' | 'spam' | 'delete' | 'restore';
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
} as const;

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

  try {
    await sendCommentApprovedEmail({
      to: authorEmail,
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

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from('comment_subscriptions')
    .select('id')
    .eq('user_id', parentComment.user_id)
    .eq('comment_id', parentComment.id)
    .eq('type', 'replies_to_comment')
    .eq('is_active', true)
    .maybeSingle();

  if (subscriptionError || !subscription) {
    return;
  }

  const parentEmail = await getAuthUserEmail(parentComment.user_id);

  try {
    await sendReplyApprovedEmail({
      to: parentEmail,
      articleTitle: parentComment.article_title || articleTitle,
      articleUrl: parentComment.article_url || articleUrl,
      language: parentComment.article_language === 'en' ? 'en' : 'it',
    });
  } catch (error) {
    console.error('Reply notification email failed:', error);
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: ModeratePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const action = payload.action;

  if (!commentId) {
    return json({ ok: false, error: 'Commento mancante.' }, 400);
  }

  if (!isUuid(commentId)) {
    return json({ ok: false, error: 'ID commento non valido.' }, 400);
  }

  if (!action || !(action in actionToStatus)) {
    return json({ ok: false, error: 'Azione non valida.' }, 400);
  }

  const nextStatus = actionToStatus[action];

  const { data: existingComment, error: existingCommentError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, status, article_title, article_url, article_language')
    .eq('id', commentId)
    .maybeSingle();

  if (existingCommentError) {
    return json({ ok: false, error: existingCommentError.message }, 500);
  }

  if (!existingComment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
  };

  if (action === 'approve') {
    updatePayload.approved_at = new Date().toISOString();
    updatePayload.approved_by = session.user.id;
    updatePayload.deleted_at = null;
  }

  if (action === 'delete') {
    updatePayload.deleted_at = new Date().toISOString();
  }

  if (action === 'restore') {
    updatePayload.approved_at = null;
    updatePayload.approved_by = null;
    updatePayload.deleted_at = null;
  }

  const { data: comment, error: updateError } = await supabaseAdmin
    .from('comments')
    .update(updatePayload)
    .eq('id', commentId)
    .select('id, status, approved_at, deleted_at')
    .single();

  if (updateError) {
    return json({ ok: false, error: updateError.message }, 500);
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
    if (action === 'approve' && existingComment.status !== 'approved') {
      await notifyApprovedComment(existingComment);
    }

    return json({
      ok: true,
      warning: eventError.message,
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
