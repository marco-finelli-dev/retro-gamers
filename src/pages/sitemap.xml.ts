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
      loc: absoluteUrl('/articoli/'),
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
    }
  ];

  const postPages = posts
    .filter((post) => post?.slug && post?.type)
    .map((post) => ({
      loc: absoluteUrl(getPostUrl(post)),
      lastmod: post.publishedAt
        ? new Date(post.publishedAt).toISOString()
        : undefined,
      changefreq: post.type === 'news' ? 'monthly' : 'yearly',
      priority: post.type === 'review' ? '0.8' : '0.7'
    }));

  const platformPages = platforms
    .filter((platform) => platform?.slug && platform?.platformType)
    .map((platform) => ({
      loc: absoluteUrl(getPlatformUrl(platform)),
      changefreq: 'monthly',
      priority: '0.7'
    }));

  const urls = [
    ...staticPages,
    ...postPages,
    ...platformPages
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls.map(urlEntry).join('')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}