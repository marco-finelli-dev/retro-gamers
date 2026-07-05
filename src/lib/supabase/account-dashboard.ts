import { getInterestArticles, type InterestArticle } from '../interest-articles';
import {
  getAccountMessages,
  getUnreadAccountMessageCount,
} from './account-messages';
import { getUnreadPrivateMessageCount } from './private-messages';
import {
  getCommentArticleHref,
  getCommentExcerpt,
  type PublicReaderComment,
} from './public-profiles';
import { supabaseAdmin } from './server';
import { getUserInterestsForUser } from './user-interests';

type AccountDashboardLang = 'it' | 'en';

export type AccountDashboardComment = {
  id: string;
  excerpt: string;
  articleTitle: string;
  href: string;
  createdAt: string | null;
};

export type AccountDashboardRetention = {
  unreadSystemMessagesCount: number;
  unreadPrivateMessagesCount: number;
  latestApprovedComments: AccountDashboardComment[];
  pendingCommentsCount: number;
  suggestedArticlesFromInterests: InterestArticle[];
  hasInterests: boolean;
  latestSystemMessage: {
    id: string;
    title: string;
    href: string;
    createdAt: string;
  } | null;
};

const emptyRetention: AccountDashboardRetention = {
  unreadSystemMessagesCount: 0,
  unreadPrivateMessagesCount: 0,
  latestApprovedComments: [],
  pendingCommentsCount: 0,
  suggestedArticlesFromInterests: [],
  hasInterests: false,
  latestSystemMessage: null,
};

const logDashboardError = (context: string, error: unknown) => {
  console.error('[account-dashboard]', context, error);
};

const toAccountDashboardComment = (comment: PublicReaderComment): AccountDashboardComment => ({
  id: comment.id,
  excerpt: getCommentExcerpt(comment.body, 180),
  articleTitle: comment.article_title || '',
  href: getCommentArticleHref(comment),
  createdAt: comment.created_at || null,
});

export async function getAccountDashboardRetention(
  userId?: string | null,
  lang: AccountDashboardLang = 'it'
): Promise<AccountDashboardRetention> {
  if (!userId) {
    return { ...emptyRetention };
  }

  const [
    unreadSystemResult,
    unreadPrivateResult,
    latestMessagesResult,
    latestCommentsResult,
    pendingCommentsResult,
    interestsResult,
  ] = await Promise.all([
    getUnreadAccountMessageCount(userId),
    getUnreadPrivateMessageCount(userId),
    getAccountMessages(userId, 1),
    supabaseAdmin
      .from('comments')
      .select('id, body, created_at, article_title, article_url, article_slug, article_language')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(3),
    supabaseAdmin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .is('deleted_at', null),
    getUserInterestsForUser(userId, 'account-dashboard.interests'),
  ]);

  if (latestCommentsResult.error) {
    logDashboardError('latest-approved-comments', latestCommentsResult.error);
  }

  if (pendingCommentsResult.error) {
    logDashboardError('pending-comments', pendingCommentsResult.error);
  }

  const interests = interestsResult.interests;
  let suggestedArticlesFromInterests: InterestArticle[] = [];

  if (interests.length > 0) {
    suggestedArticlesFromInterests = await getInterestArticles(interests, lang, 3);
  }

  const latestSystemMessage = latestMessagesResult.messages[0]
    ? {
        id: latestMessagesResult.messages[0].id,
        title: latestMessagesResult.messages[0].title,
        href: latestMessagesResult.messages[0].action_url || (lang === 'en' ? '/en/account/messages/' : '/account/messages/'),
        createdAt: latestMessagesResult.messages[0].created_at,
      }
    : null;

  return {
    unreadSystemMessagesCount: unreadSystemResult.error ? 0 : unreadSystemResult.count,
    unreadPrivateMessagesCount: unreadPrivateResult.error ? 0 : unreadPrivateResult.count,
    latestApprovedComments: latestCommentsResult.error
      ? []
      : ((latestCommentsResult.data ?? []) as PublicReaderComment[]).map(toAccountDashboardComment),
    pendingCommentsCount: pendingCommentsResult.error ? 0 : pendingCommentsResult.count ?? 0,
    suggestedArticlesFromInterests,
    hasInterests: interests.length > 0,
    latestSystemMessage,
  };
}
