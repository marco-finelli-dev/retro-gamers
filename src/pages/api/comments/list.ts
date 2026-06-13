import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from '../../../lib/supabase/avatars';
import { supabaseAdmin } from '../../../lib/supabase/server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

type CommentReactionSummary = {
  likeCount: number;
  dislikeCount: number;
  userReaction: 'like' | 'dislike' | null;
};

const emptyReactionSummary = (): CommentReactionSummary => ({
  likeCount: 0,
  dislikeCount: 0,
  userReaction: null,
});

const getCommentsSelect = (includeAvatar = true) => `
      id,
      article_slug,
      article_language,
      article_title,
      article_url,
      parent_id,
      body,
      status,
      user_id,
      created_at,
      profiles:profile_id (
        id,
        username,
        display_name,
        ${includeAvatar ? 'avatar_path,' : ''}
        badge_key,
        role,
        user_badges (
          key,
          label_it,
          label_en,
          image_path
        )
      )
    `;

const withAvatarUrl = (profile: Record<string, unknown> | null | undefined) => {
  if (!profile) return profile;

  return {
    ...profile,
    avatar_url: getAvatarPublicUrl(String(profile.avatar_path || '')),
  };
};

export const GET: APIRoute = async ({ url, cookies }) => {
  const articleSlug = url.searchParams.get('articleSlug')?.trim() ?? '';
  const articleLanguage = url.searchParams.get('articleLanguage') === 'en' ? 'en' : 'it';

  if (!articleSlug) {
    return json({ ok: false, error: 'Parametro articleSlug mancante.' }, 400);
  }

  const fetchApprovedComments = async () => {
    let { data, error } = await supabaseAdmin
      .from('comments')
      .select(getCommentsSelect(true))
      .eq('article_slug', articleSlug)
      .eq('article_language', articleLanguage)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (isMissingAvatarColumnError(error)) {
      const fallbackResult = await supabaseAdmin
        .from('comments')
        .select(getCommentsSelect(false))
        .eq('article_slug', articleSlug)
        .eq('article_language', articleLanguage)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    return { data, error };
  };

  const [{ data, error }, session] = await Promise.all([
    fetchApprovedComments(),
    getUserSessionFromCookies(cookies),
  ]);

  if (error) {
    logApiError('comments-list.comments', error);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
  }

  const comments = data ?? [];
  const commentIds = comments.map((comment) => comment.id).filter(Boolean);
  const reactionSummaries = new Map<string, CommentReactionSummary>();

  let currentUserId: string | null = null;
  currentUserId = session.user?.id ?? null;

  if (commentIds.length > 0) {
    const { data: reactionRows, error: reactionError } = await supabaseAdmin
      .from('comment_reactions')
      .select('comment_id, user_id, reaction')
      .in('comment_id', commentIds);

    if (!reactionError) {
      for (const row of reactionRows ?? []) {
        const commentId = String(row.comment_id || '');
        const summary = reactionSummaries.get(commentId) ?? emptyReactionSummary();

        if (row.reaction === 'like') {
          summary.likeCount += 1;
        }

        if (row.reaction === 'dislike') {
          summary.dislikeCount += 1;
        }

        if (currentUserId && row.user_id === currentUserId) {
          summary.userReaction = row.reaction === 'dislike' ? 'dislike' : 'like';
        }

        reactionSummaries.set(commentId, summary);
      }
    }
  }

  const roots = comments.filter((comment) => !comment.parent_id);
  const replies = comments.filter((comment) => comment.parent_id);
  const withReactionSummary = (comment: (typeof comments)[number]) => {
    const { user_id: userId, ...publicComment } = comment;
    const isOwnComment = Boolean(currentUserId && userId === currentUserId);

    return {
      ...publicComment,
      profiles: withAvatarUrl(publicComment.profiles),
      ...(reactionSummaries.get(comment.id) ?? emptyReactionSummary()),
      isOwnComment,
      canReact: Boolean(currentUserId && !isOwnComment),
    };
  };

  const threadedComments = roots.map((comment) => ({
    ...withReactionSummary(comment),
    replies: replies
      .filter((reply) => reply.parent_id === comment.id)
      .map(withReactionSummary),
  }));

  return json({
    ok: true,
    comments: threadedComments,
  });
};
