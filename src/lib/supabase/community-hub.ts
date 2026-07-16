import type { Post } from '../posts';
import { getPostUrl } from '../routes.js';
import { getReaderBadgeImageSrcForBadge } from '../badges';
import { getCommentArticleHref, getCommentExcerpt, getPublicUserUrl } from './public-profiles';
import { getAvatarPublicUrl } from './avatars';
import { isMissingGuestCommentSchemaError } from './guest-comments';
import { supabaseAdmin } from './server';

type CommunityHubLang = 'it' | 'en';

export type CommunityHubComment = {
  id: string;
  excerpt: string;
  createdAt: string | null;
  authorName: string;
  profileUrl: string | null;
  avatarUrl: string | null;
  badgeLabel: string | null;
  badgeImageUrl: string | null;
  articleTitle: string;
  articleUrl: string;
  authorType: 'registered' | 'guest';
};

export type CommunityHubDiscussedPost = {
  title: string;
  excerpt: string;
  url: string;
  imageUrl: string | null;
  commentCount: number;
};

export type CommunityHubStats = {
  approvedComments: number;
  readerRatings: number;
  activeProfiles: number;
  discussedArticles: number;
};

const normalizeLang = (lang: string | null | undefined): CommunityHubLang =>
  lang === 'en' ? 'en' : 'it';

const applyCommentLanguageFilter = (query: any, lang: CommunityHubLang) =>
  lang === 'en'
    ? query.eq('article_language', 'en')
    : query.or('article_language.is.null,article_language.eq.it');

function getPublicArticleSlugSet(posts: Post[] = [], lang: CommunityHubLang) {
  return new Set(
    posts
      .filter((post) => (post.language || 'it') === lang)
      .map((post) => String(post.slug || '').trim())
      .filter(Boolean)
  );
}

const countRows = async (
  table: string,
  applyFilters: (query: any) => unknown
) => {
  const baseQuery = supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true });
  const { count, error } = await applyFilters(baseQuery) as {
    count: number | null;
    error: { code?: string; message?: string } | null;
  };

  if (error) {
    console.error(`Community hub count failed for ${table}:`, {
      code: error.code,
      message: error.message,
    });
    return 0;
  }

  return count ?? 0;
};

export async function getLatestCommunityComments(
  lang: CommunityHubLang = 'it',
  limit = 6,
  publicPosts: Post[] = []
): Promise<CommunityHubComment[]> {
  const language = normalizeLang(lang);
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 10);
  const publicArticleSlugs = getPublicArticleSlugSet(publicPosts, language);
  const fetchComments = async (includeGuestFields: boolean) => {
    const query = supabaseAdmin
      .from('comments')
      .select(`
        id,
        body,
        created_at,
        article_title,
        article_url,
        article_slug,
        article_language,
        ${includeGuestFields ? 'author_type, guest_display_name,' : ''}
        profiles:profile_id (
          username,
          display_name,
          avatar_path,
          user_badges (
            key,
            label_it,
            label_en,
            image_path
          )
        )
      `)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(publicArticleSlugs.size > 0 ? safeLimit * 3 : safeLimit);

    return applyCommentLanguageFilter(query, language);
  };

  let includeGuestFields = true;
  let { data, error } = await fetchComments(includeGuestFields);

  if (isMissingGuestCommentSchemaError(error)) {
    includeGuestFields = false;
    const fallbackResult = await fetchComments(includeGuestFields);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error('Community hub latest comments failed:', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? [])
    .filter((comment) => {
      if (publicArticleSlugs.size === 0) return true;

      const slug = String(comment.article_slug || '').trim();

      return slug && publicArticleSlugs.has(slug);
    })
    .slice(0, safeLimit)
    .map((comment) => {
    const profile = Array.isArray(comment.profiles)
      ? comment.profiles[0]
      : comment.profiles;
    const badge = Array.isArray(profile?.user_badges)
      ? profile?.user_badges[0]
      : profile?.user_badges;
    const username = String(profile?.username || '').trim();
    const isGuest = includeGuestFields && comment.author_type === 'guest';
    const badgeLabel = lang === 'en'
      ? badge?.label_en || badge?.label_it || null
      : badge?.label_it || badge?.label_en || null;

    return {
      id: String(comment.id),
      excerpt: getCommentExcerpt(comment.body, 190),
      createdAt: comment.created_at ?? null,
      authorName: isGuest
        ? comment.guest_display_name || (lang === 'en' ? 'Guest' : 'Ospite')
        : profile?.display_name || username || (lang === 'en' ? 'Reader' : 'Lettore'),
      profileUrl: !isGuest && username ? getPublicUserUrl(username, lang) : null,
      avatarUrl: isGuest ? null : getAvatarPublicUrl(profile?.avatar_path),
      badgeLabel: isGuest ? (lang === 'en' ? 'Guest' : 'Ospite') : badgeLabel,
      badgeImageUrl: isGuest ? null : getReaderBadgeImageSrcForBadge(badge),
      articleTitle: comment.article_title || (lang === 'en' ? 'Article' : 'Articolo'),
      articleUrl: getCommentArticleHref(comment),
      authorType: isGuest ? 'guest' : 'registered',
    };
    });
}

export async function getMostDiscussedPosts(
  posts: Post[] = [],
  lang: CommunityHubLang = 'it',
  limit = 6
): Promise<CommunityHubDiscussedPost[]> {
  const language = normalizeLang(lang);
  const safeLimit = Math.min(Math.max(Number(limit) || 6, 1), 6);
  const query = supabaseAdmin
    .from('comments')
    .select('article_slug')
    .eq('status', 'approved')
    .is('deleted_at', null)
    .limit(5000);
  const { data, error } = await applyCommentLanguageFilter(query, language);

  if (error) {
    console.error('Community hub most discussed posts failed:', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  const commentCountsBySlug = new Map<string, number>();

  for (const row of data ?? []) {
    const slug = String(row.article_slug || '').trim();

    if (!slug) continue;

    commentCountsBySlug.set(slug, (commentCountsBySlug.get(slug) ?? 0) + 1);
  }

  return posts
    .filter((post) => (post.language || 'it') === language)
    .map((post) => ({
      title: post.title,
      excerpt: post.cardExcerpt || post.excerpt || '',
      url: getPostUrl(post),
      imageUrl: post.featuredImage?.asset?.url || null,
      commentCount: commentCountsBySlug.get(post.slug) ?? 0,
    }))
    .filter((post) => post.commentCount > 0)
    .sort((a, b) => b.commentCount - a.commentCount || a.title.localeCompare(b.title, language))
    .slice(0, safeLimit);
}

export async function getCommunityHubStats(
  lang: CommunityHubLang = 'it',
  publicPosts: Post[] = []
): Promise<CommunityHubStats> {
  const language = normalizeLang(lang);
  const publicArticleSlugs = getPublicArticleSlugSet(publicPosts, language);
  const [approvedComments, readerRatings, activeProfiles, discussedArticles] = await Promise.all([
    countRows('comments', (query: any) =>
      applyCommentLanguageFilter(
        query
        .eq('status', 'approved')
        .is('deleted_at', null),
        language
      )
    ),
    countRows('review_ratings', (query: any) => query),
    countRows('profiles', (query: any) => query.eq('status', 'active')),
    (async () => {
      const query = supabaseAdmin
        .from('comments')
        .select('article_slug')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .limit(5000);
      const { data, error } = await applyCommentLanguageFilter(query, language);

      if (error) {
        console.error('Community hub discussed articles count failed:', {
          code: error.code,
          message: error.message,
        });
        return 0;
      }

      return new Set(
        (data ?? [])
          .map((row) => String(row.article_slug || '').trim())
          .filter((slug) => slug && (
            publicArticleSlugs.size === 0 || publicArticleSlugs.has(slug)
          ))
      ).size;
    })(),
  ]);

  return {
    approvedComments,
    readerRatings,
    activeProfiles,
    discussedArticles,
  };
}
