import { supabaseAdmin } from './server';

export type CommunityStats = {
  approved: number;
  pending: number;
  likesReceived: number;
  dislikesReceived: number;
};

export const emptyCommunityStats: CommunityStats = {
  approved: 0,
  pending: 0,
  likesReceived: 0,
  dislikesReceived: 0,
};

export async function getCommunityStats(userId?: string | null): Promise<CommunityStats> {
  if (!userId) {
    return { ...emptyCommunityStats };
  }

  const stats = { ...emptyCommunityStats };
  const { data: userComments, error: userCommentsError } = await supabaseAdmin
    .from('comments')
    .select('id, status')
    .eq('user_id', userId);

  if (userCommentsError) {
    console.error('Community stats comments query failed:', {
      code: userCommentsError.code,
      message: userCommentsError.message,
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

  return stats;
}
