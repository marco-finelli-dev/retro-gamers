import { supabaseAdmin } from './server';

export type AccountMessageType =
  | 'comment_approved'
  | 'comment_reply'
  | 'comment_like'
  | 'comment_pending'
  | 'badge_unlocked'
  | 'system';

export type AccountMessage = {
  id: string;
  user_id: string;
  type: AccountMessageType | string;
  title: string;
  body: string;
  action_label: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type AccountMessageMetadata = Record<string, unknown> | null;

type AccountMessageRow = AccountMessage & {
  metadata: AccountMessageMetadata;
};

type AccountMessageInput = {
  userId?: string | null;
  type: AccountMessageType;
  title: string;
  body: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  dedupe?: boolean;
};

type CommentReference = {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
  article_slug?: string | null;
  article_language?: string | null;
  article_title?: string | null;
  article_url?: string | null;
};

type CommentLikeActor = {
  userId?: string | null;
  name?: string | null;
};

type WelcomeMessageInput = {
  userId?: string | null;
  displayName?: string | null;
};

type BadgeUnlockedMessageInput = {
  userId?: string | null;
  badgeName: string;
};

const DEFAULT_LIMIT = 60;

const logAccountMessagesError = (context: string, error: { code?: string; message?: string; hint?: string } | null) => {
  if (!error) return;

  console.error('Account messages query failed:', {
    context,
    code: error.code,
    message: error.message,
    hint: error.hint,
  });
};

const isMissingMetadataColumnError = (error: { code?: string; message?: string; details?: string; hint?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    message.includes('metadata') &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('schema cache') ||
      message.includes('column')
    )
  );
};

const getPendingCommentId = (metadata: AccountMessageMetadata) => {
  const commentId = metadata?.commentId;

  return typeof commentId === 'string' ? commentId.trim() : '';
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const getValidPendingCommentIds = async (
  messages: Array<Pick<AccountMessageRow, 'type' | 'metadata'>>
) => {
  const commentIds = [...new Set(
    messages
      .filter((message) => message.type === 'comment_pending')
      .map((message) => getPendingCommentId(message.metadata))
      .filter(isUuid)
  )];

  if (commentIds.length === 0) {
    return { commentIds: new Set<string>(), error: null };
  }

  const { data, error } = await supabaseAdmin
    .from('comments')
    .select('id')
    .in('id', commentIds)
    .eq('status', 'pending')
    .is('deleted_at', null);

  logAccountMessagesError('pending-comment-validation', error);

  return {
    commentIds: new Set((data ?? []).map((comment) => comment.id).filter(Boolean)),
    error,
  };
};

const toAccountMessage = (message: AccountMessageRow): AccountMessage => ({
  id: message.id,
  user_id: message.user_id,
  type: message.type,
  title: message.title,
  body: message.body,
  action_label: message.action_label,
  action_url: message.action_url,
  is_read: message.is_read,
  created_at: message.created_at,
  read_at: message.read_at,
});

export const getCommentActionUrl = (comment: {
  id?: string | null;
  article_url?: string | null;
  article_slug?: string | null;
  article_language?: string | null;
}) => {
  if (!comment.id) {
    return comment.article_url || '/';
  }

  let baseUrl = comment.article_url ? comment.article_url.split('#')[0] : '';

  if (!baseUrl && comment.article_slug) {
    baseUrl = comment.article_language === 'en'
      ? `/en/articles/${comment.article_slug}/`
      : `/articoli/${comment.article_slug}/`;
  }

  if (!baseUrl) {
    baseUrl = '/';
  }

  return `${baseUrl}#comment-${comment.id}`;
};

export async function createAccountMessage(input: AccountMessageInput) {
  if (!input.userId) {
    return { ok: false, skipped: true, error: 'Missing user id.' };
  }

  const actionUrl = input.actionUrl || null;

  if (actionUrl && input.dedupe !== false) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('account_messages')
      .select('id')
      .eq('user_id', input.userId)
      .eq('type', input.type)
      .eq('title', input.title)
      .eq('body', input.body)
      .eq('action_url', actionUrl)
      .maybeSingle();

    if (!existingError && existing) {
      return { ok: true, skipped: true, id: existing.id };
    }

    if (existingError) {
      logAccountMessagesError('dedupe', existingError);
    }
  }

  const insertPayload: Record<string, unknown> = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    action_label: input.actionLabel || null,
    action_url: actionUrl,
  };

  if (input.metadata !== undefined) {
    insertPayload.metadata = input.metadata || null;
  }

  let { data, error } = await supabaseAdmin
    .from('account_messages')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error && isMissingMetadataColumnError(error) && 'metadata' in insertPayload) {
    delete insertPayload.metadata;

    const retryResult = await supabaseAdmin
      .from('account_messages')
      .insert(insertPayload)
      .select('id')
      .single();

    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) {
    logAccountMessagesError('insert', error);
    return { ok: false, skipped: false, error: error.message };
  }

  return { ok: true, skipped: false, id: data.id };
}

export async function createCommentApprovedAccountMessage(comment: CommentReference) {
  return createAccountMessage({
    userId: comment.user_id,
    type: 'comment_approved',
    title: 'Commento approvato',
    body: 'Il tuo commento è stato approvato ed è ora visibile su Retro-Gamers.it.',
    actionLabel: 'Apri commento',
    actionUrl: getCommentActionUrl(comment),
  });
}

export async function createWelcomeAccountMessage(input: WelcomeMessageInput) {
  const displayName = input.displayName?.trim() || 'lettore';

  return createAccountMessage({
    userId: input.userId,
    type: 'system',
    title: 'Benvenuto su Retro-Gamers.it',
    body: `Ciao ${displayName},
benvenuto su Retro-Gamers.it.

Questo sito nasce per raccontare la storia dei videogiochi, ma anche per raccogliere le memorie di chi quei giochi, quelle macchine e quelle sale giochi le ha vissute davvero.

Con il tuo account puoi commentare articoli e recensioni, rispondere agli altri lettori, costruire il tuo profilo, sbloccare badge, seguire le notifiche interne e lasciare il tuo contributo dentro l’archivio del sito.

Ti chiedo solo di usare questo spazio con rispetto: qui vogliamo discussioni vere, ricordi, opinioni sincere, correzioni utili e passione retro, non il rumore dei social.

Benvenuto tra noi.
Ci vediamo sotto gli articoli.

Marco Finelli
Founder / Editor di Retro-Gamers.it`,
    actionLabel: 'Apri il tuo account',
    actionUrl: '/account/',
  });
}

export async function createBadgeUnlockedAccountMessage(input: BadgeUnlockedMessageInput) {
  return createAccountMessage({
    userId: input.userId,
    type: 'badge_unlocked',
    title: 'Nuovo badge sbloccato',
    body: `Hai sbloccato il badge “${input.badgeName}” su Retro-Gamers.it.`,
    actionLabel: 'Vedi i tuoi badge',
    actionUrl: '/badges/',
  });
}

export async function createReplyAccountMessage(
  reply: CommentReference,
  parentComment?: CommentReference | null
) {
  const parent = parentComment || await getCommentById(reply.parent_id);

  if (!parent?.user_id || parent.user_id === reply.user_id) {
    return { ok: false, skipped: true, error: 'No recipient.' };
  }

  return createAccountMessage({
    userId: parent.user_id,
    type: 'comment_reply',
    title: 'Nuova risposta al tuo commento',
    body: 'Qualcuno ha risposto a un tuo commento su Retro-Gamers.it.',
    actionLabel: 'Apri risposta',
    actionUrl: getCommentActionUrl(reply),
  });
}

async function hasRecentCommentLikeMessage(
  recipientUserId: string,
  commentId: string,
  actorUserId: string,
  actionUrl: string
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('account_messages')
    .select('id')
    .eq('user_id', recipientUserId)
    .eq('type', 'comment_like')
    .eq('metadata->>commentId', commentId)
    .eq('metadata->>actorId', actorUserId)
    .gte('created_at', since)
    .limit(1);

  if (!error) {
    return Boolean(data?.[0]?.id);
  }

  if (!isMissingMetadataColumnError(error)) {
    logAccountMessagesError('comment-like-dedupe', error);
    return false;
  }

  const fallback = await supabaseAdmin
    .from('account_messages')
    .select('id')
    .eq('user_id', recipientUserId)
    .eq('type', 'comment_like')
    .eq('action_url', actionUrl)
    .gte('created_at', since)
    .limit(1);

  if (fallback.error) {
    logAccountMessagesError('comment-like-dedupe-fallback', fallback.error);
    return false;
  }

  return Boolean(fallback.data?.[0]?.id);
}

export async function createCommentLikeAccountMessage(
  comment: CommentReference,
  actor: CommentLikeActor
) {
  if (!comment.user_id || !actor.userId || comment.user_id === actor.userId) {
    return { ok: false, skipped: true, error: 'No recipient.' };
  }

  const actionUrl = getCommentActionUrl(comment);
  const alreadyNotified = await hasRecentCommentLikeMessage(
    comment.user_id,
    comment.id,
    actor.userId,
    actionUrl
  );

  if (alreadyNotified) {
    return { ok: true, skipped: true };
  }

  return createAccountMessage({
    userId: comment.user_id,
    type: 'comment_like',
    title: 'Il tuo commento ha ricevuto un like',
    body: 'Qualcuno ha apprezzato il tuo commento.',
    actionLabel: 'Apri commento',
    actionUrl,
    dedupe: false,
    metadata: {
      commentId: comment.id,
      parentCommentId: comment.parent_id || null,
      articleSlug: comment.article_slug || null,
      articleTitle: comment.article_title || null,
      actorId: actor.userId,
      actorName: actor.name || null,
    },
  });
}

export async function createPendingCommentAccountMessages(comment: CommentReference) {
  const { data: currentComment, error: commentError } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, article_slug, article_language, article_title, article_url, status, deleted_at')
    .eq('id', comment.id)
    .maybeSingle();

  if (commentError) {
    logAccountMessagesError('pending-comment-validation', commentError);
    return { ok: false, sent: 0, error: commentError.message };
  }

  if (!currentComment || currentComment.status !== 'pending' || currentComment.deleted_at) {
    return { ok: true, sent: 0, skipped: true };
  }

  const { data: moderators, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, role, status')
    .in('role', ['admin', 'moderator']);

  if (error) {
    logAccountMessagesError('pending-comment-recipients', error);
    return { ok: false, sent: 0, error: error.message };
  }

  const recipients = (moderators ?? [])
    .filter((profile) => profile.user_id && profile.user_id !== currentComment.user_id)
    .filter((profile) => !['blocked', 'suspended', 'banned'].includes(String(profile.status || '')));

  if (recipients.length === 0) {
    return { ok: true, sent: 0 };
  }

  const language = currentComment.article_language === 'en' ? 'en' : 'it';
  const title = language === 'en'
    ? 'New comment awaiting moderation'
    : 'Nuovo commento da moderare';
  const body = language === 'en'
    ? 'A comment is waiting for review.'
    : 'Un commento è in attesa di revisione.';
  const actionLabel = language === 'en' ? 'Open moderation' : 'Apri moderazione';

  const results = await Promise.all(
    recipients.map((recipient) =>
      createAccountMessage({
        userId: recipient.user_id,
        type: 'comment_pending',
        title,
        body,
        actionLabel,
        actionUrl: '/admin/comments/?status=pending',
        dedupe: false,
        metadata: {
          commentId: currentComment.id,
          articleSlug: currentComment.article_slug || null,
          articleTitle: currentComment.article_title || null,
          authorUserId: currentComment.user_id || null,
          status: 'pending',
        },
      })
    )
  );

  const failed = results.filter((result) => !result.ok && !result.skipped);

  if (failed.length > 0) {
    return { ok: false, sent: results.length - failed.length, error: 'Some pending comment notifications failed.' };
  }

  return { ok: true, sent: results.length };
}

export async function closePendingCommentAccountMessages(commentIds: string | string[]) {
  const uniqueCommentIds = [...new Set(
    (Array.isArray(commentIds) ? commentIds : [commentIds])
      .map((commentId) => commentId.trim())
      .filter(Boolean)
  )];

  if (uniqueCommentIds.length === 0) {
    return { ok: true, closedCount: 0, error: null };
  }

  const closedAt = new Date().toISOString();
  const { data: timestampedMessages, error: timestampError } = await supabaseAdmin
    .from('account_messages')
    .update({
      is_read: true,
      read_at: closedAt,
    })
    .eq('type', 'comment_pending')
    .in('metadata->>commentId', uniqueCommentIds)
    .eq('is_read', false)
    .is('read_at', null)
    .select('id');

  if (timestampError) {
    logAccountMessagesError('close-pending-comments-with-read-at', timestampError);
    return { ok: false, closedCount: 0, error: timestampError };
  }

  const { data: readMessages, error: readError } = await supabaseAdmin
    .from('account_messages')
    .update({ is_read: true })
    .eq('type', 'comment_pending')
    .in('metadata->>commentId', uniqueCommentIds)
    .eq('is_read', false)
    .select('id');

  if (readError) {
    logAccountMessagesError('close-pending-comments', readError);
    return {
      ok: false,
      closedCount: timestampedMessages?.length ?? 0,
      error: readError,
    };
  }

  return {
    ok: true,
    closedCount: (timestampedMessages?.length ?? 0) + (readMessages?.length ?? 0),
    error: null,
  };
}

export async function getCommentById(commentId?: string | null): Promise<CommentReference | null> {
  if (!commentId) return null;

  const { data, error } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, article_slug, article_language, article_title, article_url')
    .eq('id', commentId)
    .maybeSingle();

  if (error || !data) {
    logAccountMessagesError('get-comment', error);
    return null;
  }

  return data;
}

export async function getAccountMessages(userId: string, limit = DEFAULT_LIMIT) {
  const safeLimit = Math.max(0, Math.floor(limit));

  if (safeLimit === 0) {
    return { messages: [] as AccountMessage[], error: null };
  }

  const batchSize = Math.max(DEFAULT_LIMIT, safeLimit);
  const validMessages: AccountMessageRow[] = [];
  let offset = 0;

  while (validMessages.length < safeLimit) {
    const { data, error } = await supabaseAdmin
      .from('account_messages')
      .select('id, user_id, type, title, body, action_label, action_url, is_read, created_at, read_at, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    logAccountMessagesError('list', error);

    if (error) {
      return {
        messages: validMessages.slice(0, safeLimit).map(toAccountMessage),
        error,
      };
    }

    const messageRows = (data ?? []) as AccountMessageRow[];
    const pendingValidation = await getValidPendingCommentIds(messageRows);

    validMessages.push(...messageRows.filter((message) => (
      message.type !== 'comment_pending' ||
      pendingValidation.commentIds.has(getPendingCommentId(message.metadata))
    )));

    if (pendingValidation.error) {
      return {
        messages: validMessages.slice(0, safeLimit).map(toAccountMessage),
        error: pendingValidation.error,
      };
    }

    if (messageRows.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return {
    messages: validMessages.slice(0, safeLimit).map(toAccountMessage),
    error: null,
  };
}

export async function getUnreadAccountMessageCount(userId: string) {
  const [otherMessagesResult, pendingMessagesResult] = await Promise.all([
    supabaseAdmin
      .from('account_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false)
      .neq('type', 'comment_pending'),
    supabaseAdmin
      .from('account_messages')
      .select('type, metadata')
      .eq('user_id', userId)
      .eq('is_read', false)
      .eq('type', 'comment_pending'),
  ]);

  logAccountMessagesError('unread-count-other', otherMessagesResult.error);
  logAccountMessagesError('unread-count-pending', pendingMessagesResult.error);

  const queryError = otherMessagesResult.error || pendingMessagesResult.error;

  if (queryError) {
    return {
      count: 0,
      error: queryError,
    };
  }

  const pendingMessages = (pendingMessagesResult.data ?? []) as Array<Pick<AccountMessageRow, 'type' | 'metadata'>>;
  const pendingValidation = await getValidPendingCommentIds(pendingMessages);
  const validPendingCount = pendingMessages.filter((message) => (
    pendingValidation.commentIds.has(getPendingCommentId(message.metadata))
  )).length;

  return {
    count: (otherMessagesResult.count ?? 0) + validPendingCount,
    error: pendingValidation.error,
  };
}

export async function markAccountMessageRead(userId: string, messageId: string) {
  const { data, error } = await supabaseAdmin
    .from('account_messages')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('user_id', userId)
    .select('id, is_read, read_at')
    .maybeSingle();

  logAccountMessagesError('mark-read', error);

  return { message: data, error };
}

export async function markAllAccountMessagesRead(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('account_messages')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');

  logAccountMessagesError('mark-all-read', error);

  return {
    error,
    updatedCount: data?.length ?? 0,
  };
}
