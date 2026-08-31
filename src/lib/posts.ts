import { client } from './sanity';

// =========================
// TYPES
// =========================

export type TaxonomyRef = {
  _id?: string;
  name: string;
  nameEn?: string;
  slug: string;
  description?: string;
  descriptionEn?: string;
  logo?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };
  logoLight?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };
};

export type PlatformRef = {
  _id?: string;
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
    cpuEn?: string;
    ram?: string;
    ramEn?: string;
    gpu?: string;
    gpuEn?: string;
    graphics?: string;
    graphicsEn?: string;
    audio?: string;
    audioEn?: string;
    resolution?: string;
    resolutionEn?: string;
    media?: string;
    mediaEn?: string;
  };
};

export type CreatorRef = {
  _id?: string;
  name: string;
  slug: string;
  role?: string;
  roleEn?: string;
  portrait?: {
    asset?: {
      url?: string;
    };
    alt?: string;
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
  promoteOnUpdate?: boolean;
  featuredUntil?: string;
  type?: string;
  isPublic?: boolean;

  language?: 'it' | 'en';

  translationOf?: {
    _id: string;
    title: string;
    slug: string;
    type?: string;
    language?: 'it' | 'en';
  };

  author?: {
    name?: string;
    nickname?: string;
    displayName?: string;
    role?: 'editor' | 'contributor' | 'guest';
    slug?: string;
    image?: {
      asset?: {
        url?: string;
      };
      alt?: string;
    };
  };

  subtitle?: string;
  seoTitle?: string;
  aiTransparency?: 'none' | 'aiTranslation' | 'aiAssistedSections' | 'legacyAiAssisted';
  aiTransparencyNote?: string;

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
  creators?: CreatorRef[];

  monetization?: Monetization;

  rating?: {
    grafica?: number;
    sonoro?: number;
    giocabilita?: number;
    longevita?: number;
    overall?: number;
    summary?: string;
  };

  pros?: string[];
  cons?: string[];

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

/**
 * Public distribution is opt-out so articles created before `isPublic` was
 * introduced keep their historical public behaviour.
 */
export const PUBLIC_POST_GROQ_FILTER = 'coalesce(isPublic, true) == true';

export function isPostPubliclyDistributed(
  post: Pick<Post, 'isPublic'> | null | undefined
) {
  return post?.isPublic !== false;
}

// =========================
// FETCH UNICO
// =========================

export async function getAllPosts(): Promise<Post[]> {
  const data = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current) &&
      ${PUBLIC_POST_GROQ_FILTER} &&
      !(_id in path("drafts.**"))
    ] | order(coalesce(publishedAt, _createdAt) desc){
      _id,
      title,
      "slug": slug.current,
      excerpt,
      cardExcerpt,
      subtitle,
      seoTitle,
      aiTransparency,
      aiTransparencyNote,
      publishedAt,
      lastUpdated,
      promoteOnUpdate,
      featuredUntil,
      type,
      isPublic,
      language,

      translationOf->{
        _id,
        title,
        "slug": slug.current,
        type,
        language,
        isPublic
      },

      author->{
        name,
        nickname,
        displayName,
        role,
        "slug": slug.current,
        image {
          asset->{ url },
          alt
        }
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
        _id,
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
        _id,
        name,
        nameEn,
        "slug": slug.current,
        description,
        descriptionEn,
        logo {
          asset->{ url },
          alt
        },
        logoLight {
          asset->{ url },
          alt
        }
      },

      creators[]->{
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

      pros,
      cons,

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

export async function getPublicPostSummaries(): Promise<Post[]> {
  const data = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current) &&
      ${PUBLIC_POST_GROQ_FILTER} &&
      !(_id in path("drafts.**"))
    ] | order(coalesce(publishedAt, _createdAt) desc){
      _id,
      title,
      "slug": slug.current,
      publishedAt,
      type,
      isPublic,
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

      platforms[]->{
        name,
        "slug": slug.current,
        platformType,
        badgeLabel
      },

      genres[]->{
        name,
        nameEn,
        "slug": slug.current
      },

      developers[]->{
        name,
        nameEn,
        "slug": slug.current
      },

      rating {
        overall
      },

      gameInfo {
        releaseYear,
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

function getHomePostKey(post: Post) {
  return post?._id?.replace(/^drafts\./, '') || post?.slug || '';
}

function uniqueById(posts: Post[] = []) {
  const seen = new Set<string>();

  return posts.filter((post) => {
    const key = getHomePostKey(post);

    if (!key) return false;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function hasImage(post: Post) {
  return Boolean(post.featuredImage?.asset?.url);
}

function getHomeEditorialTimestamp(post: Post) {
  const date =
    post.promoteOnUpdate && post.lastUpdated
      ? post.lastUpdated
      : post.publishedAt;

  if (!date) return 0;

  const timestamp = new Date(date).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortPostsForHome(posts: Post[] = []) {
  return [...posts].sort(
    (a, b) =>
      getHomeEditorialTimestamp(b) -
      getHomeEditorialTimestamp(a)
  );
}

function isOlderThanDays(post: Post, days: number, today = new Date()) {
  if (!post.publishedAt) return false;

  const publishedTime = new Date(post.publishedAt).getTime();

  if (!Number.isFinite(publishedTime)) return false;

  const cutoffTime = today.getTime() - days * 24 * 60 * 60 * 1000;

  return publishedTime < cutoffTime;
}

const archiveEvergreenTypes = new Set([
  'review',
  'memories',
  'guide',
  'interview',
  'article',
  'feature',
  'special'
]);

function isArchiveEvergreenCandidate(post: Post) {
  return archiveEvergreenTypes.has(post.type || '') && post.type !== 'news';
}

function takeArchivePosts(source: Post[], usedIds: Set<string>, limit: number) {
  const evergreenSource = source.filter((post) =>
    isArchiveEvergreenCandidate(post) && isOlderThanDays(post, 14)
  );
  const picked = takeUnused(evergreenSource, usedIds, limit, {
    requireImage: true
  });

  if (picked.length >= limit) return picked;

  const fallback = takeUnused(
    source.filter(isArchiveEvergreenCandidate),
    usedIds,
    limit - picked.length,
    { requireImage: true }
  );

  return [...picked, ...fallback];
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
    const key = getHomePostKey(post);

    if (!key) continue;
    if (usedIds.has(key)) continue;
    if (requireImage && !hasImage(post)) continue;

    picked.push(post);
    usedIds.add(key);

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

export function getActiveFeaturedPost(posts: Post[] = [], today = new Date()) {
  const todayKey = today.toISOString().slice(0, 10);

  return posts
    .filter((post) => {
      const featuredUntil = String(post.featuredUntil || '').slice(0, 10);

      return /^\d{4}-\d{2}-\d{2}$/.test(featuredUntil) && featuredUntil >= todayKey;
    })
    .sort((a, b) => {
      const aFeaturedUntil = String(a.featuredUntil || '').slice(0, 10);
      const bFeaturedUntil = String(b.featuredUntil || '').slice(0, 10);
      const featuredUntilComparison = aFeaturedUntil.localeCompare(bFeaturedUntil);

      if (featuredUntilComparison !== 0) {
        return featuredUntilComparison;
      }

      return new Date(b.publishedAt || 0).getTime() -
        new Date(a.publishedAt || 0).getTime();
    })[0] || null;
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

    /*
    Per Hero e Latest un articolo aggiornato viene ripromosso
    soltanto quando la scelta editoriale è esplicita.
    */
    const homeEditorialPosts = sortPostsForHome(italianPosts);
    
    const usedIds = new Set<string>();
    
    const allWithImage = homeEditorialPosts.filter(hasImage);
    const featuredPost = getActiveFeaturedPost(italianPosts);
    
  /*
    HERO:
    prende gli ultimi contenuti italiani con immagine.
    Qui NON filtriamo per type, così la hero resta editoriale.
  */
  const hero: Post[] = [];

  if (featuredPost) {
    const featuredKey = getHomePostKey(featuredPost);

    hero.push(featuredPost);

    if (featuredKey) {
      usedIds.add(featuredKey);
    }
  }

  const remainingHeroSlots = Math.max(0, 4 - hero.length);

  if (remainingHeroSlots > 0) {
    hero.push(...takeUnused(allWithImage, usedIds, remainingHeroSlots, {
      requireImage: true
    }));
  }

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
    4,
    { requireImage: true }
  );

  const interviews = takeUnused(
    italianPosts.filter((post) => post.type === 'interview'),
    usedIds,
    3
  );

  /*
    ARCHIVE STRIP:
    blocco editoriale misto, ma senza ripetere hero/reviews/specials/memories/interviews.
  */
  const archive = takeArchivePosts(italianPosts, usedIds, 4);

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
    const latest = takeUnused(homeEditorialPosts, usedIds, 6, {
      requireImage: true
    });

  return {
    hero,
    reviews,
    specials,
    memories,
    interviews,
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
    if (!isPostPubliclyDistributed(post)) return -999;

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
