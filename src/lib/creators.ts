import { client } from './sanity';
import {
  PUBLIC_POST_GROQ_FILTER,
  isPostPubliclyDistributed,
  type CreatorRef,
  type PlatformRef,
  type Post
} from './posts';

export type CreatorCompanyRef = {
  name: string;
  nameEn?: string;
  slug: string;
  type?: string | string[];
  platformType?: 'console' | 'computer' | 'arcade';
};

export type CreatorPortrait = {
  alt?: string;
  asset?: {
    url?: string;
  };
};

export type CreatorPlatformRef = PlatformRef & {
  logoLight?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };
};

export type Creator = {
  _id: string;
  name: string;
  slug: string;
  role?: string;
  creatorTypes?: string[];
  country?: string;
  countryEn?: string;
  countryCode?: string;
  activeYears?: string;
  activeYearsEn?: string;
  portrait?: CreatorPortrait;
  shortBio?: string;
  shortBioEn?: string;
  profile?: any[];
  profileEn?: any[];
  knownFor?: string[];
  companies?: string[];
  relatedCompanies?: CreatorCompanyRef[];
  relatedPlatforms?: CreatorPlatformRef[];
  relatedArticles?: Post[];
  featured?: boolean;
  sortOrder?: number;
  seoTitle?: string;
  seoTitleEn?: string;
  metaDescription?: string;
  metaDescriptionEn?: string;
};

const creatorFields = `
  _id,
  name,
  "slug": slug.current,
  role,
  creatorTypes,
  country,
  countryEn,
  countryCode,
  activeYears,
  activeYearsEn,

  portrait {
    alt,
    asset->{ url }
  },

  shortBio,
  shortBioEn,
  profile,
  profileEn,
  knownFor,
  companies,

  relatedCompanies[]->{
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current,
    type,
    "platformType": *[
      _type == "platform" &&
      manufacturer._ref == ^._id &&
      defined(platformType)
    ] | order(platformType asc)[0].platformType
  },

  featured,
  sortOrder,
  seoTitle,
  seoTitleEn,
  metaDescription,
  metaDescriptionEn,

  relatedPlatforms[]->{
    _id,
    name,
    "slug": slug.current,
    platformType,
    badgeLabel,

    logo {
      asset->{ url },
      alt
    },

    logoLight {
      asset->{ url },
      alt
    },

    manufacturer->{
      name,
      nameEn,
      "slug": slug.current,
      logo {
        asset->{ url },
        alt
      }
    }
  },

  relatedArticles[]->{
    _id,
    title,
    "slug": slug.current,
    excerpt,
    cardExcerpt,
    subtitle,
    type,
    isPublic,
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

    platforms[]->{
      _id,
      name,
      "slug": slug.current,
      platformType,
      badgeLabel
    },

    gameInfo {
      releaseYear,
      cover {
        alt,
        asset->{ url }
      }
    },

    rating {
      overall
    }
  }
`;

const creatorRefFields = `
  _id,
  name,
  "slug": slug.current,
  role,
  roleEn,
  portrait {
    alt,
    asset->{ url }
  }
`;

const articleCardFields = `
  _id,
  title,
  "slug": slug.current,
  excerpt,
  cardExcerpt,
  subtitle,
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

  platforms[]->{
    _id,
    name,
    "slug": slug.current,
    platformType,
    badgeLabel
  },

  gameInfo {
    releaseYear,
    cover {
      alt,
      asset->{ url }
    }
  },

  rating {
    overall
  }
`;

export async function getAllCreators(): Promise<Creator[]> {
  const data = await client.fetch(`
    *[
      _type == "creator" &&
      defined(slug.current) &&
      !(_id in path("drafts.**"))
    ] | order(coalesce(sortOrder, 9999) asc, featured desc, name asc) {
      ${creatorFields}
    }
  `);

  return data || [];
}

export async function getCreatorBySlug(slug: string | undefined): Promise<Creator | null> {
  if (!slug) return null;

  const data = await client.fetch(`
    *[
      _type == "creator" &&
      slug.current == $slug &&
      !(_id in path("drafts.**"))
    ][0] {
      ${creatorFields}
    }
  `, { slug });

  return data || null;
}

export async function getArticlesReferencingCreator(
  creatorId: string | undefined,
  lang: 'it' | 'en' = 'it'
): Promise<Post[]> {
  if (!creatorId) return [];

  const languageFilter =
    lang === 'en'
      ? 'language == "en"'
      : 'coalesce(language, "it") == "it"';

  const data = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current) &&
      ${PUBLIC_POST_GROQ_FILTER} &&
      !(_id in path("drafts.**")) &&
      ${languageFilter} &&
      references($creatorId)
    ] | order(coalesce(publishedAt, _createdAt) desc) {
      ${articleCardFields}
    }
  `, { creatorId });

  return data || [];
}

export async function getCreatorsReferencingArticle(
  articleId: string | undefined
): Promise<CreatorRef[]> {
  if (!articleId) return [];

  const data = await client.fetch(`
    *[
      _type == "creator" &&
      defined(slug.current) &&
      !(_id in path("drafts.**")) &&
      references($articleId)
    ] | order(coalesce(sortOrder, 9999) asc, name asc) {
      ${creatorRefFields}
    }
  `, { articleId });

  return data || [];
}

function normalizeId(value?: string) {
  return value?.replace(/^drafts\./, '') || '';
}

function getCreatorKey(creator: CreatorRef) {
  return normalizeId(creator?._id) || creator?.slug || '';
}

function getArticleKey(post: Post) {
  return normalizeId(post?._id) || post?.slug || '';
}

function collectCreatorLinksFromBlocks(blocks: any[] = []): CreatorRef[] {
  return blocks.flatMap((block) => {
    if (!block) return [];

    const markDefCreators = (block.markDefs || [])
      .filter((def) => def?._type === 'creatorLink' && def.reference?.slug)
      .map((def) => def.reference);

    if (block._type === 'asideBox' && Array.isArray(block.content)) {
      return [
        ...markDefCreators,
        ...collectCreatorLinksFromBlocks(block.content)
      ];
    }

    return markDefCreators;
  });
}

export function getCreatorRefsFromPortableText(content: any[] = []): CreatorRef[] {
  return mergeCreatorRefs(collectCreatorLinksFromBlocks(content));
}

export function mergeCreatorRefs(...sources: Array<CreatorRef[] | undefined>): CreatorRef[] {
  const seen = new Set<string>();
  const merged: CreatorRef[] = [];

  for (const creator of sources.flatMap((source) => source || [])) {
    if (!creator?.name || !creator?.slug) continue;

    const key = getCreatorKey(creator);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    merged.push(creator);
  }

  return merged;
}

export function mergeCreatorRelatedArticles(
  manualArticles: Post[] = [],
  inverseArticles: Post[] = [],
  lang: 'it' | 'en' = 'it'
): Post[] {
  const seen = new Set<string>();
  const merged: Post[] = [];

  for (const post of [...manualArticles, ...inverseArticles]) {
    if (!post?.slug) continue;
    if (!isPostPubliclyDistributed(post)) continue;

    const postLang = post.language || 'it';
    if (lang === 'en' ? postLang !== 'en' : postLang === 'en') continue;

    const key = getArticleKey(post);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    merged.push(post);
  }

  return merged.sort((a, b) => {
    const aDate = new Date(a.publishedAt || 0).getTime();
    const bDate = new Date(b.publishedAt || 0).getTime();
    return bDate - aDate;
  });
}

export function countryCodeToFlag(code?: string): string {
  const normalized = code?.trim().toUpperCase();

  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) {
    return '';
  }

  return Array.from(normalized)
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}
