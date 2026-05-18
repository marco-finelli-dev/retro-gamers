import { getAllPosts } from '../lib/posts';
import { getPostUrl } from '../lib/routes';
import {
  getAllPlatforms,
  getPlatformUrl
} from '../lib/platforms';

const SITE_URL = 'https://www.retro-gamers.it';

function absoluteUrl(path = '') {
  if (path.startsWith('http')) return path;

  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({
  loc,
  lastmod,
  changefreq = 'weekly',
  priority = '0.7'
}: {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}) {
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function getEnglishPlatformType(platformType?: string) {
  const typeMap: Record<string, string> = {
    console: 'consoles',
    computer: 'computers',
    arcade: 'arcade'
  };

  return platformType ? typeMap[platformType] || platformType : '';
}

function getEnglishPlatformUrl(platform: any) {
  const type = getEnglishPlatformType(platform.platformType);
  const manufacturerSlug = platform.manufacturer?.slug;
  const platformSlug = platform.slug;

  if (!type || !manufacturerSlug || !platformSlug) {
    return '/en/platforms/';
  }

  return `/en/platforms/${type}/${manufacturerSlug}/${platformSlug}/`;
}

function getPostLastmod(post: any) {
  const lastmodSource =
    post.lastUpdated ||
    post.updatedAt ||
    post._updatedAt ||
    post.publishedAt;

  return lastmodSource
    ? new Date(lastmodSource).toISOString()
    : undefined;
}

export async function GET() {
  const posts = await getAllPosts();
  const platforms = await getAllPlatforms();

  const staticPages = [
    {
      loc: absoluteUrl('/'),
      changefreq: 'daily',
      priority: '1.0'
    },
    {
      loc: absoluteUrl('/recensioni/'),
      changefreq: 'weekly',
      priority: '0.9'
    },
    {
      loc: absoluteUrl('/news/'),
      changefreq: 'daily',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/speciali/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/guide/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/memories/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/interviste/'),
      changefreq: 'monthly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/hardware/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/archivio/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/piattaforme/console/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/computer/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/arcade/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/autori/marco-finelli/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/chi-siamo/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/collaborazioni/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/contatti/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/privacy-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },
    {
      loc: absoluteUrl('/cookie-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },

    {
      loc: absoluteUrl('/en/'),
      changefreq: 'daily',
      priority: '0.9'
    },
    {
      loc: absoluteUrl('/en/reviews/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/news/'),
      changefreq: 'daily',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/features/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/guides/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/memories/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/interviews/'),
      changefreq: 'monthly',
      priority: '0.6'
    },
    {
      loc: absoluteUrl('/en/hardware/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/archive/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/platforms/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/platforms/consoles/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/platforms/computers/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/platforms/arcade/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/authors/marco-finelli/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/en/about/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/collaborations/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/contact/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/privacy-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },
    {
      loc: absoluteUrl('/en/cookie-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    }
  ];

  const postPages = posts
    .filter((post) => post?.slug && post?.type)
    .map((post) => ({
      loc: absoluteUrl(getPostUrl(post)),
      lastmod: getPostLastmod(post),
      changefreq: post.type === 'news' ? 'monthly' : 'yearly',
      priority: post.type === 'review' ? '0.8' : '0.7'
    }));

  const platformPagesIt = platforms
    .filter((platform) => platform?.slug && platform?.platformType)
    .map((platform) => ({
      loc: absoluteUrl(getPlatformUrl(platform)),
      changefreq: 'monthly',
      priority: '0.7'
    }));

  const platformPagesEn = platforms
    .filter((platform) => platform?.slug && platform?.platformType)
    .map((platform) => ({
      loc: absoluteUrl(getEnglishPlatformUrl(platform)),
      changefreq: 'monthly',
      priority: '0.7'
    }));

  const categorySlugsIt = new Set<string>();
  const categorySlugsEn = new Set<string>();

  posts.forEach((post: any) => {
    const categories = post.categories || [];

    categories.forEach((category: any) => {
      if (!category?.slug) return;

      if (post.language === 'en') {
        categorySlugsEn.add(category.slug);
      } else {
        categorySlugsIt.add(category.slug);
      }
    });
  });

  const categoryPagesIt = Array.from(categorySlugsIt).map((slug) => ({
    loc: absoluteUrl(`/categorie/${slug}/`),
    changefreq: 'weekly',
    priority: '0.6'
  }));

  const categoryPagesEn = Array.from(categorySlugsEn).map((slug) => ({
    loc: absoluteUrl(`/en/categories/${slug}/`),
    changefreq: 'weekly',
    priority: '0.6'
  }));

  const urls = [
    ...staticPages,
    ...postPages,
    ...platformPagesIt,
    ...platformPagesEn,
    ...categoryPagesIt,
    ...categoryPagesEn
  ];

  const uniqueUrls = Array.from(
    new Map(urls.map((item) => [item.loc, item])).values()
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${uniqueUrls.map(urlEntry).join('')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}