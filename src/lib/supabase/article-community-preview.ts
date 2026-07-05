import { getAvatarPublicUrl } from './avatars';
import { getCommentExcerpt, getPublicUserUrl } from './public-profiles';
import { supabaseAdmin } from './server';

type ArticleCommunityPreviewLang = 'it' | 'en';

export type ArticleCommunityPreviewComment = {
  id: string;
  excerpt: string;
  createdAt: string | null;
  authorName: string;
  authorProfileUrl: string | null;
  avatarUrl: string | null;
};

const normalizeLang = (lang: string | null | undefined): ArticleCommunityPreviewLang =>
  lang === 'en' ? 'en' : 'it';

const getAuthorInitialFallback = (lang: ArticleCommunityPreviewLang) =>
  lang === 'en' ? 'Reader' : 'Lettore';

export async function getArticleCommunityPreview(
  articleSlug?: string | null,
  lang: ArticleCommunityPreviewLang = 'it',
  limit = 2
): Promise<ArticleCommunityPreviewComment[]> {
  const slug = String(articleSlug || '').trim();
  const language = normalizeLang(lang);
  const safeLimit = Math.min(Math.max(Number(limit) || 2, 1), 2);

  if (!slug) return [];

  const { data, error } = await supabaseAdmin
    .from('comments')
    .select(`
      id,
      body,
      created_at,
      profiles:profile_id (
        username,
        display_name,
        avatar_path
      )
    `)
    .eq('article_slug', slug)
    .eq('article_language', language)
    .eq('status', 'approved')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    console.error('Article community preview query failed:', {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).map((comment) => {
    const profile = Array.isArray(comment.profiles)
      ? comment.profiles[0]
      : comment.profiles;
    const username = String(profile?.username || '').trim();
    const authorName =
      profile?.display_name ||
      username ||
      getAuthorInitialFallback(language);

    return {
      id: String(comment.id),
      excerpt: getCommentExcerpt(comment.body, 180),
      createdAt: comment.created_at ?? null,
      authorName,
      authorProfileUrl: username ? getPublicUserUrl(username, language) : null,
      avatarUrl: getAvatarPublicUrl(profile?.avatar_path),
    };
  });
}
