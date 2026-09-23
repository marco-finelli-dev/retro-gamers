import { client } from './sanity';
import { urlFor } from './image.js';
import { getPostUrl } from './routes.js';
import {
  PUBLIC_POST_GROQ_FILTER,
  sortPostsForHome,
  type Post
} from './posts';

export const HOME_LATEST_PAGE_SIZE = 10;

export type HomeLatestItem = {
  id: string;
  title: string;
  url: string;
  image: string;
  alt: string;
  kicker: string;
  secondary?: string;
  excerpt: string;
  commentCount: number;
};

const stripHtml = (value = '') => String(value).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();

const excerptFor = (post: Post) => stripHtml(
  post.cardExcerpt || post.subtitle || post.excerpt || ''
);

const typeLabel = (type = '', language: 'it' | 'en') => {
  const labels = language === 'en'
    ? {
        review: 'Review', article: 'Article', guide: 'Guide', interview: 'Interview',
        news: 'News', feature: 'Feature', special: 'Feature', memories: 'Memories', hardware: 'Hardware'
      }
    : {
        review: 'Recensione', article: 'Articolo', guide: 'Guida', interview: 'Intervista',
        news: 'News', feature: 'Speciale', special: 'Speciale', memories: 'Memories', hardware: 'Hardware'
      };

  return labels[type as keyof typeof labels] || type || (language === 'en' ? 'Article' : 'Articolo');
};

const secondaryFor = (post: Post, language: 'it' | 'en') => {
  const category = post.categories?.[0];

  return language === 'en'
    ? category?.nameEn || category?.name
    : category?.name || category?.nameEn;
};

const hasImage = (post: Post) => Boolean(post.featuredImage?.asset?.url);

export const getHomePostKey = (post: Pick<Post, '_id' | 'slug'> | null | undefined) =>
  post?._id?.replace(/^drafts\./, '') || post?.slug || '';

const isLanguageMatch = (post: Post, language: 'it' | 'en') =>
  language === 'en' ? post.language === 'en' : post.language !== 'en';

export const getHomeLatestPosts = (
  posts: Post[] = [],
  language: 'it' | 'en',
  excludedIds: Iterable<string> = [],
  limit = HOME_LATEST_PAGE_SIZE
) => {
  const excluded = new Set(excludedIds);

  return sortPostsForHome(posts)
    .filter((post) => isLanguageMatch(post, language))
    .filter((post) => post.type !== 'memories')
    .filter(hasImage)
    .filter((post) => !excluded.has(getHomePostKey(post)))
    .slice(0, limit);
};

export const toHomeLatestItem = (post: Post, language: 'it' | 'en'): HomeLatestItem => {
  const kicker = typeLabel(post.type, language);
  const candidateSecondary = secondaryFor(post, language);
  const secondary = candidateSecondary?.toLocaleLowerCase() === kicker.toLocaleLowerCase()
    ? undefined
    : candidateSecondary;

  return {
    id: getHomePostKey(post),
    title: post.title,
    url: getPostUrl(post),
    image: post.featuredImage?.asset
      ? urlFor(post.featuredImage).width(240).height(240).fit('crop').quality(74).auto('format').url()
      : '/og-image.webp',
    alt: post.featuredImage?.alt || post.title || '',
    kicker,
    secondary,
    excerpt: excerptFor(post),
    commentCount: Number((post as Post & { commentCount?: number }).commentCount || 0)
  };
};

const homeLatestProjection = `{
  _id,
  title,
  "slug": slug.current,
  excerpt,
  cardExcerpt,
  subtitle,
  publishedAt,
  lastUpdated,
  promoteOnUpdate,
  type,
  language,
  featuredImage {
    asset->{ url },
    alt
  },
  categories[]->{
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current
  },
  "homeSort": select(
    promoteOnUpdate == true && defined(lastUpdated) => lastUpdated,
    defined(publishedAt) => publishedAt,
    _createdAt
  )
}`;

export const getHomeLatestPage = async (
  language: 'it' | 'en',
  excludedIds: string[] = [],
  limit = HOME_LATEST_PAGE_SIZE
) => {
  const posts = await client.fetch<Post[]>(
    `*[
      _type == "article" &&
      defined(slug.current) &&
      ${PUBLIC_POST_GROQ_FILTER} &&
      !(_id in path("drafts.**")) &&
      defined(featuredImage.asset) &&
      type != "memories" &&
      !(_id in $excludedIds) &&
      (
        ($language == "en" && language == "en") ||
        ($language == "it" && (!defined(language) || language != "en"))
      )
    ] ${homeLatestProjection} | order(homeSort desc)[0...$limit]`,
    { language, excludedIds, limit }
  );

  return posts || [];
};
