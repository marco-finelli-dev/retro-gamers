import { logApiError } from '../api-errors';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from './avatars';
import { isBlockedProfileStatus } from './auth';
import { getPublicUserUrl } from './public-profiles';
import { supabaseAdmin } from './server';

export type PrivateMessageProfile = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  status?: string | null;
};

export type PrivateConversation = {
  id: string;
  user_one: string;
  user_two: string;
  created_at: string;
  updated_at: string;
};

export type PrivateMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  deleted_by_sender?: boolean | null;
  deleted_by_recipient?: boolean | null;
};

export type PrivateConversationSummary = {
  conversation: PrivateConversation;
  otherProfile: PrivateMessageProfile;
  lastMessage: PrivateMessage | null;
  unreadCount: number;
  isBlockedByViewer: boolean;
  isViewerBlocked: boolean;
};

export type PrivateConversationThread = {
  conversation: PrivateConversation;
  viewerProfile: PrivateMessageProfile;
  otherProfile: PrivateMessageProfile;
  messages: PrivateMessage[];
  isBlockedByViewer: boolean;
  isViewerBlocked: boolean;
};

export type PrivateMessageReport = {
  id: string;
  conversation_id: string;
  message_id: string | null;
  reporter_id: string;
  reported_user_id: string;
  reason: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  message?: PrivateMessage | null;
  reporter?: PrivateMessageProfile | null;
  reportedUser?: PrivateMessageProfile | null;
};

const DEFAULT_LIMIT = 40;
const THREAD_LIMIT = 200;
const MESSAGE_MAX_LENGTH = 2000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const profileSelect = (includeAvatar = true) => `
  id,
  user_id,
  username,
  display_name,
  ${includeAvatar ? 'avatar_path,' : ''}
  role,
  status
`;

export const isPrivateMessagesUnavailable = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('private_conversations') ||
    message.includes('private_messages') ||
    message.includes('private_message_blocks') ||
    message.includes('private_message_reports')
  );
};

const logPrivateMessagesError = (context: string, error: unknown) => {
  logApiError(`private-messages.${context}`, error);
};

const normalizeUsername = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);

const normalizeMessageBody = (value: string) =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

export const getPrivateMessageExcerpt = (body?: string | null, maxLength = 120) => {
  const normalized = String(body || '').replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
};

export const getPrivateProfileLabel = (profile?: PrivateMessageProfile | null) =>
  profile?.display_name || profile?.username || 'Utente Retro-Gamers';

export const getPrivateProfileUrl = (profile?: PrivateMessageProfile | null, lang: 'it' | 'en' = 'it') => {
  if (!profile?.username) return '#';

  return getPublicUserUrl(profile.username, lang);
};

const normalizePair = (userA: string, userB: string) =>
  userA.localeCompare(userB) <= 0
    ? { userOne: userA, userTwo: userB }
    : { userOne: userB, userTwo: userA };

const serializeProfile = (profile: PrivateMessageProfile): PrivateMessageProfile => ({
  ...profile,
  avatar_url: getAvatarPublicUrl(profile.avatar_path),
});

export async function getPrivateProfileByUserId(userId: string) {
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select(profileSelect(true))
    .eq('user_id', userId)
    .maybeSingle();

  if (isMissingAvatarColumnError(error)) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(profileSelect(false))
      .eq('user_id', userId)
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    if (error) logPrivateMessagesError('profile-user', error);
    return { profile: null, error };
  }

  return {
    profile: serializeProfile(data as PrivateMessageProfile),
    error: null,
  };
}

export async function getPrivateProfileByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);

  if (!/^[a-z0-9_-]{3,24}$/.test(normalizedUsername)) {
    return { profile: null, error: null };
  }

  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select(profileSelect(true))
    .eq('username', normalizedUsername)
    .maybeSingle();

  if (isMissingAvatarColumnError(error)) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(profileSelect(false))
      .eq('username', normalizedUsername)
      .maybeSingle();

    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) {
    if (error) logPrivateMessagesError('profile-username', error);
    return { profile: null, error };
  }

  return {
    profile: serializeProfile(data as PrivateMessageProfile),
    error: null,
  };
}

async function getProfilesByUserIds(userIds: string[]) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map<string, PrivateMessageProfile>();
  }

  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select(profileSelect(true))
    .in('user_id', uniqueUserIds);

  if (isMissingAvatarColumnError(error)) {
    const fallback = await supabaseAdmin
      .from('profiles')
      .select(profileSelect(false))
      .in('user_id', uniqueUserIds);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logPrivateMessagesError('profiles', error);
    return new Map<string, PrivateMessageProfile>();
  }

  return new Map(
    (data ?? []).map((profile) => [
      profile.user_id,
      serializeProfile(profile as PrivateMessageProfile),
    ])
  );
}

async function getBlockRows(userId: string, otherUserId: string) {
  const { data, error } = await supabaseAdmin
    .from('private_message_blocks')
    .select('blocker_id, blocked_id')
    .in('blocker_id', [userId, otherUserId])
    .in('blocked_id', [userId, otherUserId]);

  if (error) {
    logPrivateMessagesError('blocks', error);
    return { rows: [], error };
  }

  return { rows: data ?? [], error: null };
}

export async function getPrivateBlockState(userId: string, otherUserId: string) {
  const { rows, error } = await getBlockRows(userId, otherUserId);

  return {
    isBlockedByViewer: rows.some((row) => row.blocker_id === userId && row.blocked_id === otherUserId),
    isViewerBlocked: rows.some((row) => row.blocker_id === otherUserId && row.blocked_id === userId),
    error,
  };
}

export async function getOrCreatePrivateConversationByUserId(viewerUserId: string, targetUserId: string) {
  if (!viewerUserId || !targetUserId || viewerUserId === targetUserId) {
    return { conversation: null, error: 'Non puoi scrivere a te stesso.', status: 400 };
  }

  const [{ profile: viewerProfile }, { profile: targetProfile }] = await Promise.all([
    getPrivateProfileByUserId(viewerUserId),
    getPrivateProfileByUserId(targetUserId),
  ]);

  if (!viewerProfile || isBlockedProfileStatus(viewerProfile.status)) {
    return { conversation: null, error: 'Il tuo account non può inviare messaggi.', status: 403 };
  }

  if (!targetProfile || isBlockedProfileStatus(targetProfile.status)) {
    return { conversation: null, error: 'Questo utente non può ricevere messaggi.', status: 403 };
  }

  const blockState = await getPrivateBlockState(viewerUserId, targetUserId);

  if (blockState.isBlockedByViewer) {
    return { conversation: null, error: 'Hai bloccato questo utente.', status: 403 };
  }

  if (blockState.isViewerBlocked) {
    return { conversation: null, error: 'Non puoi inviare messaggi a questo utente.', status: 403 };
  }

  const { userOne, userTwo } = normalizePair(viewerUserId, targetUserId);
  const existing = await supabaseAdmin
    .from('private_conversations')
    .select('id, user_one, user_two, created_at, updated_at')
    .eq('user_one', userOne)
    .eq('user_two', userTwo)
    .maybeSingle();

  if (existing.error && !isPrivateMessagesUnavailable(existing.error)) {
    logPrivateMessagesError('conversation-existing', existing.error);
    return { conversation: null, error: 'Conversazione non disponibile.', status: 500 };
  }

  if (existing.error && isPrivateMessagesUnavailable(existing.error)) {
    return { conversation: null, error: 'Messaggi privati non disponibili. Esegui lo SQL private-messages.sql in Supabase.', status: 503 };
  }

  if (existing.data) {
    return {
      conversation: existing.data as PrivateConversation,
      error: null,
      status: 200,
      created: false,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('private_conversations')
    .insert({
      user_one: userOne,
      user_two: userTwo,
    })
    .select('id, user_one, user_two, created_at, updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      const retry = await supabaseAdmin
        .from('private_conversations')
        .select('id, user_one, user_two, created_at, updated_at')
        .eq('user_one', userOne)
        .eq('user_two', userTwo)
        .maybeSingle();

      if (retry.data) {
        return {
          conversation: retry.data as PrivateConversation,
          error: null,
          status: 200,
          created: false,
        };
      }
    }

    logPrivateMessagesError('conversation-create', error);
    return { conversation: null, error: 'Conversazione non creata.', status: 500 };
  }

  return {
    conversation: data as PrivateConversation,
    error: null,
    status: 201,
    created: true,
  };
}

export async function getOrCreatePrivateConversationByUsername(viewerUserId: string, username: string) {
  const { profile } = await getPrivateProfileByUsername(username);

  if (!profile) {
    return { conversation: null, error: 'Profilo non disponibile.', status: 404 };
  }

  return getOrCreatePrivateConversationByUserId(viewerUserId, profile.user_id);
}

export async function getPrivateConversationForUser(conversationId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('private_conversations')
    .select('id, user_one, user_two, created_at, updated_at')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    if (!isPrivateMessagesUnavailable(error)) {
      logPrivateMessagesError('conversation', error);
    }

    return { conversation: null, error };
  }

  if (!data || (data.user_one !== userId && data.user_two !== userId)) {
    return { conversation: null, error: null };
  }

  return {
    conversation: data as PrivateConversation,
    error: null,
  };
}

export const getOtherConversationUserId = (conversation: PrivateConversation, userId: string) =>
  conversation.user_one === userId ? conversation.user_two : conversation.user_one;

export async function getPrivateConversations(userId: string, limit = DEFAULT_LIMIT) {
  const { data: conversations, error } = await supabaseAdmin
    .from('private_conversations')
    .select('id, user_one, user_two, created_at, updated_at')
    .or(`user_one.eq.${userId},user_two.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (!isPrivateMessagesUnavailable(error)) {
      logPrivateMessagesError('conversation-list', error);
    }

    return { conversations: [], error };
  }

  const rows = (conversations ?? []) as PrivateConversation[];
  const conversationIds = rows.map((conversation) => conversation.id);
  const otherUserIds = rows.map((conversation) => getOtherConversationUserId(conversation, userId));
  const profiles = await getProfilesByUserIds(otherUserIds);

  let messages: PrivateMessage[] = [];

  if (conversationIds.length > 0) {
    const messageResult = await supabaseAdmin
      .from('private_messages')
      .select('id, conversation_id, sender_id, body, created_at, read_at, deleted_by_sender, deleted_by_recipient')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(Math.max(conversationIds.length * 8, 20));

    if (messageResult.error) {
      logPrivateMessagesError('conversation-messages', messageResult.error);
    } else {
      messages = (messageResult.data ?? []) as PrivateMessage[];
    }
  }

  const lastByConversation = new Map<string, PrivateMessage>();
  const unreadByConversation = new Map<string, number>();

  for (const message of messages) {
    if (!lastByConversation.has(message.conversation_id)) {
      lastByConversation.set(message.conversation_id, message);
    }

    if (message.sender_id !== userId && !message.read_at) {
      unreadByConversation.set(
        message.conversation_id,
        (unreadByConversation.get(message.conversation_id) ?? 0) + 1
      );
    }
  }

  const blockPairs = await Promise.all(
    rows.map(async (conversation) => {
      const otherUserId = getOtherConversationUserId(conversation, userId);
      const blockState = await getPrivateBlockState(userId, otherUserId);
      return [conversation.id, blockState] as const;
    })
  );
  const blockByConversation = new Map(blockPairs);

  const summaries = rows
    .map((conversation) => {
      const otherProfile = profiles.get(getOtherConversationUserId(conversation, userId));

      if (!otherProfile) {
        return null;
      }

      const blockState = blockByConversation.get(conversation.id);

      return {
        conversation,
        otherProfile,
        lastMessage: lastByConversation.get(conversation.id) ?? null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        isBlockedByViewer: Boolean(blockState?.isBlockedByViewer),
        isViewerBlocked: Boolean(blockState?.isViewerBlocked),
      };
    })
    .filter((summary): summary is PrivateConversationSummary => Boolean(summary));

  summaries.sort((a, b) => {
    const dateA = new Date(a.lastMessage?.created_at || a.conversation.updated_at).getTime();
    const dateB = new Date(b.lastMessage?.created_at || b.conversation.updated_at).getTime();

    return dateB - dateA;
  });

  return { conversations: summaries, error: null };
}

export async function getPrivateConversationThread(conversationId: string, userId: string) {
  const conversationResult = await getPrivateConversationForUser(conversationId, userId);

  if (!conversationResult.conversation) {
    return { thread: null, error: conversationResult.error };
  }

  const conversation = conversationResult.conversation;
  const otherUserId = getOtherConversationUserId(conversation, userId);
  const [viewerProfileResult, otherProfileResult, blockState, messageResult] = await Promise.all([
    getPrivateProfileByUserId(userId),
    getPrivateProfileByUserId(otherUserId),
    getPrivateBlockState(userId, otherUserId),
    supabaseAdmin
      .from('private_messages')
      .select('id, conversation_id, sender_id, body, created_at, read_at, deleted_by_sender, deleted_by_recipient')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(THREAD_LIMIT),
  ]);

  if (messageResult.error) {
    logPrivateMessagesError('thread-messages', messageResult.error);
    return { thread: null, error: messageResult.error };
  }

  if (!viewerProfileResult.profile || !otherProfileResult.profile) {
    return { thread: null, error: null };
  }

  return {
    thread: {
      conversation,
      viewerProfile: viewerProfileResult.profile,
      otherProfile: otherProfileResult.profile,
      messages: (messageResult.data ?? []) as PrivateMessage[],
      isBlockedByViewer: blockState.isBlockedByViewer,
      isViewerBlocked: blockState.isViewerBlocked,
    } satisfies PrivateConversationThread,
    error: null,
  };
}

export async function getUnreadPrivateMessageCount(userId: string) {
  const { data: conversations, error: conversationError } = await supabaseAdmin
    .from('private_conversations')
    .select('id')
    .or(`user_one.eq.${userId},user_two.eq.${userId}`);

  if (conversationError) {
    if (!isPrivateMessagesUnavailable(conversationError)) {
      logPrivateMessagesError('unread-conversations', conversationError);
    }

    return { count: 0, error: conversationError };
  }

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id).filter(Boolean);

  if (conversationIds.length === 0) {
    return { count: 0, error: null };
  }

  const { count, error } = await supabaseAdmin
    .from('private_messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) {
    logPrivateMessagesError('unread-count', error);
  }

  return {
    count: count ?? 0,
    error,
  };
}

export async function markPrivateConversationRead(userId: string, conversationId: string) {
  const conversationResult = await getPrivateConversationForUser(conversationId, userId);

  if (!conversationResult.conversation) {
    return { ok: false, error: 'Conversazione non disponibile.', status: 404 };
  }

  const { error } = await supabaseAdmin
    .from('private_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) {
    logPrivateMessagesError('mark-read', error);
    return { ok: false, error: 'Messaggi non aggiornati.', status: 500 };
  }

  return { ok: true, error: null, status: 200 };
}

async function canSendInConversation(userId: string, conversation: PrivateConversation) {
  const otherUserId = getOtherConversationUserId(conversation, userId);
  const [viewerProfileResult, otherProfileResult, blockState] = await Promise.all([
    getPrivateProfileByUserId(userId),
    getPrivateProfileByUserId(otherUserId),
    getPrivateBlockState(userId, otherUserId),
  ]);

  if (!viewerProfileResult.profile || isBlockedProfileStatus(viewerProfileResult.profile.status)) {
    return { ok: false, error: 'Il tuo account non può inviare messaggi.', status: 403 };
  }

  if (!otherProfileResult.profile || isBlockedProfileStatus(otherProfileResult.profile.status)) {
    return { ok: false, error: 'Questo utente non può ricevere messaggi.', status: 403 };
  }

  if (blockState.isBlockedByViewer) {
    return { ok: false, error: 'Hai bloccato questo utente.', status: 403 };
  }

  if (blockState.isViewerBlocked) {
    return { ok: false, error: 'Non puoi inviare messaggi a questo utente.', status: 403 };
  }

  return { ok: true, error: null, status: 200 };
}

export async function sendPrivateMessage(userId: string, conversationId: string, rawBody: string) {
  const body = normalizeMessageBody(rawBody);

  if (!body) {
    return { message: null, error: 'Il messaggio non può essere vuoto.', status: 400 };
  }

  if (body.length > MESSAGE_MAX_LENGTH) {
    return { message: null, error: 'Il messaggio è troppo lungo. Massimo 2000 caratteri.', status: 400 };
  }

  const conversationResult = await getPrivateConversationForUser(conversationId, userId);

  if (!conversationResult.conversation) {
    return { message: null, error: 'Conversazione non disponibile.', status: 404 };
  }

  const sendCheck = await canSendInConversation(userId, conversationResult.conversation);

  if (!sendCheck.ok) {
    return { message: null, error: sendCheck.error, status: sendCheck.status };
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error: rateError } = await supabaseAdmin
    .from('private_messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', userId)
    .gte('created_at', since);

  if (rateError) {
    logPrivateMessagesError('rate-limit', rateError);
  } else if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return { message: null, error: 'Troppi messaggi in poco tempo. Riprova tra qualche minuto.', status: 429 };
  }

  const { data, error } = await supabaseAdmin
    .from('private_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      body,
    })
    .select('id, conversation_id, sender_id, body, created_at, read_at, deleted_by_sender, deleted_by_recipient')
    .single();

  if (error) {
    logPrivateMessagesError('send', error);
    return { message: null, error: 'Messaggio non inviato.', status: 500 };
  }

  await supabaseAdmin
    .from('private_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return {
    message: data as PrivateMessage,
    error: null,
    status: 201,
  };
}

export async function blockPrivateMessageUser(userId: string, blockedUserId: string) {
  if (!blockedUserId || blockedUserId === userId) {
    return { ok: false, error: 'Utente non valido.', status: 400 };
  }

  const { error } = await supabaseAdmin
    .from('private_message_blocks')
    .upsert({
      blocker_id: userId,
      blocked_id: blockedUserId,
    }, {
      onConflict: 'blocker_id,blocked_id',
    });

  if (error) {
    logPrivateMessagesError('block', error);
    return { ok: false, error: 'Blocco non salvato.', status: 500 };
  }

  return { ok: true, error: null, status: 200 };
}

export async function unblockPrivateMessageUser(userId: string, blockedUserId: string) {
  const { error } = await supabaseAdmin
    .from('private_message_blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedUserId);

  if (error) {
    logPrivateMessagesError('unblock', error);
    return { ok: false, error: 'Blocco non rimosso.', status: 500 };
  }

  return { ok: true, error: null, status: 200 };
}

export async function reportPrivateMessage(
  userId: string,
  conversationId: string,
  input: {
    messageId?: string | null;
    reason?: string | null;
  }
) {
  const conversationResult = await getPrivateConversationForUser(conversationId, userId);

  if (!conversationResult.conversation) {
    return { ok: false, error: 'Conversazione non disponibile.', status: 404 };
  }

  const conversation = conversationResult.conversation;
  let reportedUserId = getOtherConversationUserId(conversation, userId);
  let messageId = input.messageId || null;

  if (messageId) {
    const { data: message, error: messageError } = await supabaseAdmin
      .from('private_messages')
      .select('id, sender_id')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (messageError) {
      logPrivateMessagesError('report-message', messageError);
      return { ok: false, error: 'Messaggio non disponibile.', status: 500 };
    }

    if (!message) {
      return { ok: false, error: 'Messaggio non trovato.', status: 404 };
    }

    if (message.sender_id !== userId) {
      reportedUserId = message.sender_id;
    }
  }

  if (reportedUserId === userId) {
    return { ok: false, error: 'Non puoi segnalare te stesso.', status: 400 };
  }

  const reason = String(input.reason || '').trim().slice(0, 500) || null;
  const { data, error } = await supabaseAdmin
    .from('private_message_reports')
    .insert({
      conversation_id: conversationId,
      message_id: messageId,
      reporter_id: userId,
      reported_user_id: reportedUserId,
      reason,
    })
    .select('id')
    .single();

  if (error) {
    logPrivateMessagesError('report', error);
    return { ok: false, error: 'Segnalazione non inviata.', status: 500 };
  }

  return { ok: true, reportId: data.id, error: null, status: 201 };
}

export async function getPrivateMessageReports(status = 'open', limit = 80) {
  let query = supabaseAdmin
    .from('private_message_reports')
    .select('id, conversation_id, message_id, reporter_id, reported_user_id, reason, status, created_at, resolved_at, resolved_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: reports, error } = await query;

  if (error) {
    if (!isPrivateMessagesUnavailable(error)) {
      logPrivateMessagesError('reports', error);
    }

    return { reports: [], error };
  }

  const rows = (reports ?? []) as PrivateMessageReport[];
  const userIds = rows.flatMap((report) => [report.reporter_id, report.reported_user_id]);
  const messageIds = rows.map((report) => report.message_id).filter(Boolean) as string[];
  const [profiles, messagesResult] = await Promise.all([
    getProfilesByUserIds(userIds),
    messageIds.length > 0
      ? supabaseAdmin
          .from('private_messages')
          .select('id, conversation_id, sender_id, body, created_at, read_at')
          .in('id', messageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (messagesResult.error) {
    logPrivateMessagesError('report-messages', messagesResult.error);
  }

  const messageById = new Map(
    ((messagesResult.data ?? []) as PrivateMessage[]).map((message) => [message.id, message])
  );

  return {
    reports: rows.map((report) => ({
      ...report,
      message: report.message_id ? messageById.get(report.message_id) ?? null : null,
      reporter: profiles.get(report.reporter_id) ?? null,
      reportedUser: profiles.get(report.reported_user_id) ?? null,
    })),
    error: null,
  };
}

export async function resolvePrivateMessageReport(reportId: string, resolverUserId: string) {
  const { data, error } = await supabaseAdmin
    .from('private_message_reports')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolverUserId,
    })
    .eq('id', reportId)
    .select('id, status')
    .maybeSingle();

  if (error) {
    logPrivateMessagesError('report-resolve', error);
    return { ok: false, error: 'Segnalazione non aggiornata.', status: 500 };
  }

  if (!data) {
    return { ok: false, error: 'Segnalazione non trovata.', status: 404 };
  }

  return { ok: true, error: null, status: 200 };
}
