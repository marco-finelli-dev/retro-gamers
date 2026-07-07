import { client } from './sanity';

export type PlayableClassicLang = 'it' | 'en';

export type PlayableClassicImage = {
  alt?: string;
  asset?: {
    _id?: string;
    url?: string;
  };
};

export type PlayableClassicRef = {
  _id?: string;
  name?: string;
  nameEn?: string;
  title?: string;
  slug?: string;
  type?: string | string[];
  platformType?: string;
  role?: string;
  roleEn?: string;
  badgeLabel?: string;
  manufacturer?: PlayableClassicRef;
  portrait?: PlayableClassicImage;
  logo?: PlayableClassicImage;
};

export type PlayableClassicPostRef = {
  _id: string;
  title: string;
  slug: string;
  type?: string;
  language?: PlayableClassicLang;
  excerpt?: string;
  cardExcerpt?: string;
  subtitle?: string;
  publishedAt?: string;
  featuredImage?: PlayableClassicImage;
};

export type PlayableClassicTranslationRef = {
  _id?: string;
  title?: string;
  slug?: string;
  language?: PlayableClassicLang;
};

export type PlayableClassicDownloadPackage = {
  packageId?: string;
  title?: string;
  platform?: PlayableClassicRef;
  packageType?: string;
  language?: string;
  packageVersion?: string;
  packageSize?: string;
  checksumSha256?: string;
  isActive?: boolean;
  requiresLogin?: boolean;
  notes?: string;
};

export type PlayableClassicRecommendedTool = {
  tool?: {
    _id?: string;
    title?: string;
    slug?: string;
    language?: PlayableClassicLang;
    toolType?: string;
    licenseType?: string;
    officialWebsite?: string;
    officialDownloadUrl?: string;
    coverImage?: PlayableClassicImage;
  };
  recommendedFor?: string;
  notes?: string;
  isPrimary?: boolean;
};

export type PlayableClassic = {
  _id: string;
  title: string;
  slug: string;
  language?: PlayableClassicLang;
  subtitle?: string;
  excerpt?: string;
  coverImage?: PlayableClassicImage;
  body?: any[];
  originalYear?: number;
  originalPlatforms?: PlayableClassicRef[];
  developer?: PlayableClassicRef[];
  publisher?: PlayableClassicRef[];
  genre?: PlayableClassicRef[];
  legalStatus?: string;
  distributionType?: string;
  verificationDate?: string;
  legalSourceUrl?: string;
  legalSourceLabel?: string;
  licenseNotes?: string;
  redistributionNotes?: string;
  downloadable?: boolean;
  requiresLogin?: boolean;
  downloadPackages?: PlayableClassicDownloadPackage[];
  recommendedTools?: PlayableClassicRecommendedTool[];
  setupInstructions?: any[];
  technicalNotes?: string;
  languageNotes?: string;
  relatedPosts?: PlayableClassicPostRef[];
  relatedPlatforms?: PlayableClassicRef[];
  relatedCompanies?: PlayableClassicRef[];
  relatedCreators?: PlayableClassicRef[];
  isPublished?: boolean;
  featured?: boolean;
  publishedAt?: string;
  translatedVersion?: PlayableClassicTranslationRef;
  _updatedAt?: string;
};

const portableTextProjection = `
  ...,
  markDefs[]{
    ...,
    href
  },
  _type == "image" => {
    ...,
    asset->{ _id, url }
  }
`;

const taxonomyFields = `
  _id,
  "name": coalesce(name, title),
  "nameEn": coalesce(nameEn, titleEn),
  "slug": slug.current,
  type,
  logo {
    asset->{ _id, url },
    alt
  }
`;

const platformFields = `
  _id,
  name,
  "slug": slug.current,
  platformType,
  badgeLabel,
  logo {
    asset->{ _id, url },
    alt
  },
  manufacturer->{
    _id,
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current
  }
`;

const creatorFields = `
  _id,
  name,
  "slug": slug.current,
  role,
  roleEn,
  portrait {
    asset->{ _id, url },
    alt
  }
`;

const relatedPostFields = `
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
    asset->{ _id, url }
  }
`;

const playableClassicFields = `
  _id,
  _updatedAt,
  title,
  "slug": slug.current,
  language,
  subtitle,
  excerpt,
  coverImage {
    asset->{ _id, url },
    alt
  },
  body[]{ ${portableTextProjection} },
  originalYear,
  originalPlatforms[]->{ ${platformFields} },
  developer[]->{ ${taxonomyFields} },
  publisher[]->{ ${taxonomyFields} },
  genre[]->{ ${taxonomyFields} },
  legalStatus,
  distributionType,
  verificationDate,
  legalSourceUrl,
  legalSourceLabel,
  licenseNotes,
  redistributionNotes,
  downloadable,
  requiresLogin,
  downloadPackages[]{
    "packageId": coalesce(packageId.current, packageId),
    title,
    platform->{ ${platformFields} },
    packageType,
    language,
    packageVersion,
    packageSize,
    checksumSha256,
    isActive,
    requiresLogin,
    notes
  },
  recommendedTools[]{
    recommendedFor,
    notes,
    isPrimary,
    tool->{
      _id,
      title,
      "slug": slug.current,
      language,
      toolType,
      licenseType,
      officialWebsite,
      officialDownloadUrl,
      coverImage {
        asset->{ _id, url },
        alt
      }
    }
  },
  setupInstructions[]{ ${portableTextProjection} },
  technicalNotes,
  languageNotes,
  relatedPosts[]->{ ${relatedPostFields} },
  relatedPlatforms[]->{ ${platformFields} },
  relatedCompanies[]->{ ${taxonomyFields} },
  relatedCreators[]->{ ${creatorFields} },
  isPublished,
  featured,
  publishedAt,
  translatedVersion->{
    _id,
    title,
    "slug": slug.current,
    language
  }
`;

const publicPlayableClassicFilter = `
  _type == "playableClassic" &&
  defined(slug.current) &&
  !(_id in path("drafts.**")) &&
  coalesce(isPublished, false) == true
`;

export function getPlayableClassicUrl(
  item: Pick<PlayableClassic, 'slug' | 'language'>,
  lang: PlayableClassicLang = item.language || 'it'
) {
  if (!item?.slug) {
    return lang === 'en' ? '/en/playable-classics/' : '/classici-giocabili-oggi/';
  }

  return lang === 'en'
    ? `/en/playable-classics/${item.slug}/`
    : `/classici-giocabili-oggi/${item.slug}/`;
}

export async function getPublishedPlayableClassics(
  lang: PlayableClassicLang = 'it'
): Promise<PlayableClassic[]> {
  const data = await client.fetch(
    `
      *[
        ${publicPlayableClassicFilter} &&
        coalesce(language, "it") == $lang
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc) {
        ${playableClassicFields}
      }
    `,
    { lang }
  );

  return data || [];
}

export async function getPlayableClassicBySlug(
  slug: string,
  lang: PlayableClassicLang = 'it'
): Promise<PlayableClassic | null> {
  if (!slug) return null;

  const data = await client.fetch(
    `
      *[
        ${publicPlayableClassicFilter} &&
        slug.current == $slug &&
        coalesce(language, "it") == $lang
      ][0] {
        ${playableClassicFields}
      }
    `,
    { slug, lang }
  );

  return data || null;
}

export async function getPlayableClassicRoutes(): Promise<PlayableClassic[]> {
  const data = await client.fetch(`
    *[
      ${publicPlayableClassicFilter}
    ] | order(coalesce(publishedAt, _createdAt) desc) {
      _id,
      _updatedAt,
      title,
      "slug": slug.current,
      language,
      publishedAt
    }
  `);

  return data || [];
}
