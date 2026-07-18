import { client } from './sanity';
import {
  PUBLIC_POST_GROQ_FILTER,
  type PlatformRef,
  type Post
} from './posts';
export { getCompanyUrl } from './routes.js';

export type CompanyType = 'developer' | 'publisher' | 'manufacturer';

export type CompanyImage = {
  alt?: string;
  asset?: {
    url?: string;
  };
};

export type CompanyCreator = {
  _id?: string;
  name: string;
  slug: string;
  role?: string;
  roleEn?: string;
  portrait?: CompanyImage;
};

export type CompanyPlatform = PlatformRef & {
  logoLight?: CompanyImage;
};

export type Company = {
  _id: string;
  name: string;
  nameEn?: string;
  slug: string;
  type?: CompanyType[];
  logo?: CompanyImage;
  logoLight?: CompanyImage;
  description?: string;
  descriptionEn?: string;
  history?: string;
  historyEn?: string;
  seoTitle?: string;
  seoTitleEn?: string;
  metaDescription?: string;
  metaDescriptionEn?: string;
  relatedArticles?: Post[];
  relatedCreators?: CompanyCreator[];
  relatedPlatforms?: CompanyPlatform[];
};

export const companyTypeLabels = {
  it: {
    developer: 'Sviluppatore',
    publisher: 'Publisher',
    manufacturer: 'Produttore',
  },
  en: {
    developer: 'Developer',
    publisher: 'Publisher',
    manufacturer: 'Manufacturer',
  },
};

export function getCompanyName(company: Company, lang = 'it') {
  return lang === 'en'
    ? company.nameEn || company.name
    : company.name;
}

export function getCompanyDescription(company: Company, lang = 'it') {
  return lang === 'en'
    ? company.descriptionEn || company.description || ''
    : company.description || '';
}

const postFields = `
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

const platformFields = `
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

  cover {
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
    },
    logoLight {
      asset->{ url },
      alt
    }
  },

  specs
`;

const companyFields = `
  _id,
  name,
  nameEn,
  "slug": slug.current,
  type,
  description,
  descriptionEn,
  history,
  historyEn,
  seoTitle,
  seoTitleEn,
  metaDescription,
  metaDescriptionEn,

  logo {
    asset->{ url },
    alt
  },

  logoLight {
    asset->{ url },
    alt
  },

  "relatedArticles": *[
    _type == "article" &&
    ${PUBLIC_POST_GROQ_FILTER} &&
    !(_id in path("drafts.**")) &&
    (
      ^._id in developers[]._ref ||
      ^._id in publishers[]._ref ||
      ^._id in manufacturer[]._ref
    )
  ] | order(coalesce(publishedAt, _createdAt) desc) {
    ${postFields}
  },

  "relatedCreators": *[
    _type == "creator" &&
    !(_id in path("drafts.**")) &&
    ^._id in relatedCompanies[]._ref
  ] | order(coalesce(sortOrder, 9999) asc, name asc) {
    _id,
    name,
    "slug": slug.current,
    role,
    roleEn,
    portrait {
      asset->{ url },
      alt
    }
  },

  "relatedPlatforms": *[
    _type == "platform" &&
    !(_id in path("drafts.**")) &&
    manufacturer._ref == ^._id
  ] | order(platformType asc, name asc) {
    ${platformFields}
  }
`;

export async function getAllCompanies(): Promise<Company[]> {
  const data = await client.fetch(`
    *[
      _type == "taxonomy" &&
      defined(slug.current) &&
      count(type[@ in ["developer", "publisher", "manufacturer"]]) > 0 &&
      !(_id in path("drafts.**"))
    ] | order(name asc) {
      ${companyFields}
    }
  `);

  return data || [];
}

export async function getCompanyBySlug(slug: string | undefined): Promise<Company | null> {
  if (!slug) return null;

  const data = await client.fetch(`
    *[
      _type == "taxonomy" &&
      slug.current == $slug &&
      count(type[@ in ["developer", "publisher", "manufacturer"]]) > 0 &&
      !(_id in path("drafts.**"))
    ][0] {
      ${companyFields}
    }
  `, { slug });

  return data || null;
}
