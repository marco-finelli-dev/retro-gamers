import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { urlFor } from '../../../../lib/image.js';
import { getPostUrl } from '../../../../lib/routes.js';
import { client } from '../../../../lib/sanity.js';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';

type NewsletterContentSearchType = 'review' | 'feature' | 'guide' | 'news';

type SanityNewsletterContent = {
  _id: string;
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  cardExcerpt?: string | null;
  subtitle?: string | null;
  type?: string | null;
  language?: 'it' | 'en' | string | null;
  featuredImage?: {
    asset?: {
      url?: string | null;
    } | null;
    alt?: string | null;
  } | null;
};

const allowedTypes = new Set<NewsletterContentSearchType>(['review', 'feature', 'guide', 'news']);
const siteUrl = String(import.meta.env.PUBLIC_SITE_URL || 'https://www.retro-gamers.it').replace(/\/$/, '');

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const normalizeLang = (value?: string | null) =>
  value === 'en' ? 'en' : 'it';

const normalizeType = (value?: string | null): NewsletterContentSearchType | '' => {
  const normalized = String(value || '').trim() as NewsletterContentSearchType;

  return allowedTypes.has(normalized) ? normalized : '';
};

const normalizeQuery = (value?: string | null) =>
  String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);

const buildSearchPattern = (query: string) =>
  query
    .split(/\s+/)
    .map((term) => `${term}*`)
    .join(' ');

const toAbsoluteUrl = (value?: string | null) => {
  const rawUrl = String(value || '').trim();

  if (!rawUrl) return '';

  try {
    return new URL(rawUrl, siteUrl).toString();
  } catch {
    return '';
  }
};

const getImageUrl = (post: SanityNewsletterContent) => {
  if (!post.featuredImage?.asset) return null;

  try {
    return urlFor(post.featuredImage)
      .width(720)
      .height(420)
      .fit('crop')
      .quality(74)
      .auto('format')
      .url();
  } catch {
    return post.featuredImage.asset.url || null;
  }
};

const getStaffSession = async (cookies: any) => {
  const session = await getUserSessionFromCookies(cookies);

  if (!session.user || !isStaffProfile(session.profile)) {
    return null;
  }

  return session;
};

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getStaffSession(cookies);

  if (!session) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const query = normalizeQuery(url.searchParams.get('q'));
  const lang = normalizeLang(url.searchParams.get('lang'));
  const type = normalizeType(url.searchParams.get('type'));

  if (query.length < 2) {
    return json({ ok: true, items: [] });
  }

  const searchPattern = buildSearchPattern(query);

  try {
    const posts = await client.fetch<SanityNewsletterContent[]>(`
      *[
        _type == "article" &&
        defined(slug.current) &&
        !(_id in path("drafts.**")) &&
        (
          ($lang == "en" && language == "en") ||
          ($lang != "en" && (!defined(language) || language != "en"))
        ) &&
        (!defined($type) || type == $type) &&
        (
          title match $searchPattern ||
          slug.current match $searchPattern ||
          excerpt match $searchPattern ||
          cardExcerpt match $searchPattern ||
          subtitle match $searchPattern
        )
      ] | order(coalesce(publishedAt, _createdAt) desc)[0...10] {
        _id,
        title,
        "slug": slug.current,
        excerpt,
        cardExcerpt,
        subtitle,
        type,
        language,
        featuredImage {
          alt,
          asset->{ url }
        }
      }
    `, {
      lang,
      type: type || null,
      searchPattern,
    });

    const items = (posts || [])
      .filter((post) => post._id && post.title && post.slug)
      .map((post) => {
        const normalizedPost = {
          ...post,
          type: post.type || type || 'feature',
          language: post.language === 'en' ? 'en' : 'it',
        };

        return {
          id: post._id,
          title: post.title || '',
          excerpt: post.cardExcerpt || post.excerpt || post.subtitle || '',
          url: toAbsoluteUrl(getPostUrl(normalizedPost)),
          imageUrl: getImageUrl(post),
          type: allowedTypes.has(normalizedPost.type as NewsletterContentSearchType)
            ? normalizedPost.type
            : type || 'feature',
          language: normalizedPost.language,
        };
      });

    return json({ ok: true, items });
  } catch (error) {
    logApiError('admin.newsletter.content-search', error);
    return json({ ok: false, error: 'Search unavailable' }, 500);
  }
};

export const ALL: APIRoute = async () =>
  json({ ok: false, error: 'Method not allowed' }, 405);
