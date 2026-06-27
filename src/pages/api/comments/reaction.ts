import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type CommentReaction = 'like' | 'dislike';

type ReactionPayload = {
  commentId?: string;
  reaction?: CommentReaction;
};

type CommentReactionSummary = {
  likeCount: number;
  dislikeCount: number;
  userReaction: CommentReaction | null;
  likeUsers: string[];
  dislikeUsers: string[];
};

const MAX_REACTION_TOOLTIP_USERS = 9;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isReaction = (value: unknown): value is CommentReaction =>
  value === 'like' || value === 'dislike';

const getPublicReactionName = (profile: Record<string, unknown> | null | undefined) =>
  String(profile?.display_name || profile?.username || '').trim();

const getReactionCounts = async (commentId: string, userId: string): Promise<CommentReactionSummary> => {
  const { data, error } = await supabaseAdmin
    .from('comment_reactions')
    .select('reaction, user_id, created_at')
    .eq('comment_id', commentId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const reactionProfilesByUserId = new Map<string, string>();
  const reactionUserIds = [
    ...new Set((data ?? [])
      .map((row) => String(row.user_id || '').trim())
      .filter(Boolean))
  ];

  if (reactionUserIds.length > 0) {
    const { data: reactionProfiles, error: reactionProfilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, username, display_name')
      .in('user_id', reactionUserIds);

    if (reactionProfilesError) {
      logApiError('comments-reaction.profiles', reactionProfilesError);
    } else {
      for (const profile of reactionProfiles ?? []) {
        const reactionUserId = String(profile.user_id || '');
        const name = getPublicReactionName(profile);

        if (reactionUserId && name) {
          reactionProfilesByUserId.set(reactionUserId, name);
        }
      }
    }
  }

  let likeCount = 0;
  let dislikeCount = 0;
  let userReaction: CommentReaction | null = null;
  const likeUsers: string[] = [];
  const dislikeUsers: string[] = [];

  for (const row of data ?? []) {
    const reactionUserId = String(row.user_id || '');
    const reactionUserName = reactionProfilesByUserId.get(reactionUserId) || '';

    if (row.reaction === 'like') {
      likeCount += 1;

      if (reactionUserName && likeUsers.length < MAX_REACTION_TOOLTIP_USERS) {
        likeUsers.push(reactionUserName);
      }
    }

    if (row.reaction === 'dislike') {
      dislikeCount += 1;

      if (reactionUserName && dislikeUsers.length < MAX_REACTION_TOOLTIP_USERS) {
        dislikeUsers.push(reactionUserName);
      }
    }

    if (row.user_id === userId) {
      userReaction = row.reaction === 'dislike' ? 'dislike' : 'like';
    }
  }

  return {
    likeCount,
    dislikeCount,
    userReaction,
    likeUsers,
    dislikeUsers,
  };
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Devi effettuare il login per votare.' }, session.status || 401);
  }

  let payload: ReactionPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const commentId = payload.commentId?.trim() ?? '';
  const reaction = payload.reaction;

  if (!commentId || !isUuid(commentId)) {
    return json({ ok: false, error: 'Commento non valido.' }, 400);
  }

  if (!isReaction(reaction)) {
    return json({ ok: false, error: 'Reazione non valida.' }, 400);
  }

  const { data: comment, error: commentError } = await supabaseAdmin
    .from('comments')
    .select('id, status, user_id')
    .eq('id', commentId)
    .maybeSingle();

  if (commentError) {
    logApiError('comments-reaction.comment', commentError);
    return json({ ok: false, error: 'Reazione non aggiornata. Riprova più tardi.' }, 500);
  }

  if (!comment) {
    return json({ ok: false, error: 'Commento non trovato.' }, 404);
  }

  if (comment.status !== 'approved') {
    return json({ ok: false, error: 'Puoi votare solo commenti approvati.' }, 400);
  }

  if (comment.user_id === session.user.id) {
    return json({
      ok: false,
      code: 'own_comment',
      error: 'Non puoi votare un tuo commento.',
    }, 403);
  }

  const { data: existingReaction, error: existingReactionError } = await supabaseAdmin
    .from('comment_reactions')
    .select('id, reaction')
    .eq('comment_id', commentId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (existingReactionError) {
    logApiError('comments-reaction.existing', existingReactionError);
    return json({ ok: false, error: 'Reazione non aggiornata. Riprova più tardi.' }, 500);
  }

  if (existingReaction?.reaction === reaction) {
    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .delete()
      .eq('id', existingReaction.id)
      .eq('user_id', session.user.id);

    if (error) {
      logApiError('comments-reaction.delete', error);
      return json({ ok: false, error: 'Reazione non aggiornata. Riprova più tardi.' }, 500);
    }
  } else if (existingReaction) {
    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .update({ reaction })
      .eq('id', existingReaction.id)
      .eq('user_id', session.user.id);

    if (error) {
      logApiError('comments-reaction.update', error);
      return json({ ok: false, error: 'Reazione non aggiornata. Riprova più tardi.' }, 500);
    }
  } else {
    const { error } = await supabaseAdmin
      .from('comment_reactions')
      .insert({
        comment_id: commentId,
        user_id: session.user.id,
        reaction,
      });

    if (error) {
      logApiError('comments-reaction.insert', error);
      return json({ ok: false, error: 'Reazione non aggiornata. Riprova più tardi.' }, 500);
    }
  }

  try {
    const counts = await getReactionCounts(commentId, session.user.id);

    return json({
      ok: true,
      ...counts,
    });
  } catch (error) {
    logApiError('comments-reaction.counts', error);
    return json({
      ok: false,
      error: 'Impossibile aggiornare le reazioni.',
    }, 500);
  }
};
