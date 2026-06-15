import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { supabaseAdmin } from '../../../lib/supabase/server';
import { getUserSessionFromCookies, isBlockedProfileStatus, isStaffProfile } from '../../../lib/supabase/auth';
import { createReplyAccountMessage } from '../../../lib/supabase/account-messages';
import {
  sendNewCommentAdminEmail,
  sendReplyApprovedEmail,
} from '../../../lib/supabase/comment-emails';
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
} from '../../../lib/supabase/comment-subscriptions';

type CreateCommentPayload = {
  articleSlug?: string;
  articleLanguage?: 'it' | 'en';
  articleTitle?: string;
  articleUrl?: string;
  body?: string;
  parentId?: string | null;
  notifyReplies?: boolean;
  notifyThread?: boolean;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    return `${url.pathname}${url.search}`;
  } catch {
    return trimmed;
  }
};

async function getAuthUserEmail(userId?: string | null) {
  if (!userId) return null;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (error) {
    return null;
  }

  return data.user?.email ?? null;
}

async function createInternalReplyMessage(comment: {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
  article_title?: string | null;
  article_url?: string | null;
}) {
  if (!comment.parent_id) {
    return;
  }

  const replyResult = await createReplyAccountMessage(comment);

  if (!replyResult.ok && !replyResult.skipped) {
    console.error('Account message for comment reply failed:', replyResult.error);
  }
}

async function notifyParentAuthorAboutApprovedReply(comment: {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
  article_title?: string | null;
  article_url?: string | null;
  article_language?: 'it' | 'en' | string | null;
}) {
  if (!comment.parent_id) {
    return;
  }

  const { data: parentComment, error: parentError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, article_title, article_url, article_language')
    .eq('id', comment.parent_id)
    .maybeSingle();

  if (parentError || !parentComment?.user_id) {
    return;
  }

  if (parentComment.user_id === comment.user_id) {
    return;
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
      articleTitle: parentComment.article_title || comment.article_title || 'Retro-Gamers.it',
      articleUrl: parentComment.article_url || comment.article_url || '/',
      language: parentComment.article_language === 'en' ? 'en' : 'it',
      unsubscribeUrl: unsubscribeToken ? buildUnsubscribeUrl(unsubscribeToken) : null,
    });
  } catch (error) {
    console.error('Staff reply notification email failed:', error);
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: 'Sessione non valida. Effettua di nuovo il login.' }, session.status || 401);
  }

  const user = session.user;
  const profile = session.profile;

  if (isBlockedProfileStatus(profile.status)) {
    return json({ ok: false, error: 'Account bloccato.' }, 403);
  }

  const isStaff = isStaffProfile(profile);

  let payload: CreateCommentPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const articleSlug = payload.articleSlug?.trim() ?? '';
  const articleLanguage = payload.articleLanguage === 'en' ? 'en' : 'it';
  const articleTitle = payload.articleTitle?.trim() ?? '';
  const articleUrl = normalizeUrl(payload.articleUrl?.trim() ?? '');
  const body = payload.body?.trim() ?? '';
  const parentId = payload.parentId?.trim() || null;
  const notifyReplies = payload.notifyReplies !== false;
  const notifyThread = payload.notifyThread === true;

  if (!articleSlug || articleSlug.length > 180) {
    return json({ ok: false, error: 'Articolo non valido.' }, 400);
  }

  if (!articleTitle || articleTitle.length > 220) {
    return json({ ok: false, error: 'Titolo articolo non valido.' }, 400);
  }

  if (!articleUrl || articleUrl.length > 300) {
    return json({ ok: false, error: 'URL articolo non valido.' }, 400);
  }

  if (body.length < 3) {
    return json({ ok: false, error: 'Il commento è troppo breve.' }, 400);
  }

  if (body.length > 3000) {
    return json({ ok: false, error: 'Il commento è troppo lungo. Massimo 3000 caratteri.' }, 400);
  }

  const tooRecentThreshold = new Date(Date.now() - 20_000).toISOString();
  const { data: recentComments, error: recentCommentsError } = await supabaseAdmin
    .from('comments')
    .select('id')
    .eq('user_id', user.id)
    .gte('created_at', tooRecentThreshold)
    .limit(1);

  if (recentCommentsError) {
    logApiError('comments-create.cooldown', recentCommentsError);
    return json({ ok: false, error: 'Commento non inviato. Riprova più tardi.' }, 500);
  }

  if ((recentComments ?? []).length > 0) {
    return json({
      ok: false,
      error: 'Hai appena inviato un commento. Aspetta qualche secondo prima di riprovare.',
    }, 429);
  }

  if (!isStaff) {
    const pendingThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: pendingCount, error: pendingCountError } = await supabaseAdmin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', pendingThreshold);

    if (pendingCountError) {
      logApiError('comments-create.pending-count', pendingCountError);
      return json({ ok: false, error: 'Commento non inviato. Riprova più tardi.' }, 500);
    }

    if ((pendingCount ?? 0) >= 5) {
      return json({
        ok: false,
        error: 'Hai già diversi commenti in moderazione. Attendi la revisione prima di inviarne altri.',
      }, 429);
    }
  }

  if (parentId) {
    const { data: parentComment, error: parentError } = await supabaseAdmin
      .from('comments')
      .select('id, parent_id, article_slug, article_language, status')
      .eq('id', parentId)
      .maybeSingle();

    if (parentError) {
      logApiError('comments-create.parent', parentError);
      return json({ ok: false, error: 'Risposta non disponibile. Riprova più tardi.' }, 500);
    }

    if (!parentComment || parentComment.status !== 'approved') {
      return json({ ok: false, error: 'Il commento a cui vuoi rispondere non è disponibile.' }, 400);
    }

    if (parentComment.parent_id) {
      return json({ ok: false, error: 'Le risposte sono consentite solo al primo livello.' }, 400);
    }

    if (
      parentComment.article_slug !== articleSlug ||
      parentComment.article_language !== articleLanguage
    ) {
      return json({ ok: false, error: 'Risposta non coerente con l’articolo.' }, 400);
    }
  }

  const nextStatus = isStaff ? 'approved' : 'pending';
  const publishedMessage = articleLanguage === 'en' ? 'Comment published.' : 'Commento pubblicato.';
  const pendingMessage = articleLanguage === 'en'
    ? 'Comment sent. It will appear after moderation.'
    : 'Commento inviato. Sarà visibile dopo la moderazione.';

  const insertPayload: Record<string, unknown> = {
    article_slug: articleSlug,
    article_language: articleLanguage,
    article_title: articleTitle,
    article_url: articleUrl,
    user_id: user.id,
    profile_id: profile.id,
    parent_id: parentId,
    body,
    status: nextStatus,
  };

  if (isStaff) {
    insertPayload.approved_at = new Date().toISOString();
    insertPayload.approved_by = user.id;
  }

  const { data: comment, error: insertError } = await supabaseAdmin
    .from('comments')
    .insert(insertPayload)
    .select('id, user_id, parent_id, status, created_at, article_title, article_url, article_language')
    .single();

  if (insertError) {
    logApiError('comments-create.insert', insertError);
    return json({ ok: false, error: 'Commento non inviato. Riprova più tardi.' }, 500);
  }

  const subscriptionsToCreate: Array<Record<string, unknown>> = [];

  if (notifyReplies) {
    subscriptionsToCreate.push({
      user_id: user.id,
      article_slug: articleSlug,
      article_language: articleLanguage,
      comment_id: comment.id,
      type: 'replies_to_comment',
      is_active: true,
      unsubscribe_token: createUnsubscribeToken(),
    });
  }

  if (notifyThread) {
    subscriptionsToCreate.push({
      user_id: user.id,
      article_slug: articleSlug,
      article_language: articleLanguage,
      comment_id: null,
      type: 'article_thread',
      is_active: true,
      unsubscribe_token: createUnsubscribeToken(),
    });
  }

  if (subscriptionsToCreate.length > 0) {
    const { error: subscriptionError } = await supabaseAdmin
      .from('comment_subscriptions')
      .upsert(subscriptionsToCreate, {
        onConflict: 'user_id,article_slug,article_language,comment_id,type',
      });

    if (subscriptionError) {
      logApiError('comments-create.subscriptions', subscriptionError);
      return json({
        ok: true,
        warning: 'Preferenze di notifica non salvate.',
        message: isStaff
          ? `${publishedMessage} Non è stato possibile salvare le preferenze di notifica.`
          : 'Commento inviato, ma non è stato possibile salvare le preferenze di notifica.',
        comment,
      });
    }
  }

  if (isStaff) {
    await createInternalReplyMessage(comment);
    await notifyParentAuthorAboutApprovedReply(comment);

    return json({
      ok: true,
      message: publishedMessage,
      comment,
    });
  }

  try {
    await sendNewCommentAdminEmail({
      articleTitle,
      articleUrl,
      authorName: profile.display_name || profile.username || 'Lettore',
      body,
      language: articleLanguage,
      commentId: comment.id,
    });
  } catch {
    return json({
      ok: true,
      warning: 'Commento inviato, ma la notifica email alla redazione non è partita.',
      message: pendingMessage,
      comment,
    });
  }

  return json({
    ok: true,
    message: pendingMessage,
    comment,
  });
};
