import type { Post } from './posts';

export const cleanReviewRatingPostId = (value: unknown) =>
  String(value || '').trim().replace(/^drafts\./, '');

export const getCanonicalReviewRatingPostId = (post?: Pick<Post, '_id' | 'language' | 'translationOf'> | null) => {
  if (!post) {
    return '';
  }

  return cleanReviewRatingPostId(
    post.language === 'en' && post.translationOf?._id
      ? post.translationOf._id
      : post._id
  );
};

export const isValidReviewRatingScore = (score: number) =>
  Number.isFinite(score) &&
  score >= 1 &&
  score <= 10 &&
  Number.isInteger(score * 2);

export const roundReviewRatingScore = (score: number) =>
  Math.round(score * 10) / 10;

export const formatReviewRatingScore = (value: unknown) => {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return '—';
  }

  return Number.isInteger(score)
    ? String(score)
    : score.toFixed(1);
};

export const getReviewMetadataMap = (posts: Post[] = [], lang: 'it' | 'en' = 'it') => {
  const map = new Map<string, Post>();

  for (const post of posts) {
    if (post.type !== 'review') {
      continue;
    }

    const postId = getCanonicalReviewRatingPostId(post);

    if (!postId) {
      continue;
    }

    const existing = map.get(postId);
    const postLang = post.language || 'it';

    if (!existing || ((existing.language || 'it') !== lang && postLang === lang)) {
      map.set(postId, post);
    }
  }

  return map;
};
