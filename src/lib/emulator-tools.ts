import { client } from './sanity';

export type EmulatorToolLang = 'it' | 'en';

export type EmulatorToolImage = {
  alt?: string;
  asset?: {
    _id?: string;
    url?: string;
  };
};

export type EmulatorToolRef = {
  _id?: string;
  _type?: string;
  title?: string;
  name?: string;
  nameEn?: string;
  slug?: string;
  language?: EmulatorToolLang;
  type?: string | string[];
  platformType?: string;
  badgeLabel?: string;
  manufacturer?: EmulatorToolRef;
  coverImage?: EmulatorToolImage;
  featuredImage?: EmulatorToolImage;
  excerpt?: string;
  subtitle?: string;
  cardExcerpt?: string;
  categories?: EmulatorToolRef[];
  translationOf?: EmulatorToolRef;
  translatedVersions?: EmulatorToolRef[];
  originalPlatforms?: EmulatorToolRef[];
  publishedAt?: string;
};

export type EmulatorToolTranslationRef = {
  _id?: string;
  title?: string;
  slug?: string;
  language?: EmulatorToolLang;
};

export type EmulatorTool = {
  _id: string;
  title: string;
  slug: string;
  language?: EmulatorToolLang;
  subtitle?: string;
  excerpt?: string;
  seoTitle?: string;
  metaDescription?: string;
  coverImage?: EmulatorToolImage;
  toolType?: string;
  licenseType?: string;
  licenseNotes?: string;
  officialWebsite?: string;
  officialDownloadUrl?: string;
  sourceCodeUrl?: string;
  documentationUrl?: string;
  supportedHostSystems?: string[];
  emulatedSystems?: EmulatorToolRef[];
  body?: any[];
  setupInstructions?: any[];
  technicalNotes?: string;
  relatedPlayableClassics?: EmulatorToolRef[];
  relatedPosts?: EmulatorToolRef[];
  relatedPlatforms?: EmulatorToolRef[];
  publishedAt?: string;
  featured?: boolean;
  isPublished?: boolean;
  translatedVersion?: EmulatorToolTranslationRef;
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

const platformFields = `
  _id,
  name,
  "nameEn": coalesce(nameEn, name),
  "slug": slug.current,
  platformType,
  badgeLabel,
  manufacturer->{
    _id,
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current
  }
`;

const playableClassicFields = `
  _id,
  _type,
  title,
  "slug": slug.current,
  language,
  subtitle,
  excerpt,
  coverImage {
    alt,
    asset->{ _id, url }
  },
  originalPlatforms[]->{ ${platformFields} }
`;

const relatedPostCoreFields = `
  _id,
  _type,
  title,
  "slug": slug.current,
  type,
  language,
  subtitle,
  excerpt,
  cardExcerpt,
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
    !(_id in path("drafts.**"))
  ]{ ${relatedPostCoreFields} }
`;

const emulatorToolFields = `
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
    alt,
    asset->{ _id, url }
  },
  toolType,
  licenseType,
  licenseNotes,
  officialWebsite,
  officialDownloadUrl,
  sourceCodeUrl,
  documentationUrl,
  supportedHostSystems,
  emulatedSystems[]->{ ${platformFields} },
  body[]{ ${portableTextProjection} },
  setupInstructions[]{ ${portableTextProjection} },
  technicalNotes,
  relatedPlayableClassics[]->{ ${playableClassicFields} },
  relatedPosts[]->{ ${relatedPostFields} },
  relatedPlatforms[]->{ ${platformFields} },
  publishedAt,
  featured,
  isPublished,
  translatedVersion->{
    _id,
    title,
    "slug": slug.current,
    language
  }
`;

const emulatorToolHomeFields = `
  _id,
  _updatedAt,
  title,
  "slug": slug.current,
  language,
  subtitle,
  excerpt,
  coverImage {
    alt,
    asset->{ _id, url }
  },
  toolType,
  licenseType,
  publishedAt,
  featured,
  isPublished
`;

const emulatorToolBaseFilter = `
  _type == "emulatorTool" &&
  defined(slug.current) &&
  !(_id in path("drafts.**"))
`;

const publishedEmulatorToolFilter = `
  ${emulatorToolBaseFilter} &&
  coalesce(isPublished, false) == true
`;

export function getEmulatorToolUrl(
  item: Pick<EmulatorTool, 'slug' | 'language'>,
  lang: EmulatorToolLang = item.language || 'it'
) {
  if (!item?.slug) {
    return lang === 'en' ? '/en/emulators/' : '/emulatori/';
  }

  return lang === 'en'
    ? `/en/emulators/${item.slug}/`
    : `/emulatori/${item.slug}/`;
}

export async function getAllEmulatorTools(
  lang?: EmulatorToolLang
): Promise<EmulatorTool[]> {
  const languageFilter = lang ? '&& coalesce(language, "it") == $lang' : '';
  const data = await client.fetch(
    `
      *[
        ${emulatorToolBaseFilter}
        ${languageFilter}
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc) {
        ${emulatorToolFields}
      }
    `,
    { lang }
  );

  return data || [];
}

export async function getPublishedEmulatorTools(
  lang: EmulatorToolLang = 'it'
): Promise<EmulatorTool[]> {
  const data = await client.fetch(
    `
      *[
        ${publishedEmulatorToolFilter} &&
        coalesce(language, "it") == $lang
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc) {
        ${emulatorToolFields}
      }
    `,
    { lang }
  );

  return data || [];
}

export async function getHomeEmulatorTools(
  lang: EmulatorToolLang = 'it',
  limit = 4
): Promise<EmulatorTool[]> {
  const data = await client.fetch(
    `
      *[
        ${publishedEmulatorToolFilter} &&
        coalesce(language, "it") == $lang
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc)[0...$limit] {
        ${emulatorToolHomeFields}
      }
    `,
    { lang, limit }
  );

  return data || [];
}

export async function getEmulatorToolBySlug(
  slug: string,
  lang: EmulatorToolLang = 'it'
): Promise<EmulatorTool | null> {
  if (!slug) return null;

  const data = await client.fetch(
    `
      *[
        ${publishedEmulatorToolFilter} &&
        slug.current == $slug &&
        coalesce(language, "it") == $lang
      ][0] {
        ${emulatorToolFields}
      }
    `,
    { slug, lang }
  );

  return data || null;
}

export async function getEmulatorToolSlugs(): Promise<EmulatorTool[]> {
  const data = await client.fetch(`
    *[
      ${publishedEmulatorToolFilter}
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
