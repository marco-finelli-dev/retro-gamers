import { client } from './sanity';
import { urlFor } from './image.js';
import { getPostUrl } from './routes.js';
import type { UserInterestRow } from './supabase/user-interests';

type InterestArticleMatch = {
  id: string;
  name: string;
};

type InterestArticleSource = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cardExcerpt?: string;
  type?: string;
  language?: 'it' | 'en' | string;
  publishedAt?: string;
  featuredImage?: {
    alt?: string;
    asset?: {
      url?: string;
    };
  };
  categories?: Array<{
    name?: string;
    nameEn?: string;
    slug?: string;
  }>;
  matchedPlatforms?: InterestArticleMatch[];
  matchedCreators?: InterestArticleMatch[];
  matchedDevelopers?: InterestArticleMatch[];
  matchedPublishers?: InterestArticleMatch[];
  matchedManufacturers?: InterestArticleMatch[];
};

export type InterestArticle = {
  id: string;
  title: string;
  href: string;
  excerpt: string;
  type: string;
  language: 'it' | 'en' | string;
  publishedAt?: string;
  imageUrl?: string;
  imageAlt?: string;
  categoryLabel: string;
  matches: string[];
};

const uniqueValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const getInterestIds = (interests: UserInterestRow[], type: UserInterestRow['target_type']) =>
  uniqueValues(
    interests
      .filter((interest) => interest.target_type === type)
      .map((interest) => interest.target_id)
  );

const getMatchNames = (
  post: InterestArticleSource,
  interestNameById: Map<string, string>
) => {
  const matches = [
    ...(post.matchedPlatforms || []),
    ...(post.matchedCreators || []),
    ...(post.matchedDevelopers || []),
    ...(post.matchedPublishers || []),
    ...(post.matchedManufacturers || []),
  ];

  return uniqueValues(
    matches.map((match) => interestNameById.get(match.id) || match.name || '')
  ).slice(0, 3);
};

const getCategoryLabel = (post: InterestArticleSource, lang: 'it' | 'en') => {
  const category = post.categories?.[0];

  if (category) {
    return lang === 'en'
      ? category.nameEn || category.name || ''
      : category.name || category.nameEn || '';
  }

  const typeLabels = {
    it: {
      review: 'Recensione',
      guide: 'Guida',
      feature: 'Speciale',
      interview: 'Intervista',
      memories: 'Memories',
      news: 'News',
      hardware: 'Hardware',
    },
    en: {
      review: 'Review',
      guide: 'Guide',
      feature: 'Feature',
      interview: 'Interview',
      memories: 'Memories',
      news: 'News',
      hardware: 'Hardware',
    },
  };

  return typeLabels[lang][post.type as keyof typeof typeLabels[typeof lang]] || post.type || '';
};

const getImageUrl = (post: InterestArticleSource) => {
  if (!post.featuredImage?.asset) return '';

  return urlFor(post.featuredImage)
    .width(640)
    .height(400)
    .fit('crop')
    .quality(72)
    .auto('format')
    .url();
};

export async function getInterestArticles(
  interests: UserInterestRow[],
  lang: 'it' | 'en' = 'it',
  limit = 4
): Promise<InterestArticle[]> {
  const platformIds = getInterestIds(interests, 'platform');
  const creatorIds = getInterestIds(interests, 'creator');
  const companyIds = getInterestIds(interests, 'company');
  const allIds = [...platformIds, ...creatorIds, ...companyIds];

  if (allIds.length === 0) {
    return [];
  }

  const interestNameById = new Map(
    interests.map((interest) => [interest.target_id, interest.target_name])
  );

  let posts: InterestArticleSource[] = [];

  try {
    posts = await client.fetch<InterestArticleSource[]>(`
      *[
        _type == "article" &&
        defined(slug.current) &&
        coalesce(isPublic, false) == true &&
        !(_id in path("drafts.**")) &&
        (
          ($lang == "en" && language == "en") ||
          ($lang != "en" && (!defined(language) || language != "en"))
        ) &&
        (
          count(platforms[@._ref in $platformIds]) > 0 ||
          count(creators[@._ref in $creatorIds]) > 0 ||
          count(developers[@._ref in $companyIds]) > 0 ||
          count(publishers[@._ref in $companyIds]) > 0 ||
          count(manufacturer[@._ref in $companyIds]) > 0
        )
      ] | order(coalesce(publishedAt, _createdAt) desc)[0...$limit] {
        _id,
        title,
        "slug": slug.current,
        excerpt,
        cardExcerpt,
        type,
        language,
        publishedAt,
        featuredImage {
          alt,
          asset->{ url }
        },
        categories[]->{
          "name": coalesce(name, title),
          "nameEn": coalesce(nameEn, titleEn),
          "slug": slug.current
        },
        "matchedPlatforms": platforms[@._ref in $platformIds]->{
          "id": _id,
          name
        },
        "matchedCreators": creators[@._ref in $creatorIds]->{
          "id": _id,
          name
        },
        "matchedDevelopers": developers[@._ref in $companyIds]->{
          "id": _id,
          "name": coalesce(name, title)
        },
        "matchedPublishers": publishers[@._ref in $companyIds]->{
          "id": _id,
          "name": coalesce(name, title)
        },
        "matchedManufacturers": manufacturer[@._ref in $companyIds]->{
          "id": _id,
          "name": coalesce(name, title)
        }
      }
    `, {
      lang,
      limit,
      platformIds,
      creatorIds,
      companyIds,
    });
  } catch (error) {
    console.error('[interest-articles] Could not fetch related articles', error);
    return [];
  }

  return (posts || [])
    .map((post) => ({
      id: post._id,
      title: post.title,
      href: getPostUrl(post),
      excerpt: post.cardExcerpt || post.excerpt || '',
      type: post.type || 'article',
      language: post.language || 'it',
      publishedAt: post.publishedAt,
      imageUrl: getImageUrl(post),
      imageAlt: post.featuredImage?.alt || post.title,
      categoryLabel: getCategoryLabel(post, lang),
      matches: getMatchNames(post, interestNameById),
    }))
    .filter((post) => post.title && post.href && post.matches.length > 0);
}
