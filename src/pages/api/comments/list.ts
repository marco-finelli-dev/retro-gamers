import type { APIRoute } from 'astro';
import { logApiError } from '../../../lib/api-errors';
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
  const commentIds = comments.map((comment) => comment.id).filter(Boolean);
  const reactionSummaries = new Map<string, CommentReactionSummary>();

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

    return {
      ...publicComment,
      profiles: withAvatarUrl(publicComment.profiles),
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
