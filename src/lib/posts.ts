import { client } from './sanity';

// =========================
// TYPES
// =========================

export type TaxonomyRef = {
  name: string;
  slug: string;
  logo?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };
};

export type PlatformRef = {
  name: string;
  slug: string;
  platformType?: 'console' | 'computer' | 'arcade';
  badgeLabel?: string;
  manufacturer?: TaxonomyRef;
  cover?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };
  specs?: {
    year?: number;
    cpu?: string;
    ram?: string;
    gpu?: string;
    audio?: string;
    resolution?: string;
    media?: string;
  };
};

export type Post = {
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  type?: string;

  subtitle?: string;
  seoTitle?: string;

  featuredImage?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };

  categories?: TaxonomyRef[];

  platforms?: PlatformRef[];

  genres?: TaxonomyRef[];
  developers?: TaxonomyRef[];
  publishers?: TaxonomyRef[];
  manufacturer?: TaxonomyRef[];
  modes?: TaxonomyRef[];
  series?: TaxonomyRef[];
  editorialSeries?: TaxonomyRef[];
  relatedSeries?: TaxonomyRef[];

  rating?: {
    grafica?: number;
    sonoro?: number;
    giocabilita?: number;
    longevita?: number;
    overall?: number;
    summary?: string;
  };

  gameInfo?: {
    releaseYear?: number;
    mediaFormat?: string;
    cover?: {
      asset?: {
        url?: string;
      };
      alt?: string;
    };
  };

  [key: string]: any;
};

// =========================
// FETCH UNICO
// =========================

export async function getAllPosts(): Promise<Post[]> {
  const data = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current)
    ] | order(coalesce(publishedAt, _createdAt) desc){
      title,
      "slug": slug.current,
      excerpt,
      subtitle,
      seoTitle,
      publishedAt,
      type,

      featuredImage {
        asset->{ url },
        alt
      },

      categories[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

  platforms[]->{
  name,
  "slug": slug.current,
  platformType,
  badgeLabel,
  manufacturer->{
    name,
    "slug": slug.current,
    logo {
      asset->{ url },
      alt
    }
  },
  cover {
    asset->{ url },
    alt
  },
  specs
},

      genres[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      developers[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      publishers[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      manufacturer[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      modes[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      series[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      editorialSeries[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      relatedSeries[]->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      rating {
        grafica,
        sonoro,
        giocabilita,
        longevita,
        overall,
        summary
      },

      gameInfo {
        releaseYear,
        mediaFormat,
        cover {
          asset->{ url },
          alt
        }
      }
    }
  `);

  return data || [];
}

// =========================
// GROUPING
// =========================

export function groupPosts(posts: Post[] = []) {
  const normalized = posts.map((p) => ({
    ...p,
    score: p.rating?.overall ?? 0
  }));

  return {
    reviews: normalized.filter(p => p.type === 'review'),
    specials: normalized.filter(p => p.type === 'feature'),
    memories: normalized.filter(p => p.type === 'memories'),
    news: normalized.filter(p => p.type === 'news'),
    guides: normalized.filter(p => p.type === 'guide'),
    hardware: normalized.filter(p => p.type === 'hardware'),
  
    archive: normalized
      .filter(p =>
        ['feature', 'memories', 'review', 'guide'].includes(p.type || '')
      )
      .slice(0, 4),
  
    latest: normalized.slice(0, 6)
  };
}