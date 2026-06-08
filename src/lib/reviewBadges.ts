type ReviewBadgeKey = 'top' | 'must' | 'good';

type ReviewBadge = {
  key: ReviewBadgeKey;
  src: string;
  alt: string;
};

const badgeAlt: Record<ReviewBadgeKey, { it: string; en: string }> = {
  top: {
    it: 'Scelta della redazione',
    en: 'Editor’s Choice'
  },
  must: {
    it: 'Da non perdere',
    en: 'Must Play'
  },
  good: {
    it: 'Consigliato',
    en: 'Recommended'
  }
};

const getBadgeKey = (score: unknown): ReviewBadgeKey | null => {
  const value = Number(score);

  if (!Number.isFinite(value) || value < 8.5) return null;
  if (value >= 9.5) return 'top';
  if (value >= 9.0) return 'must';

  return 'good';
};

const getBadge = (
  score: unknown,
  lang = 'it',
  variant: 'full' | 'ribbon'
): ReviewBadge | null => {
  const key = getBadgeKey(score);
  if (!key) return null;

  const locale = lang === 'en' ? 'en' : 'it';
  const suffix = variant === 'ribbon' ? `-ribbon-${locale}` : `-${locale}`;

  return {
    key,
    src: `/images/badges/review-${key}${suffix}.webp`,
    alt: badgeAlt[key][locale]
  };
};

export const getReviewBadge = (score: unknown, lang = 'it') =>
  getBadge(score, lang, 'full');

export const getReviewRibbonBadge = (score: unknown, lang = 'it') =>
  getBadge(score, lang, 'ribbon');
