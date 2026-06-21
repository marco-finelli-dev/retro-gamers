import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
import { calculateCommunityPoints } from '../../../lib/community-points';
import { getUserSessionFromCookies, isBlockedProfileStatus, isStaffProfile } from '../../../lib/supabase/auth';
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

const COMMENT_EDIT_WINDOW_MS = 10 * 60 * 1000;

type AuthorCommunityStats = {
  approvedComments: number;
  receivedLikes: number;
  reviewRatings: number;
  communityPoints: number;
};

const getEmptyAuthorStats = (): AuthorCommunityStats => ({
  approvedComments: 0,
  receivedLikes: 0,
  reviewRatings: 0,
  communityPoints: calculateCommunityPoints({}),
});

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const isReviewRatingsUnavailable = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('review_ratings')
  );
};

const fetchAuthorCommunityStats = async (userIds: string[]) => {
  const uniqueUserIds = [...new Set(userIds.map((userId) => String(userId || '').trim()).filter(Boolean))];
  const stats = new Map<string, AuthorCommunityStats>();

  for (const userId of uniqueUserIds) {
    stats.set(userId, getEmptyAuthorStats());
  }

  if (uniqueUserIds.length === 0) {
    return stats;
  }

  const approvedCommentOwnerById = new Map<string, string>();
  const pageSize = 1000;

  for (const userIdChunk of chunkArray(uniqueUserIds, 100)) {
    for (let from = 0; from < 20000; from += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('comments')
        .select('id, user_id')
        .eq('status', 'approved')
        .in('user_id', userIdChunk)
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      for (const comment of data ?? []) {
        const userId = String(comment.user_id || '');
        const commentId = String(comment.id || '');

        if (!userId) continue;

        const current = stats.get(userId) ?? getEmptyAuthorStats();
        current.approvedComments += 1;
        stats.set(userId, current);

        if (commentId) {
          approvedCommentOwnerById.set(commentId, userId);
        }
      }

      if ((data ?? []).length < pageSize) {
        break;
      }
    }
  }

  for (const commentIdChunk of chunkArray([...approvedCommentOwnerById.keys()], 500)) {
    const { data, error } = await supabaseAdmin
      .from('comment_reactions')
      .select('comment_id')
      .eq('reaction', 'like')
      .in('comment_id', commentIdChunk);

    if (error) {
      throw error;
    }

    for (const reaction of data ?? []) {
      const commentId = String(reaction.comment_id || '');
      const userId = approvedCommentOwnerById.get(commentId);

      if (!userId) continue;

      const current = stats.get(userId) ?? getEmptyAuthorStats();
      current.receivedLikes += 1;
      stats.set(userId, current);
    }
  }

  for (const userIdChunk of chunkArray(uniqueUserIds, 100)) {
    for (let from = 0; from < 20000; from += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('review_ratings')
        .select('user_id')
        .in('user_id', userIdChunk)
        .range(from, from + pageSize - 1);

      if (error) {
        if (isReviewRatingsUnavailable(error)) {
          break;
        }

        throw error;
      }

      for (const rating of data ?? []) {
        const userId = String(rating.user_id || '');

        if (!userId) continue;

        const current = stats.get(userId) ?? getEmptyAuthorStats();
        current.reviewRatings += 1;
        stats.set(userId, current);
      }

      if ((data ?? []).length < pageSize) {
        break;
      }
    }
  }

  for (const [userId, current] of stats.entries()) {
    current.communityPoints = calculateCommunityPoints({
      approvedComments: current.approvedComments,
      receivedLikes: current.receivedLikes,
      reviewRatings: current.reviewRatings,
    });
    stats.set(userId, current);
  }

  return stats;
};

const getViewerState = (session: Awaited<ReturnType<typeof getUserSessionFromCookies>>) => {
  const profile = session.profile;
  const isAuthenticated = Boolean(session.user && profile && !session.error);
  const canComment = Boolean(isAuthenticated && !isBlockedProfileStatus(profile?.status));

  if (!isAuthenticated || !profile) {
    return {
      isAuthenticated: false,
      profileId: null,
      userId: null,
      username: '',
      displayName: '',
      role: '',
      status: '',
      canComment: false,
      canAutoApprove: false,
    };
  }

  return {
    isAuthenticated: true,
    profileId: profile.id,
    userId: session.user?.id ?? null,
    username: profile.username ?? '',
    displayName: profile.display_name ?? '',
    role: profile.role ?? '',
    status: profile.status ?? '',
    canComment,
    canAutoApprove: isStaffProfile(profile),
  };
};

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

  const session = await getUserSessionFromCookies(cookies);
  const viewer = getViewerState(session);
  const currentUserId = viewer.canComment ? session.user?.id ?? null : null;

  const fetchArticleComments = async (includeAvatar = true) => {
    const { data: approvedComments, error: approvedError } = await supabaseAdmin
      .from('comments')
      .select(getCommentsSelect(includeAvatar))
      .eq('article_slug', articleSlug)
      .eq('article_language', articleLanguage)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (approvedError) {
      return { data: null, error: approvedError };
    }

    if (!currentUserId) {
      return { data: approvedComments ?? [], error: null };
    }

    const { data: pendingComments, error: pendingError } = await supabaseAdmin
      .from('comments')
      .select(getCommentsSelect(includeAvatar))
      .eq('article_slug', articleSlug)
      .eq('article_language', articleLanguage)
      .eq('status', 'pending')
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: true });

    if (pendingError) {
      return { data: null, error: pendingError };
    }

    return {
      data: [...(approvedComments ?? []), ...(pendingComments ?? [])],
      error: null,
    };
  };

  let { data, error } = await fetchArticleComments(true);

  if (isMissingAvatarColumnError(error)) {
    const fallbackResult = await fetchArticleComments(false);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    logApiError('comments-list.comments', error);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
  }

  const comments = data ?? [];
  const authorUserIds = comments.map((comment) => String(comment.user_id || '')).filter(Boolean);
  const commentIds = comments.map((comment) => comment.id).filter(Boolean);
  const reactionSummaries = new Map<string, CommentReactionSummary>();
  let authorCommunityStats = new Map<string, AuthorCommunityStats>();

  try {
    authorCommunityStats = await fetchAuthorCommunityStats(authorUserIds);
  } catch (statsError) {
    logApiError('comments-list.author-community-stats', statsError);
    authorCommunityStats = new Map(
      [...new Set(authorUserIds)].map((userId) => [userId, getEmptyAuthorStats()])
    );
  }

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
  const repliesByParentId = new Map<string, typeof comments>();

  for (const comment of comments) {
    if (!comment.parent_id) continue;

    const parentId = String(comment.parent_id);
    const replies = repliesByParentId.get(parentId) ?? [];
    replies.push(comment);
    repliesByParentId.set(parentId, replies);
  }
  const canEditComment = (comment: (typeof comments)[number]) => {
    if (!currentUserId || comment.user_id !== currentUserId) {
      return false;
    }

    if (comment.status === 'pending') {
      return true;
    }

    if (comment.status !== 'approved' || !comment.created_at) {
      return false;
    }

    const createdAt = new Date(comment.created_at).getTime();

    return Number.isFinite(createdAt) && Date.now() - createdAt <= COMMENT_EDIT_WINDOW_MS;
  };
  const withReactionSummary = (comment: (typeof comments)[number]) => {
    const { user_id: userId, ...publicComment } = comment;
    const isOwnComment = Boolean(currentUserId && userId === currentUserId);
    const profileWithAvatar = withAvatarUrl(publicComment.profiles);
    const authorStats = userId ? authorCommunityStats.get(String(userId)) : null;

    return {
      ...publicComment,
      profiles: profileWithAvatar
        ? {
            ...profileWithAvatar,
            community_points: authorStats?.communityPoints ?? calculateCommunityPoints({}),
          }
        : profileWithAvatar,
      ...(reactionSummaries.get(comment.id) ?? emptyReactionSummary()),
      isOwnComment,
      canReact: Boolean(currentUserId && !isOwnComment && comment.status === 'approved'),
      canReport: Boolean(currentUserId && !isOwnComment && comment.status === 'approved'),
      canEdit: canEditComment(comment),
    };
  };

  const threadedComments = roots.map((comment) => ({
    ...withReactionSummary(comment),
    replies: (repliesByParentId.get(String(comment.id)) ?? [])
      .map(withReactionSummary),
  }));

  return json({
    ok: true,
    viewer,
    comments: threadedComments,
  });
};
