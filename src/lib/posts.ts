import { client } from './sanity';

// =========================
// TYPES
// =========================

export type Post = {
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt?: string;
  type?: string;

  featuredImage?: {
    asset?: {
      url?: string;
    };
  };

  rating?: {
    overall?: number;
  };

  gameInfo?: {
    releaseYear?: number;
  };

  platforms?: {
    name: string;
    slug: string;
  }[];

  developers?: {
    name: string;
    slug: string;
  }[];

  // 👇 fallback per evitare rotture future
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
    publishedAt,
    type,

    featuredImage {
      asset->{ url }
    },

    rating {
      overall
    },

    gameInfo {
      releaseYear
    },

    platforms[]->{
      name,
      "slug": slug.current
    },

    developers[]->{
      name,
      "slug": slug.current
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
    latest: normalized.slice(0, 6)
  };
}