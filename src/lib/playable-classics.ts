import { client } from './sanity';
export { getPlayableClassicUrl } from './routes.js';

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
  _type?: string;
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
  _type?: string;
  title: string;
  slug: string;
  type?: string;
  language?: PlayableClassicLang;
  excerpt?: string;
  cardExcerpt?: string;
  subtitle?: string;
  publishedAt?: string;
  categories?: PlayableClassicRef[];
  translationOf?: PlayableClassicPostRef;
  translatedVersions?: PlayableClassicPostRef[];
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
    translatedVersion?: PlayableClassicTranslationRef;
    translatedVersions?: PlayableClassicTranslationRef[];
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
  seoTitle?: string;
  metaDescription?: string;
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
  translatedVersions?: PlayableClassicTranslationRef[];
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

const relatedPostCoreFields = `
  _id,
  _type,
  title,
  "slug": slug.current,
  excerpt,
  cardExcerpt,
  subtitle,
  type,
  isPublic,
  language,
  publishedAt,
  categories[]->{
    _id,
    name,
    nameEn,
    "slug": slug.current
  },
  featuredImage {
    alt,
    asset->{ _id, url }
  }
`;

const relatedPostFields = `
  ${relatedPostCoreFields},
  translationOf->{ ${relatedPostCoreFields} },
  "translatedVersions": *[
    _type == "article" &&
    translationOf._ref == ^._id &&
    coalesce(isPublic, false) == true &&
    !(_id in path("drafts.**"))
  ]{ ${relatedPostCoreFields} }
`;

const playableClassicFields = `
  _id,
  _updatedAt,
  title,
  "slug": slug.current,
  language,
  subtitle,
  excerpt,
  seoTitle,
  metaDescription,
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
      translatedVersion->{
        _id,
        title,
        "slug": slug.current,
        language
      },
      "translatedVersions": *[
        _type == "emulatorTool" &&
        translatedVersion._ref == ^._id &&
        coalesce(isPublished, false) == true &&
        !(_id in path("drafts.**"))
      ]{
        _id,
        title,
        "slug": slug.current,
        language
      },
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
  "relatedPosts": *[
    _type == "article" &&
    _id in ^.relatedPosts[]._ref &&
    coalesce(isPublic, false) == true &&
    !(_id in path("drafts.**"))
  ]{ ${relatedPostFields} },
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
  },
  "translatedVersions": *[
    _type == "playableClassic" &&
    translatedVersion._ref == ^._id &&
    coalesce(isPublished, false) == true &&
    !(_id in path("drafts.**"))
  ]{
    _id,
    title,
    "slug": slug.current,
    language
  }
`;

const playableClassicHomeFields = `
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
  originalYear,
  originalPlatforms[]->{ ${platformFields} },
  legalStatus,
  distributionType,
  isPublished,
  featured,
  publishedAt
`;

const publicPlayableClassicFilter = `
  _type == "playableClassic" &&
  defined(slug.current) &&
  !(_id in path("drafts.**")) &&
  coalesce(isPublished, false) == true
`;

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

export async function getHomePlayableClassics(
  lang: PlayableClassicLang = 'it',
  limit = 4
): Promise<PlayableClassic[]> {
  const data = await client.fetch(
    `
      *[
        ${publicPlayableClassicFilter} &&
        coalesce(language, "it") == $lang
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc)[0...$limit] {
        ${playableClassicHomeFields}
      }
    `,
    { lang, limit }
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
