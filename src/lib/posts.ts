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

  logo?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };

  manufacturer?: TaxonomyRef;

  cover?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };

  specs?: {
    year?: number;
    releaseYear?: number;
    cpu?: string;
    ram?: string;
    gpu?: string;
    graphics?: string;
    audio?: string;
    resolution?: string;
    media?: string;
  };
};

export type Monetization = {
  isAffiliate?: boolean;
  productType?: 'book' | 'hardware' | 'accessory' | 'software' | 'gadget' | 'service' | 'other';
  affiliateUrl?: string;
  affiliateLabel?: string;
  priceLabel?: string;
  disclaimer?: string;
  priority?: 'low' | 'medium' | 'high';
};

export type Post = {
  _id: string;

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

  monetization?: Monetization;

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

  score?: number;

  [key: string]: any;
};

// =========================
// FETCH UNICO
// =========================

export async function getAllPosts(): Promise<Post[]> {
  const data = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current) &&
      !(_id in path("drafts.**"))
    ] | order(coalesce(publishedAt, _createdAt) desc){
      _id,
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
        "name": coalesce(name, title),
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

  logo {
    asset->{ url },
    alt
  },

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

      monetization {
        isAffiliate,
        productType,
        affiliateUrl,
        affiliateLabel,
        priceLabel,
        disclaimer,
        priority
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
// GROUPING HOME — NO DUPLICATI
// =========================

function uniqueById(posts: Post[] = []) {
  const seen = new Set<string>();

  return posts.filter((post) => {
    if (!post?._id) return false;
    if (seen.has(post._id)) return false;

    seen.add(post._id);
    return true;
  });
}

function hasImage(post: Post) {
  return Boolean(post.featuredImage?.asset?.url);
}

function takeUnused(
  source: Post[],
  usedIds: Set<string>,
  limit: number,
  options: { requireImage?: boolean } = {}
) {
  const requireImage = options.requireImage ?? false;
  const picked: Post[] = [];

  for (const post of source) {
    if (!post?._id) continue;
    if (usedIds.has(post._id)) continue;
    if (requireImage && !hasImage(post)) continue;

    picked.push(post);
    usedIds.add(post._id);

    if (picked.length >= limit) break;
  }

  return picked;
}

function isAffiliateHardwareArea(post: Post) {
  if (!post.monetization?.isAffiliate) return false;

  return [
    'hardware',
    'accessory',
    'book',
    'software',
    'gadget'
  ].includes(post.monetization.productType || '');
}

export function groupPosts(posts: Post[] = []) {
  const normalized = uniqueById(posts)
    .map((post) => ({
      ...post,
      score: post.rating?.overall ?? 0
    }));

  const usedIds = new Set<string>();

  const allWithImage = normalized.filter(hasImage);

  /*
    HERO:
    prende gli ultimi contenuti con immagine.
    Qui NON filtriamo per type, così la hero resta editoriale.
  */
  const hero = takeUnused(allWithImage, usedIds, 4, {
    requireImage: true
  });

  /*
    RECENSIONI:
    dopo la hero, niente duplicati.
  */
  const reviewsSource = normalized
    .filter((post) => post.type === 'review')
    .sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);

      if (scoreDiff !== 0) return scoreDiff;

      return new Date(b.publishedAt || 0).getTime() -
        new Date(a.publishedAt || 0).getTime();
    });

  const reviews = takeUnused(reviewsSource, usedIds, 6, {
    requireImage: true
  });

  /*
    EDITORIAL HUB:
    Speciali e memories separati.
  */
  const specials = takeUnused(
    normalized.filter((post) => post.type === 'feature'),
    usedIds,
    4,
    { requireImage: true }
  );

  const memories = takeUnused(
    normalized.filter((post) => post.type === 'memories'),
    usedIds,
    3,
    { requireImage: true }
  );

  /*
    ARCHIVE STRIP:
    blocco editoriale misto, ma senza ripetere hero/reviews/specials/memories.
  */
    const archive = takeUnused(
      normalized.filter((post) =>
        ['feature', 'memories', 'review', 'guide', 'interview', 'article'].includes(post.type || '')
      ),
      usedIds,
      4,
      { requireImage: true }
    );

  /*
    HARDWARE:
    prende prima type hardware, poi contenuti affiliabili.
    Così THEA1200 sta in hardware, ma anche libri/prodotti possono popolare
    la sezione commerciale senza cambiare tipo editoriale.
  */
  const hardwareSource = uniqueById([
    ...normalized.filter((post) => post.type === 'hardware'),
    ...normalized.filter(isAffiliateHardwareArea)
  ]);

  const hardware = takeUnused(hardwareSource, usedIds, 4, {
    requireImage: true
  });

  /*
    NEWS:
    serve anche all'header/dropdown.
    Qui non usiamo usedIds? Dipende.
    Per header è meglio avere le news vere, anche se una è in hero.
    Per sezioni home invece useremo latest separato.
  */
  const news = normalized.filter((post) => post.type === 'news');

  /*
    LATEST:
    ultimi contenuti non ancora usati nella home.
  */
  const latest = takeUnused(normalized, usedIds, 6, {
    requireImage: true
  });

  return {
    hero,
    reviews,
    specials,
    memories,
    news,
    guides: takeUnused(
      normalized.filter((post) => post.type === 'guide'),
      usedIds,
      3,
      { requireImage: false }
    ),
    hardware,
    archive,
    latest,

    /*
      Liste complete utili per header/layout o archivi.
    */
    all: normalized,
    allReviews: normalized.filter((post) => post.type === 'review'),
    allNews: normalized.filter((post) => post.type === 'news'),
    affiliate: normalized.filter((post) => post.monetization?.isAffiliate)
  };
}