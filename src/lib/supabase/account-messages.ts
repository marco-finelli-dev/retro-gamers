import { supabaseAdmin } from './server';

export type AccountMessageType =
  | 'comment_approved'
  | 'comment_reply'
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

type AccountMessageInput = {
  userId?: string | null;
  type: AccountMessageType;
  title: string;
  body: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
};

type CommentReference = {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
  article_title?: string | null;
  article_url?: string | null;
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

export const getCommentActionUrl = (comment: { id?: string | null; article_url?: string | null }) => {
  if (!comment.id) {
    return comment.article_url || '/';
  }

  const baseUrl = comment.article_url ? comment.article_url.split('#')[0] : '/';

  return `${baseUrl}#comment-${comment.id}`;
};

export async function createAccountMessage(input: AccountMessageInput) {
  if (!input.userId) {
    return { ok: false, skipped: true, error: 'Missing user id.' };
  }

  const actionUrl = input.actionUrl || null;

  if (actionUrl) {
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

  const { data, error } = await supabaseAdmin
    .from('account_messages')
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      action_label: input.actionLabel || null,
      action_url: actionUrl,
    })
    .select('id')
    .single();

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

export async function getCommentById(commentId?: string | null): Promise<CommentReference | null> {
  if (!commentId) return null;

  const { data, error } = await supabaseAdmin
    .from('comments')
    .select('id, user_id, parent_id, article_title, article_url')
    .eq('id', commentId)
    .maybeSingle();

  if (error || !data) {
    logAccountMessagesError('get-comment', error);
    return null;
  }

  return data;
}

export async function getAccountMessages(userId: string, limit = DEFAULT_LIMIT) {
  const { data, error } = await supabaseAdmin
    .from('account_messages')
    .select('id, user_id, type, title, body, action_label, action_url, is_read, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  logAccountMessagesError('list', error);

  return {
    messages: (data ?? []) as AccountMessage[],
    error,
  };
}

export async function getUnreadAccountMessageCount(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('account_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  logAccountMessagesError('unread-count', error);

  return {
    count: count ?? 0,
    error,
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

export async function markAccountMessagesRead(userId: string, messageIds: string[]) {
  const uniqueMessageIds = [...new Set(messageIds.filter(Boolean))];

  if (uniqueMessageIds.length === 0) {
    return { error: null };
  }

  const { error } = await supabaseAdmin
    .from('account_messages')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false)
    .in('id', uniqueMessageIds);

  logAccountMessagesError('mark-loaded-read', error);

  return { error };
}

export async function markAllAccountMessagesRead(userId: string) {
  const { error } = await supabaseAdmin
    .from('account_messages')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  logAccountMessagesError('mark-all-read', error);

  return { error };
}
