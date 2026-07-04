import {
  createCommentApprovedAccountMessage,
  createReplyAccountMessage,
} from './account-messages';
import {
  sendCommentApprovedEmail,
  sendReplyApprovedEmail,
} from './comment-emails';
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
} from './comment-subscriptions';
import { supabaseAdmin } from './server';

async function getAuthUserEmail(userId?: string | null) {
  if (!userId) return null;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

export async function notifyApprovedComment(comment: {
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
