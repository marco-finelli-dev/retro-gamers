import { client } from './sanity';
import type { PlatformRef, Post } from './posts';

export type CreatorPortrait = {
  alt?: string;
  asset?: {
    url?: string;
  };
};

export type Creator = {
  _id: string;
  name: string;
  slug: string;
  role?: string;
  creatorTypes?: string[];
  country?: string;
  activeYears?: string;
  portrait?: CreatorPortrait;
  shortBio?: string;
  shortBioEn?: string;
  profile?: any[];
  profileEn?: any[];
  knownFor?: string[];
  companies?: string[];
  relatedPlatforms?: PlatformRef[];
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
  activeYears,

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
