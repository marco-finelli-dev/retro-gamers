import { supabaseAdmin } from './server';
import { calculateCommunityPoints } from '../community-points';

export type CommunityStats = {
  approved: number;
  pending: number;
  likesReceived: number;
  dislikesReceived: number;
  reviewRatings: number;
  communityPoints: number;
};

export const emptyCommunityStats: CommunityStats = {
  approved: 0,
  pending: 0,
  likesReceived: 0,
  dislikesReceived: 0,
  reviewRatings: 0,
  communityPoints: calculateCommunityPoints({}),
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

export async function getCommunityStats(userId?: string | null): Promise<CommunityStats> {
  if (!userId) {
    return { ...emptyCommunityStats };
  }

  const stats = { ...emptyCommunityStats };
  const { count: reviewRatingsCount, error: reviewRatingsError } = await supabaseAdmin
    .from('review_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (reviewRatingsError && !isReviewRatingsUnavailable(reviewRatingsError)) {
    console.error('Community stats review ratings query failed:', {
      code: reviewRatingsError.code,
      message: reviewRatingsError.message,
    });
  }

  stats.reviewRatings = reviewRatingsError ? 0 : reviewRatingsCount ?? 0;

  const { data: userComments, error: userCommentsError } = await supabaseAdmin
    .from('comments')
    .select('id, status')
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (userCommentsError) {
    console.error('Community stats comments query failed:', {
      code: userCommentsError.code,
      message: userCommentsError.message,
    });
    stats.communityPoints = calculateCommunityPoints({
      reviewRatings: stats.reviewRatings,
    });
    return stats;
  }

  const commentIds = (userComments ?? [])
    .map((comment) => comment.id)
    .filter(Boolean);

  for (const comment of userComments ?? []) {
    if (comment.status === 'approved') {
      stats.approved += 1;
    }

    if (comment.status === 'pending') {
      stats.pending += 1;
    }
  }

  if (commentIds.length === 0) {
    stats.communityPoints = calculateCommunityPoints({
      reviewRatings: stats.reviewRatings,
    });
    return stats;
  }

  const { data: receivedReactions, error: reactionsError } = await supabaseAdmin
    .from('comment_reactions')
    .select('reaction')
    .in('comment_id', commentIds);

  if (reactionsError) {
    console.error('Community stats reactions query failed:', {
      code: reactionsError.code,
      message: reactionsError.message,
    });
    stats.communityPoints = calculateCommunityPoints({
      approvedComments: stats.approved,
      reviewRatings: stats.reviewRatings,
    });
    return stats;
  }

  for (const reaction of receivedReactions ?? []) {
    if (reaction.reaction === 'like') {
      stats.likesReceived += 1;
    }

    if (reaction.reaction === 'dislike') {
      stats.dislikesReceived += 1;
    }
  }

  stats.communityPoints = calculateCommunityPoints({
    approvedComments: stats.approved,
    receivedLikes: stats.likesReceived,
    reviewRatings: stats.reviewRatings,
  });

  return stats;
}
