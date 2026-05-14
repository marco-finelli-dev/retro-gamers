import { client } from './sanity';

// =========================
// TYPES
// =========================

export type TaxonomyRef = {
  name: string;
  nameEn?: string;
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
  affiliateDescription?: string;
  priceLabel?: string;
  disclaimer?: string;
  priority?: 'low' | 'medium' | 'high';
};

export type Post = {
  _id: string;

  title: string;
  slug: string;
  excerpt?: string;
  cardExcerpt?: string;
  publishedAt?: string;
  lastUpdated?: string;
  type?: string;

  language?: 'it' | 'en';

  translationOf?: {
    _id: string;
    title: string;
    slug: string;
    type?: string;
    language?: 'it' | 'en';
  };

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
    mediaFormat?: string[] | string;
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
      cardExcerpt,
      subtitle,
      seoTitle,
     publishedAt,
      lastUpdated,
      type,
      language,

      translationOf->{
        _id,
        title,
        "slug": slug.current,
        type,
        language
      },

      featuredImage {
        asset->{ url },
        alt
      },

      categories[]->{
        "name": coalesce(name, title),
        "nameEn": coalesce(nameEn, titleEn),
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
          nameEn,
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
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      developers[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      publishers[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      manufacturer[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      modes[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      series[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      editorialSeries[]->{
        name,
        nameEn,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      relatedSeries[]->{
        name,
        nameEn,
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
        affiliateDescription,
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
      language: post.language || 'it',
      score: post.rating?.overall ?? 0
    }));

  /*
    La home italiana deve restare italiana.
    Gli articoli inglesi avranno sezioni dedicate sotto /en/.
  */
  const italianPosts = normalized.filter((post) => post.language !== 'en');

  const usedIds = new Set<string>();

  const allWithImage = italianPosts.filter(hasImage);

  /*
    HERO:
    prende gli ultimi contenuti italiani con immagine.
    Qui NON filtriamo per type, così la hero resta editoriale.
  */
  const hero = takeUnused(allWithImage, usedIds, 4, {
    requireImage: true
  });

  /*
    RECENSIONI:
    dopo la hero, niente duplicati.
  */
  const reviewsSource = italianPosts
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
    italianPosts.filter((post) => post.type === 'feature'),
    usedIds,
    5,
    { requireImage: true }
  );

  const memories = takeUnused(
    italianPosts.filter((post) => post.type === 'memories'),
    usedIds,
    3,
    { requireImage: true }
  );

  /*
    ARCHIVE STRIP:
    blocco editoriale misto, ma senza ripetere hero/reviews/specials/memories.
  */
  const archive = takeUnused(
    italianPosts.filter((post) =>
      ['review', 'memories', 'guide', 'interview', 'article', 'feature'].includes(post.type || '')
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
    ...italianPosts.filter((post) => post.type === 'hardware'),
    ...italianPosts.filter(isAffiliateHardwareArea)
  ]);

  const hardware = takeUnused(hardwareSource, usedIds, 4, {
    requireImage: true
  });

  /*
    NEWS:
    serve anche all'header/dropdown.
    Per header è meglio avere tutte le news italiane vere.
  */
  const news = italianPosts.filter((post) => post.type === 'news');

  /*
    LATEST:
    ultimi contenuti italiani non ancora usati nella home.
  */
  const latest = takeUnused(italianPosts, usedIds, 6, {
    requireImage: true
  });

  return {
    hero,
    reviews,
    specials,
    memories,
    news,
    guides: takeUnused(
      italianPosts.filter((post) => post.type === 'guide'),
      usedIds,
      3,
      { requireImage: false }
    ),
    hardware,
    archive,
    latest,

    /*
      Liste complete utili per header/layout o archivi.
      Per ora sono italiane, perché il sito principale resta italiano.
    */
    all: italianPosts,
    allReviews: italianPosts.filter((post) => post.type === 'review'),
    allNews: italianPosts.filter((post) => post.type === 'news'),
    affiliate: italianPosts.filter((post) => post.monetization?.isAffiliate),

    /*
      Liste globali utili per la futura sezione inglese.
    */
    allLanguages: normalized,
    english: normalized.filter((post) => post.language === 'en')
  };
}

export function getRelatedPosts(
  currentPost: Post,
  posts: Post[] = [],
  limit = 3
): Post[] {
  if (!currentPost?._id) return [];

  const currentLanguage = currentPost.language || 'it';

  const currentPlatformSlugs = new Set(
    currentPost.platforms?.map((item) => item.slug).filter(Boolean)
  );

  const currentCategorySlugs = new Set(
    currentPost.categories?.map((item) => item.slug).filter(Boolean)
  );

  const currentGenreSlugs = new Set(
    currentPost.genres?.map((item) => item.slug).filter(Boolean)
  );

  const currentDeveloperSlugs = new Set(
    currentPost.developers?.map((item) => item.slug).filter(Boolean)
  );

  const scorePost = (post: Post) => {
    let score = 0;

    if (!post?._id || post._id === currentPost._id) return -999;

    /*
      Articoli correlati nella stessa lingua.
      Così un articolo inglese non pesca roba italiana e viceversa.
    */
    if ((post.language || 'it') !== currentLanguage) return -999;

    if (post.type === currentPost.type) score += 5;

    if (
      post.platforms?.some((item) =>
        currentPlatformSlugs.has(item.slug)
      )
    ) {
      score += 4;
    }

    if (
      post.categories?.some((item) =>
        currentCategorySlugs.has(item.slug)
      )
    ) {
      score += 3;
    }

    if (
      post.genres?.some((item) =>
        currentGenreSlugs.has(item.slug)
      )
    ) {
      score += 2;
    }

    if (
      post.developers?.some((item) =>
        currentDeveloperSlugs.has(item.slug)
      )
    ) {
      score += 2;
    }

    if (post.featuredImage?.asset?.url) score += 1;

    return score;
  };

  return posts
    .filter((post) => post?._id && post._id !== currentPost._id)
    .map((post) => ({
      post,
      relatedScore: scorePost(post)
    }))
    .filter((item) => item.relatedScore > 0)
    .sort((a, b) => {
      if (b.relatedScore !== a.relatedScore) {
        return b.relatedScore - a.relatedScore;
      }

      return (
        new Date(b.post.publishedAt || 0).getTime() -
        new Date(a.post.publishedAt || 0).getTime()
      );
    })
    .slice(0, limit)
    .map((item) => item.post);
}