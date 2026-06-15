import type { Post } from '../posts';
import { supabaseAdmin } from './server';

type CountablePost = Pick<Post, 'slug' | 'language'>;

const COMMENT_COUNT_BATCH_SIZE = 100;

const normalizeLanguage = (language?: string | null, fallbackLanguage: 'it' | 'en' = 'it') =>
  language === 'en' ? 'en' : fallbackLanguage;

export const getCommentCountKey = (
  slug?: string | null,
  language?: string | null,
  fallbackLanguage: 'it' | 'en' = 'it'
) => {
  if (!slug) return '';

  return `${normalizeLanguage(language, fallbackLanguage)}:${slug}`;
};

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

export async function getApprovedCommentCountMap(
  posts: CountablePost[] = [],
  fallbackLanguage: 'it' | 'en' = 'it'
) {
  const slugsByLanguage = new Map<'it' | 'en', Set<string>>();

  for (const post of posts) {
    if (!post?.slug) continue;

    const language = normalizeLanguage(post.language, fallbackLanguage);
    const slugs = slugsByLanguage.get(language) ?? new Set<string>();
    slugs.add(post.slug);
    slugsByLanguage.set(language, slugs);
  }

  const countMap = new Map<string, number>();

  await Promise.all(
    [...slugsByLanguage.entries()].flatMap(([language, slugSet]) =>
      chunk([...slugSet], COMMENT_COUNT_BATCH_SIZE).map(async (slugs) => {
        const { data, error } = await supabaseAdmin
          .from('comments')
          .select('article_slug, article_language')
          .eq('status', 'approved')
          .eq('article_language', language)
          .in('article_slug', slugs);

        if (error) {
          console.error('Approved comment count query failed:', {
            code: error.code,
            message: error.message,
          });
          return;
        }

        for (const row of data ?? []) {
          const key = getCommentCountKey(row.article_slug, row.article_language, language);

          if (!key) continue;

          countMap.set(key, (countMap.get(key) ?? 0) + 1);
        }
      })
    )
  );

  return countMap;
}

export function attachApprovedCommentCounts<T extends CountablePost>(
  posts: T[] = [],
  countMap: Map<string, number>,
  fallbackLanguage: 'it' | 'en' = 'it'
) {
  return posts.map((post) => ({
    ...post,
    commentCount: countMap.get(getCommentCountKey(post.slug, post.language, fallbackLanguage)) ?? 0,
  }));
}

export async function withApprovedCommentCounts<T extends CountablePost>(
  posts: T[] = [],
  fallbackLanguage: 'it' | 'en' = 'it'
) {
  const countMap = await getApprovedCommentCountMap(posts, fallbackLanguage);

  return attachApprovedCommentCounts(posts, countMap, fallbackLanguage);
}
