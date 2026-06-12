import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserProfileFromToken } from '../../../lib/supabase/auth';
import { supabaseAdmin } from '../../../lib/supabase/server';

type CommentReaction = 'like' | 'dislike';

type ReactionPayload = {
  commentId?: string;
  reaction?: CommentReaction;
};

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

const getReactionCounts = async (commentId: string, userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('comment_reactions')
    .select('reaction, user_id')
    .eq('comment_id', commentId);

  if (error) {
    throw error;
  }

  let likeCount = 0;
  let dislikeCount = 0;
  let userReaction: CommentReaction | null = null;

  for (const row of data ?? []) {
    if (row.reaction === 'like') {
      likeCount += 1;
    }

    if (row.reaction === 'dislike') {
      dislikeCount += 1;
    }

    if (row.user_id === userId) {
      userReaction = row.reaction === 'dislike' ? 'dislike' : 'like';
    }
  }

  return {
    likeCount,
    dislikeCount,
    userReaction,
  };
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value ?? '';
  const session = await getUserProfileFromToken(token);

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
